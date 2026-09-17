// Turns AJ Item Worth Wiki wikitext into raw entries: one per table column (item or color variant)
// with every text cell found under it.

export const clean = s => s
  .replace(/\{\{[^}]*\}\}/g, '')
  .replace(/\[\[(?:File|Image):[^\]]*\]\]/gi, '')
  .replace(/\[\[(?:[^\]|]*\|)?([^\]]*)\]\]/g, '$1')
  .replace(/\[https?:\S+\s([^\]]*)\]/g, '$1')
  .replace(/'''?/g, '')
  .replace(/<br\s*\/?>/gi, ' ')
  .replace(/<[^>]+>/g, ' ')
  .replace(/&nbsp;/g, ' ')
  .replace(/\s+/g, ' ')
  .trim();

// Inline {{Template}} calls whose template holds a table (e.g. {{2013UnoRims}}).
export function expandTemplates(text, templates) {
  return text.replace(/\{\{\s*([^|}\n]+?)\s*\}\}/g, (call, name) => {
    const t = templates[`Template:${name.trim()}`];
    return t && /\{\|/.test(t) ? `\n${t.replace(/<noinclude>[\s\S]*?(<\/noinclude>|$)/g, '')}\n` : call;
  });
}

const mask = s => s.replace(/\[\[[^\]]*\]\]|\{\{[^}]*\}\}/g, x => ''.repeat(x.length));

function splitCells(rowText) {
  const out = [];
  for (const ln of rowText.split('\n')) {
    if (!ln.trim()) continue;
    const m = ln.match(/^\s*([!|])(.*)$/);
    if (!m) { if (out.length) out[out.length - 1].raw += `\n${ln}`; continue; }
    if (m[1] === '|' && /^[}+]/.test(m[2])) continue;
    const hdr = m[1] === '!';
    const body = m[2], masked = mask(body);
    const sep = hdr ? /!!|\|\|/g : /\|\|/g;
    const parts = [];
    let last = 0, mm;
    while ((mm = sep.exec(masked))) { parts.push(body.slice(last, mm.index)); last = mm.index + 2; }
    parts.push(body.slice(last));
    for (let p of parts) {
      const idx = mask(p).indexOf('|');
      if (idx >= 0 && /=/.test(mask(p).slice(0, idx))) p = p.slice(idx + 1); // drop style="..." |
      out.push({ hdr, raw: p });
    }
  }
  return out;
}

const fileOf = raw => (raw.match(/\[\[(?:File|Image):([^|\]]+)/i) || [])[1]?.trim() || null;
const isImageRow = r => !!r && r.filter(c => fileOf(c.raw)).length >= Math.max(1, r.length / 2);

export function extractEntries(title, text) {
  const entries = [];
  const updated = (text.match(/Last Updated\s*:?\s*([A-Z][a-z]+ \d{1,2}(?:st|nd|rd|th)?,? \d{4})/) || [])[1] || '';
  const cats = [...text.matchAll(/\[\[Category:([^\]|]+)/g)].map(m => m[1].trim());
  const re = /(^==+[ \t]*([^=\n]+?)[ \t]*==+[ \t]*$)|(\{\|[\s\S]*?\n\|\})/gm;
  let heading = '', m;
  while ((m = re.exec(text))) {
    if (m[1]) { heading = clean(m[2]); continue; }
    const chunks = m[3].split(/\n\|-[^\n]*/);
    chunks[0] = chunks[0].split('\n').slice(1).join('\n');
    const rows = chunks.map(splitCells).filter(r => r.length);
    let headers = null, files = null;
    for (let i = 0; i < rows.length; i++) {
      const r = rows[i];
      if (r.every(c => c.hdr)) { headers = r.map(c => clean(c.raw)); files = null; continue; }
      if (!headers && !isImageRow(r) && isImageRow(rows[i + 1]) && r.length === rows[i + 1].length) { headers = r.map(c => clean(c.raw)); continue; }
      if (isImageRow(r)) { files = r.filter(c => !c.hdr).map(c => fileOf(c.raw)); continue; }
      if (r[0].hdr && r.length > 1 && !r.slice(1).some(c => c.hdr)) {
        entries.push({ page: title, heading, header: clean(r[0].raw), cells: r.slice(1).map(c => clean(c.raw)), file: null, updated, cats });
        continue;
      }
      if (!headers) continue;
      r.forEach((c, j) => {
        if (j < headers.length && headers[j]) entries.push({ page: title, heading, header: headers[j], cells: [clean(c.raw)], file: files?.[j] || null, updated, cats });
      });
    }
  }
  const merged = new Map();
  for (const e of entries) {
    const key = `${e.page}|${e.heading}|${e.header}`;
    if (!merged.has(key)) merged.set(key, { ...e, cells: [] });
    const t = merged.get(key);
    t.cells.push(...e.cells.filter(Boolean));
    if (!t.file && e.file) t.file = e.file;
  }
  return [...merged.values()];
}
