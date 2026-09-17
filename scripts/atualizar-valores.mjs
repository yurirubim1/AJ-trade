#!/usr/bin/env node
// Baixa os valores e fotos mais recentes do AJ Item Worth Wiki e gera ../items.js e ../img/
// Uso: npm install   (uma vez, para as fotos)
//      node scripts/atualizar-valores.mjs [--sem-fotos]
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { WORTH_API, fetchNamespace, fetchImagePaths, fetchPtBrNames, fetchPage } from './lib/wiki.mjs';
import { expandTemplates, extractEntries } from './lib/extract.mjs';
import { buildDataset, petCodeEntries } from './lib/build.mjs';
import { buildSprites, CELL, COLS, PER_SHEET } from './lib/photos.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const withPhotos = !process.argv.includes('--sem-fotos');
const log = msg => process.stdout.write(`${msg}\n`);
const progress = label => (n, total) => process.stdout.write(`\r${label}: ${n}${total ? ` / ${total}` : ''}   `);

log('1/6 Baixando páginas do AJ Item Worth Wiki…');
const pages = await fetchNamespace(WORTH_API, 0, progress('   páginas'));
log('');
log('2/6 Baixando templates e códigos de pet…');
const templates = await fetchNamespace(WORTH_API, 10, progress('   templates'));
log('');
const petCodes = petCodeEntries(await fetchPage(WORTH_API, 'Animal Jam Item Worth Wiki:Pet Resources').catch(() => ''));

log('3/6 Lendo tabelas de valores…');
const entries = [];
for (const [title, text] of Object.entries(pages)) entries.push(...extractEntries(title, expandTemplates(text, templates)));
log(`   ${entries.length} colunas de tabela em ${Object.keys(pages).length} páginas, ${petCodes.length} códigos de pet`);

log('4/6 Resolvendo imagens e nomes em português…');
const files = [...new Set(entries.map(e => e.file).filter(Boolean))];
const imagePaths = await fetchImagePaths(files, progress('   imagens'));
log('');
let ptOfficial = {};
try { ptOfficial = await fetchPtBrNames(); } catch (err) { log(`   (nomes pt-BR indisponíveis: ${err.message})`); }

log('5/6 Montando a base de itens…');
const { strings, items, variantCount } = buildDataset(entries, imagePaths, ptOfficial, petCodes);
log(`   ${items.length} itens, ${variantCount} cores/variantes`);

let sprite = null;
const allImages = items.flatMap(it => it[7].map(v => v[6]));
if (withPhotos) {
  let sharp = null;
  try { sharp = (await import('sharp')).default; } catch { log('   Para gerar as fotos rode "npm install" primeiro (ou use --sem-fotos).'); }
  if (sharp) {
    log('6/6 Baixando fotos e montando sprites (a primeira vez demora ~15 min)…');
    const { index, sheets, failed } = await buildSprites({
      sharp, imagePaths: allImages, outDir: path.join(root, 'img'), cacheDir: path.join(root, 'scripts', '.cache', 'thumbs'),
      onProgress: (n, total, bad) => { if (n % 50 === 0 || n === total) process.stdout.write(`\r   fotos: ${n} / ${total}${bad ? ` (${bad} sem imagem)` : ''}   `); },
    });
    log('');
    for (const it of items) for (const v of it[7]) v[6] = index.has(v[6]) ? index.get(v[6]) : -1;
    sprite = { dir: 'img', cell: CELL, cols: COLS, perSheet: PER_SHEET, sheets };
    log(`   ${index.size} fotos em ${sheets} sprites${failed ? `, ${failed} sem imagem` : ''}`);
  }
}
if (!sprite) for (const it of items) for (const v of it[7]) v[6] = -1;

const data = { v: 2, generated: new Date().toISOString().slice(0, 10), source: 'https://aj-item-worth.fandom.com', sprite, strings, items };
const out = path.join(root, 'items.js');
fs.writeFileSync(out, `window.AJ_DATA=${JSON.stringify(data)};\n`);
log(`Pronto: items.js (${(fs.statSync(out).size / 1e6).toFixed(1)} MB)`);
