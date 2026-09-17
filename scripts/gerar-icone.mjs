#!/usr/bin/env node
// Gera build/icon.ico (e icon.png) a partir de um desenho vetorial: a balança do site.
// Uso: node scripts/gerar-icone.mjs
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import sharp from 'sharp';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const out = path.join(root, 'build');
const SIZE = 256;

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${SIZE}" height="${SIZE}" viewBox="0 0 256 256">
  <defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1">
    <stop offset="0" stop-color="#1B8F79"/><stop offset="1" stop-color="#0E5F6B"/>
  </linearGradient></defs>
  <rect width="256" height="256" rx="56" fill="url(#g)"/>
  <g fill="none" stroke="#FFFFFF" stroke-width="15" stroke-linecap="round" stroke-linejoin="round">
    <path d="M128 60v140M92 200h72M44 96h168"/>
    <path d="M44 96 20 152h48zM212 96l-24 56h48z"/>
  </g>
  <path fill="#FF8CC0" d="M196 42c-7-7-18-7-25 0l-3 3-3-3c-7-7-18-7-25 0s-7 18 0 25l28 28 28-28c7-7 7-18 0-25z"/>
</svg>`;

fs.mkdirSync(out, { recursive: true });
const png = await sharp(Buffer.from(svg)).resize(SIZE, SIZE).png().toBuffer();
fs.writeFileSync(path.join(out, 'icon.png'), png);

// .ico com uma única imagem PNG de 256×256 (formato aceito pelo Windows Vista em diante)
const header = Buffer.alloc(22);
header.writeUInt16LE(0, 0); header.writeUInt16LE(1, 2); header.writeUInt16LE(1, 4); // reservado, tipo ícone, 1 imagem
header.writeUInt8(0, 6); header.writeUInt8(0, 7); // 0 = 256 pixels
header.writeUInt8(0, 8); header.writeUInt8(0, 9);
header.writeUInt16LE(1, 10); header.writeUInt16LE(32, 12); // planos, bits por pixel
header.writeUInt32LE(png.length, 14); header.writeUInt32LE(22, 18);
fs.writeFileSync(path.join(out, 'icon.ico'), Buffer.concat([header, png]));
console.log(`build/icon.ico (${(png.length / 1024).toFixed(0)} KB)`);
