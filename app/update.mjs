// Atualização diária dentro do aplicativo: baixa os valores novos do wiki e grava
// um items.js na pasta do usuário. Não precisa do sharp: reaproveita os sprites que
// vieram no pacote (img/photos.json) e deixa as fotos de itens novos virem do wiki.
import fs from 'fs';
import path from 'path';
import { WORTH_API, fetchNamespace, fetchImagePaths, fetchPtBrNames, fetchPage } from '../scripts/lib/wiki.mjs';
import { expandTemplates, extractEntries } from '../scripts/lib/extract.mjs';
import { buildDataset, petCodeEntries } from '../scripts/lib/build.mjs';

const PAGES_ESTIMATE = 1300;

export async function runUpdate({ appRoot, dataDir, onStatus = () => {} }) {
  const photos = JSON.parse(fs.readFileSync(path.join(appRoot, 'img', 'photos.json'), 'utf8'));
  const sheets = fs.readdirSync(path.join(appRoot, 'img')).filter(f => /^s\d+\.webp$/.test(f)).length;

  onStatus({ state: 'running', step: 'Baixando as páginas do wiki…', pct: 5 });
  const pages = await fetchNamespace(WORTH_API, 0, n => onStatus({ state: 'running', step: `Baixando as páginas do wiki… (${n})`, pct: 5 + Math.min(45, (n / PAGES_ESTIMATE) * 45) }));

  onStatus({ state: 'running', step: 'Baixando as tabelas…', pct: 55 });
  const templates = await fetchNamespace(WORTH_API, 10);
  const petCodes = petCodeEntries(await fetchPage(WORTH_API, 'Animal Jam Item Worth Wiki:Pet Resources').catch(() => ''));

  onStatus({ state: 'running', step: 'Lendo os valores…', pct: 65 });
  const entries = [];
  for (const [title, text] of Object.entries(pages)) entries.push(...extractEntries(title, expandTemplates(text, templates)));

  const imagePaths = { ...photos.files };
  const missing = [...new Set(entries.map(e => e.file).filter(f => f && !imagePaths[f]))];
  if (missing.length) {
    onStatus({ state: 'running', step: `Procurando fotos de ${missing.length} itens novos…`, pct: 75 });
    Object.assign(imagePaths, await fetchImagePaths(missing));
  }
  const ptOfficial = await fetchPtBrNames().catch(() => ({}));

  onStatus({ state: 'running', step: 'Montando a lista de itens…', pct: 88 });
  const { strings, items, variantCount } = buildDataset(entries, imagePaths, ptOfficial, petCodes);
  for (const item of items) {
    for (const v of item[7]) {
      const wikiPath = v[6];
      const sprite = photos.sprites[wikiPath];
      v[6] = sprite ?? -1;
      if (v[6] < 0 && wikiPath) v[7] = wikiPath; // foto nova: carregada direto do wiki
    }
  }

  const data = {
    v: 2, generated: new Date().toISOString().slice(0, 10), source: 'https://aj-item-worth.fandom.com',
    sprite: { dir: 'img', cell: 64, cols: 16, perSheet: 256, sheets }, strings, items,
  };
  fs.mkdirSync(dataDir, { recursive: true });
  const target = path.join(dataDir, 'items.js');
  fs.writeFileSync(`${target}.tmp`, `window.AJ_DATA=${JSON.stringify(data)};\n`);
  fs.renameSync(`${target}.tmp`, target); // troca de uma vez só, para nunca ficar um arquivo pela metade
  return { items: items.length, variants: variantCount, generated: data.generated };
}
