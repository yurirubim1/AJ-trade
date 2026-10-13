#!/usr/bin/env node
// Atualização diária do site, rodada pelo GitHub Actions (.github/workflows/atualizar-site.yml).
// Usa o mesmo caminho do aplicativo: não precisa do sharp, reaproveita os sprites de img/
// e deixa as fotos de itens novos virem do wiki. Só troca o items.js se algum valor mudou.
// Uso: node scripts/atualizar-site.mjs
import fs from 'fs';
import os from 'os';
import path from 'path';
import { fileURLToPath } from 'url';
import { runUpdate } from '../app/update.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'aj-site-'));
const r = await runUpdate({ appRoot: root, dataDir: tmp, onStatus: s => s.step && console.log(s.step) });

const semData = s => s.replace(/"generated":"[^"]*",/, ''); // a data muda todo dia, os valores nem sempre
const novo = fs.readFileSync(path.join(tmp, 'items.js'), 'utf8');
const atual = fs.readFileSync(path.join(root, 'items.js'), 'utf8');
if (semData(novo) === semData(atual)) {
  console.log('Nada mudou no wiki desde a última atualização.');
} else {
  fs.writeFileSync(path.join(root, 'items.js'), novo);
  console.log(`items.js novo: ${r.items} itens, ${r.variants} cores, valores de ${r.generated}`);
}
fs.rmSync(tmp, { recursive: true, force: true });
