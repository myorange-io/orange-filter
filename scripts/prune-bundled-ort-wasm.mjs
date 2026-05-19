#!/usr/bin/env node
// Vite/Rollup이 onnxruntime-web의 `new URL("ort-wasm-...wasm", import.meta.url)`
// 패턴을 자동 번들해 dist/assets/ort-wasm-*.wasm 사본을 만든다.
// 런타임에는 env.backends.onnx.wasm.wasmPaths(chrome.runtime.getURL('ort/'))가
// 우선 적용되어 이 사본은 dead weight — public/ort/와 23MB 이상 중복된다.
//
// 검증: model-runtime.ts에서 wasmPaths를 항상 설정하므로 onnxruntime 내부의
// `locateFile` / `wasmPaths` fallback 분기는 실행되지 않는다.

import { readdirSync, statSync, unlinkSync, existsSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DIST_ASSETS = resolve(__dirname, '..', 'dist', 'assets');
const DIST_ORT = resolve(__dirname, '..', 'dist', 'ort');

if (!existsSync(DIST_ASSETS)) {
  console.log('[prune-ort] dist/assets 없음 — skip');
  process.exit(0);
}

if (!existsSync(DIST_ORT)) {
  console.warn('[prune-ort] dist/ort 없음 — public/ort 복사가 누락되었을 수 있어 중단.');
  process.exit(1);
}

// dist/assets에서 ort-wasm-*.wasm 매칭. 해시 suffix(-XxXxXxXx) 형태.
const BUNDLED_RE = /^ort-wasm-.*\.wasm$/;
let totalBytes = 0;
let removed = 0;

for (const name of readdirSync(DIST_ASSETS)) {
  if (!BUNDLED_RE.test(name)) continue;
  const full = join(DIST_ASSETS, name);
  const size = statSync(full).size;
  unlinkSync(full);
  totalBytes += size;
  removed += 1;
  console.log(`[prune-ort] removed dist/assets/${name} (${(size / 1024 / 1024).toFixed(2)} MB)`);
}

if (removed === 0) {
  console.log('[prune-ort] dist/assets에서 번들된 ORT WASM 없음 — 변경 없음');
} else {
  console.log(
    `[prune-ort] ${removed}개 파일 / ${(totalBytes / 1024 / 1024).toFixed(2)} MB 제거. ` +
      `런타임은 dist/ort/를 chrome.runtime.getURL('ort/')로 로드.`,
  );
}
