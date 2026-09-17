// Converts an AJ Item Worth Wiki worth string into a numeric range in Diamonds-equivalent (D).
// Ladder calibrated from the wiki's own spike pages (Diamonds rows next to spike labels).
export const LADDER = {
  'clothing beta': 1, 'den beta': 3, 'rim': 0.35,
  'short wrist': 15,
  'bad long wrist': 19, 'decent long wrist': 27.5, 'good long wrist': 32.5, 'black long wrist': 47.5,
  'bad short collar': 62.5, 'decent short collar': 77, 'good short collar': 110, 'black short collar': 170,
  'bad long collar': 160, 'decent long collar': 200, 'good long collar': 247.5, 'red long collar': 320,
  'black long collar': 475, 'variety': 475,
};
export const BL = LADDER['black long collar'];

const NUM = String.raw`(\d+(?:[.,]\d+)?)`;
const numRange = s => {
  const m = s.match(new RegExp(`^${NUM}(?:\\s*(?:-|–|to)\\s*${NUM})?`));
  if (!m) return null;
  const a = parseFloat(m[1].replace(',', '.')), b = m[2] ? parseFloat(m[2].replace(',', '.')) : a;
  return [a, b, m[0].length];
};

// unit phrase -> value per unit
function unitValue(u) {
  u = u.toLowerCase().replace(/[()]/g, ' ').replace(/\s+/g, ' ').trim()
    .replace(/s\b/g, '') // crude singularization: collars->collar, wrists->wrist, rims->rim
    .replace(/diamond/, 'diamond');
  if (/^diamond/.test(u)) return 1;
  if (/^gem/.test(u)) return null;
  if (/^(obtainable )?rim\b/.test(u) || /^rare item monday/.test(u)) return LADDER.rim;
  if (/^clothing beta/.test(u)) return LADDER['clothing beta'];
  if (/^den beta/.test(u)) return LADDER['den beta'];
  if (/^beta/.test(u)) return LADDER['den beta'];
  if (/^variety/.test(u)) return LADDER.variety;
  if (/^pure|^solid/.test(u)) return BL;
  const q = (u.match(/^(bad|decent|good|black|red|pink)\b/) || [])[1] || 'good';
  const len = /\blong\b/.test(u) ? 'long' : /\bshort\b/.test(u) ? 'short' : null;
  const kind = /collar|spike/.test(u) ? 'collar' : /wrist/.test(u) ? 'wrist' : null;
  if (!kind) return null;
  if (kind === 'wrist' && len !== 'long') return LADDER['short wrist'];
  const L = len || (kind === 'collar' ? 'long' : 'long');
  let key = `${q} ${L} ${kind}`;
  if (q === 'pink') key = L === 'long' ? 'black long collar' : 'good short collar';
  if (q === 'red' && !(L === 'long' && kind === 'collar')) key = `good ${L} ${kind}`;
  return LADDER[key] ?? null;
}

// parse one simple term: "3-4 Good Long Wrists", "A Few RIMs", "Black Long Collar", "Bad - Decent Long Wrist"
function term(s) {
  s = s.trim().replace(/^\|+\s*/, '').replace(/^(a|an|one)\s+/i, '1 ');
  if (!s) return null;
  let m;
  // "Black Short Collar - Bad Long Collar", "A Few Clothing Betas - 1 Den Beta"
  const dash = s.split(/\s+-\s+/);
  if (dash.length === 2 && /\s/.test(dash[0].trim())) {
    const a = term(dash[0]), b = term(dash[1]);
    if (a && b) return [Math.min(a[0], b[0]), Math.max(a[1], b[1])];
  }
  // "A Few X"
  if ((m = s.match(/^(?:1\s+)?few\s+(.+)$/i))) { const v = unitValue(m[1]); return v == null ? null : [3 * v, 4 * v]; }
  // label range "Bad - Decent Long Wrist", "Good - Black Short Collar", "Black Short Collar - Bad Long Collar"
  if ((m = s.match(/^(bad|decent|good|black|red)\s*-\s*(bad|decent|good|black|red)\s+(.+)$/i))) {
    const a = unitValue(`${m[1]} ${m[3]}`), b = unitValue(`${m[2]} ${m[3]}`);
    return a == null || b == null ? null : [Math.min(a, b), Math.max(a, b)];
  }
  const nr = numRange(s);
  if (nr) {
    const rest = s.slice(nr[2]).trim();
    if (!rest) return null;
    if (/^,\d{3}\s*gems?/i.test(rest)) return null;
    const v = unitValue(rest);
    return v == null ? null : [nr[0] * v, nr[1] * v];
  }
  const v = unitValue(s);
  return v == null ? null : [v, v];
}

export function parseWorth(raw) {
  const out = { lo: null, hi: null, flags: [] };
  if (!raw) return null;
  let s = raw.replace(/\s+/g, ' ').trim();
  const low = s.toLowerCase();
  if (/^(bad|decent|good|best|pink)$/.test(low)) return null;               // quality label row
  if (/hard to value|one in (existence|game)|two in (existence|game)|few in (existence|game)|under investigation/.test(low)) {
    out.flags.push('hard'); if (/under investigation/.test(low)) out.flags.push('investigation');
    const m = s.match(/(\d+(?:\.\d+)?(?:\s*-\s*\d+(?:\.\d+)?)?\s+[A-Za-z ]+(?:Collars?|Wrists?|Diamonds?))/);
    if (!m) return out;
    s = m[1];
  }
  if (/currently in stores|not much; in stores|consistently in and out of stores/.test(low)) {
    out.flags.push('stores');
    if (!/rim|diamond|beta/.test(low)) { out.lo = 0.2; out.hi = 0.6; return out; }
    s = s.replace(/.*;\s*/, '');
  }
  if (/minimum value/i.test(s)) { out.flags.push('min'); s = s.replace(/minimum value\s*:?\s*/i, ''); }
  if (/maybe more|usually more|sometimes more|or more|\+$/i.test(s)) out.flags.push('more');
  if (/maybe less|sometimes less|or less/i.test(s)) out.flags.push('less');
  s = s.replace(/,?\s*(maybe|usually|sometimes|or)\s+(more|less)\b.*$/i, '').replace(/\s+OR\s+.*$/, '').trim();
  // "A Few Clothing Betas - 1 Den Beta" (range between two different terms)
  let parts = s.split(/\s+\+\s+|\s+and\s+/i);
  let lo = 0, hi = 0;
  for (const p of parts) {
    let r = term(p);
    if (!r) {
      const rr = p.split(/\s+-\s+/);
      if (rr.length === 2) { const a = term(rr[0]), b = term(rr[1]); if (a && b) r = [Math.min(a[0], b[0]), Math.max(a[1], b[1])]; }
    }
    if (!r) return out.flags.length ? out : null;
    lo += r[0]; hi += r[1];
  }
  out.lo = +lo.toFixed(2); out.hi = +hi.toFixed(2);
  return out;
}
