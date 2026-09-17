// Downloads every item picture once, shrinks it and packs the thumbnails into sprite sheets
// (img/s0.webp, img/s1.webp…). One sheet = 16×16 thumbnails, loaded by the browser only when needed.
import fs from 'fs';
import path from 'path';

export const CELL = 64;
export const COLS = 16;
export const PER_SHEET = COLS * COLS;

const IMAGES = 'https://static.wikia.nocookie.net/aj-item-worth/images/';
const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AJTradeValue/1.0',
  Referer: 'https://aj-item-worth.fandom.com/', // resized images are only served with a Referer
};

const cacheName = p => p.replace(/[^A-Za-z0-9._-]+/g, '_') + '.png';

async function download(url) {
  for (let attempt = 1; ; attempt++) {
    try {
      const res = await fetch(url, { headers: HEADERS });
      if (res.status === 404) return null;
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return Buffer.from(await res.arrayBuffer());
    } catch (err) {
      if (attempt >= 4) return null;
      await new Promise(r => setTimeout(r, 1000 * attempt));
    }
  }
}

async function thumbnail(sharp, buf) {
  const fit = img => img.resize(CELL, CELL, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } }).png().toBuffer();
  try {
    return await fit(sharp(buf, { animated: false }).trim({ threshold: 8 })); // cut the empty margins so the item fills the box
  } catch {
    return fit(sharp(buf, { animated: false }));
  }
}

// imagePaths: wiki image paths in display priority order. Returns Map(path -> sprite index).
export async function buildSprites({ sharp, imagePaths, outDir, cacheDir, concurrency = 32, onProgress = () => {} }) {
  fs.mkdirSync(outDir, { recursive: true });
  fs.mkdirSync(cacheDir, { recursive: true });
  const unique = [...new Set(imagePaths.filter(Boolean))];

  let done = 0, failed = 0, next = 0;
  const ok = new Set();
  await Promise.all(Array.from({ length: concurrency }, async () => {
    while (next < unique.length) {
      const p = unique[next++];
      const file = path.join(cacheDir, cacheName(p));
      if (!fs.existsSync(file)) {
        const buf = await download(`${IMAGES}${p}/revision/latest/scale-to-width-down/128`) || await download(`${IMAGES}${p}/revision/latest`);
        if (buf) {
          try { fs.writeFileSync(file, await thumbnail(sharp, buf)); } catch { /* unreadable image */ }
        }
      }
      if (fs.existsSync(file)) ok.add(p); else failed++;
      onProgress(++done, unique.length, failed);
    }
  }));

  const ordered = unique.filter(p => ok.has(p));
  const index = new Map(ordered.map((p, i) => [p, i]));
  const sheets = Math.ceil(ordered.length / PER_SHEET);
  for (let s = 0; s < sheets; s++) {
    const cells = ordered.slice(s * PER_SHEET, (s + 1) * PER_SHEET);
    const rows = Math.ceil(cells.length / COLS);
    await sharp({ create: { width: COLS * CELL, height: rows * CELL, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
      .composite(cells.map((p, i) => ({ input: path.join(cacheDir, cacheName(p)), left: (i % COLS) * CELL, top: Math.floor(i / COLS) * CELL })))
      .webp({ quality: 72, alphaQuality: 80, effort: 6 })
      .toFile(path.join(outDir, `s${s}.webp`));
  }
  for (const f of fs.readdirSync(outDir)) { // remove sheets left over from a bigger previous run
    const m = f.match(/^s(\d+)\.webp$/);
    if (m && +m[1] >= sheets) fs.unlinkSync(path.join(outDir, f));
  }
  return { index, sheets, failed };
}
