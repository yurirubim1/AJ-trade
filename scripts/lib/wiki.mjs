// Downloads from the Fandom MediaWiki API (the HTML pages block bots, the API does not).
const UA = { 'User-Agent': 'AJTradeValue/1.0 (fan-made trade checker)' };

export const WORTH_API = 'https://aj-item-worth.fandom.com/api.php';
export const PTBR_API = 'https://animaljam.fandom.com/pt-br/api.php';

async function api(base, params, method = 'GET') {
  const body = new URLSearchParams({ format: 'json', formatversion: '2', ...params });
  for (let attempt = 1; ; attempt++) {
    try {
      const res = method === 'POST'
        ? await fetch(base, { method, headers: { ...UA, 'Content-Type': 'application/x-www-form-urlencoded' }, body })
        : await fetch(`${base}?${body}`, { headers: UA });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.json();
    } catch (err) {
      if (attempt >= 4) throw err;
      await new Promise(r => setTimeout(r, 1500 * attempt));
    }
  }
}

// All non-redirect pages of a namespace -> { title: wikitext }.
// Content arrives across continuation batches, so only overwrite when a batch carries it.
export async function fetchNamespace(base, namespace, onProgress = () => {}) {
  const pages = {};
  let cont = {};
  for (;;) {
    const j = await api(base, {
      action: 'query', generator: 'allpages', gapnamespace: String(namespace), gaplimit: '50',
      gapfilterredir: 'nonredirects', prop: 'revisions', rvprop: 'content', rvslots: 'main', ...cont,
    });
    for (const pg of j.query?.pages || []) {
      pages[pg.title] ??= '';
      const content = pg.revisions?.[0]?.slots?.main?.content;
      if (content) pages[pg.title] = content;
    }
    onProgress(Object.keys(pages).length);
    if (!j.continue) break;
    cont = j.continue;
  }
  return pages;
}

export async function fetchPage(base, title) {
  const j = await api(base, { action: 'parse', page: title, prop: 'wikitext' });
  return j.parse?.wikitext || '';
}

// File names -> image paths relative to static.wikia.nocookie.net/aj-item-worth/images/
export async function fetchImagePaths(fileNames, onProgress = () => {}) {
  const out = {};
  for (let i = 0; i < fileNames.length; i += 50) {
    const batch = fileNames.slice(i, i + 50);
    const j = await api(WORTH_API, {
      action: 'query', titles: batch.map(f => `File:${f}`).join('|'), prop: 'imageinfo', iiprop: 'url', redirects: '1',
    }, 'POST');
    const normalized = Object.fromEntries((j.query?.normalized || []).map(n => [n.to, n.from]));
    const redirectsTo = {};
    for (const r of j.query?.redirects || []) (redirectsTo[r.to] ||= []).push(r.from);
    for (const pg of j.query?.pages || []) {
      const url = pg.imageinfo?.[0]?.url;
      if (!url) continue;
      const path = url.replace(/^https:\/\/static\.wikia\.nocookie\.net\/aj-item-worth\/images\//, '').replace(/\/revision\/.*$/, '');
      for (const t of [pg.title, ...(redirectsTo[pg.title] || [])]) out[(normalized[t] || t).replace(/^File:/, '')] = path;
    }
    onProgress(Math.min(i + 50, fileNames.length));
  }
  return out;
}

// English item name -> official pt-BR name, from the interlanguage links of the pt-BR game wiki.
export async function fetchPtBrNames() {
  const map = {};
  let cont = {};
  for (;;) {
    const j = await api(PTBR_API, { action: 'query', generator: 'allpages', gapnamespace: '0', gaplimit: '500', prop: 'langlinks', lllang: 'en', lllimit: 'max', ...cont });
    for (const pg of j.query?.pages || []) for (const l of pg.langlinks || []) map[l.title] = pg.title;
    if (!j.continue) break;
    cont = j.continue;
  }
  return map;
}
