#!/usr/bin/env node
// 브랜드 아이콘 빌드 — public/icons/icon.svg → 16/48/128 PNG.
// MV3 manifest의 action.default_icon + icons 필드용.
//
// resvg-js (rust→wasm SVG renderer)로 native binding 없이 portable 변환.
// 멱등 — SVG 변경 시점 mtime을 보고 PNG가 더 새거나 같으면 skip.

import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Resvg } from '@resvg/resvg-js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');
const ICON_DIR = join(ROOT, 'public', 'icons');
const SVG_PATH = join(ICON_DIR, 'icon.svg');
const SIZES = [16, 48, 128];

mkdirSync(ICON_DIR, { recursive: true });

if (!existsSync(SVG_PATH)) {
  console.error(`[icons] source not found: ${SVG_PATH}`);
  process.exit(1);
}

const svgBuf = readFileSync(SVG_PATH);
const svgMtime = statSync(SVG_PATH).mtimeMs;

let built = 0;
let skipped = 0;
for (const size of SIZES) {
  const outPath = join(ICON_DIR, `icon-${size}.png`);
  if (existsSync(outPath) && statSync(outPath).mtimeMs >= svgMtime) {
    skipped++;
    continue;
  }
  const resvg = new Resvg(svgBuf, {
    fitTo: { mode: 'width', value: size },
    background: 'rgba(0,0,0,0)',
  });
  const png = resvg.render().asPng();
  writeFileSync(outPath, png);
  built++;
}
console.log(`[icons] ${built} built, ${skipped} cached. (${SIZES.join('/')})`);
