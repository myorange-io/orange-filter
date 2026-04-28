#!/usr/bin/env node
// Tesseract.js self-host 빌드 자동화.
// MV3 strict CSP는 외부 cdn 차단 → worker/wasm/lang을 public/tesseract/로 자체 호스팅.
//
// 동작:
//   1) node_modules/tesseract.js + tesseract.js-core에서 worker/wasm/wasm-loader 복사
//   2) tessdata cdn에서 kor.traineddata + eng.traineddata 다운로드 (이미 있으면 skip)
//   3) public/tesseract/ → vite build 시 dist/tesseract/로 자동 복사
//
// 멱등(idempotent) — 여러 번 실행해도 결과 동일.
// build/dev 전에 자동 실행 (package.json prebuild + predev).

import { existsSync, mkdirSync, copyFileSync, statSync, createWriteStream } from 'node:fs';
import { unlink } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { get } from 'node:https';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');
const PUBLIC_DIR = join(ROOT, 'public', 'tesseract');

mkdirSync(PUBLIC_DIR, { recursive: true });

// 1) npm 패키지에서 worker + core 복사 (모든 변종 — Tesseract.js가 SIMD/LSTM 자동 선택)
const FILES_FROM_NPM = [
  // Worker
  ['node_modules/tesseract.js/dist/worker.min.js', 'worker.min.js'],
  // Core (8 변종 = simd × lstm × relaxedsimd 조합)
  ['node_modules/tesseract.js-core/tesseract-core.js', 'tesseract-core.js'],
  ['node_modules/tesseract.js-core/tesseract-core.wasm', 'tesseract-core.wasm'],
  ['node_modules/tesseract.js-core/tesseract-core.wasm.js', 'tesseract-core.wasm.js'],
  ['node_modules/tesseract.js-core/tesseract-core-simd.js', 'tesseract-core-simd.js'],
  ['node_modules/tesseract.js-core/tesseract-core-simd.wasm', 'tesseract-core-simd.wasm'],
  ['node_modules/tesseract.js-core/tesseract-core-simd.wasm.js', 'tesseract-core-simd.wasm.js'],
  ['node_modules/tesseract.js-core/tesseract-core-lstm.js', 'tesseract-core-lstm.js'],
  ['node_modules/tesseract.js-core/tesseract-core-lstm.wasm', 'tesseract-core-lstm.wasm'],
  ['node_modules/tesseract.js-core/tesseract-core-lstm.wasm.js', 'tesseract-core-lstm.wasm.js'],
  ['node_modules/tesseract.js-core/tesseract-core-simd-lstm.js', 'tesseract-core-simd-lstm.js'],
  ['node_modules/tesseract.js-core/tesseract-core-simd-lstm.wasm', 'tesseract-core-simd-lstm.wasm'],
  ['node_modules/tesseract.js-core/tesseract-core-simd-lstm.wasm.js', 'tesseract-core-simd-lstm.wasm.js'],
];

let copied = 0;
for (const [src, dst] of FILES_FROM_NPM) {
  const srcAbs = join(ROOT, src);
  const dstAbs = join(PUBLIC_DIR, dst);
  if (!existsSync(srcAbs)) {
    console.warn(`[tesseract-setup] skip (not found): ${src}`);
    continue;
  }
  copyFileSync(srcAbs, dstAbs);
  copied++;
}
console.log(`[tesseract-setup] worker + core: ${copied} files copied to public/tesseract/`);

// 2) lang traineddata 다운로드 (이미 있으면 skip)
//    tessdata_fast: integer-quantized LSTM, ~3MB/lang. NPO 한국어 OCR 정확도 충분.
//    full LSTM(~12MB)은 v1.1+ 옵션. fast로 시작.
//    cdn: jsdelivr GitHub mirror — 안정적이고 글로벌 캐싱.
const LANG_BASE = 'https://cdn.jsdelivr.net/gh/tesseract-ocr/tessdata_fast@main/';
const LANGS = ['kor', 'eng'];

function downloadFile(url, dst) {
  return new Promise((resolve, reject) => {
    const req = get(url, (res) => {
      if (res.statusCode === 301 || res.statusCode === 302) {
        // Follow redirect
        downloadFile(res.headers.location, dst).then(resolve).catch(reject);
        return;
      }
      if (res.statusCode !== 200) {
        reject(new Error(`HTTP ${res.statusCode} for ${url}`));
        return;
      }
      const out = createWriteStream(dst);
      res.pipe(out);
      out.on('finish', () => out.close(() => resolve()));
      out.on('error', async (err) => {
        try { await unlink(dst); } catch {}
        reject(err);
      });
    });
    req.on('error', reject);
  });
}

for (const lang of LANGS) {
  const dst = join(PUBLIC_DIR, `${lang}.traineddata`);
  if (existsSync(dst)) {
    const sizeMB = (statSync(dst).size / 1024 / 1024).toFixed(1);
    console.log(`[tesseract-setup] skip ${lang}.traineddata (already cached, ${sizeMB}MB)`);
    continue;
  }
  const url = `${LANG_BASE}${lang}.traineddata`;
  console.log(`[tesseract-setup] downloading ${lang}.traineddata from ${url} ...`);
  try {
    await downloadFile(url, dst);
    const sizeMB = (statSync(dst).size / 1024 / 1024).toFixed(1);
    console.log(`[tesseract-setup] ✓ ${lang}.traineddata (${sizeMB}MB)`);
  } catch (err) {
    console.error(`[tesseract-setup] ✗ ${lang}.traineddata failed:`, err.message);
    process.exit(1);
  }
}

console.log('[tesseract-setup] done. public/tesseract/ ready for vite build.');
