#!/usr/bin/env node
// CWS 업로드용 zip 패키징.
//
// `npm run build` 산출물(dist/)을 releases/npo-privacy-v<version>-cws.zip 으로 묶는다.
// 버전은 package.json에서 읽고, dist/manifest.json과 일치하는지 검증한다 — 빌드를 잊고
// 이전 dist를 그대로 올리는 사고가 CWS에서는 "버전 중복" 거절로만 드러나서 원인 파악이 늦다.
//
// zip 루트에 manifest.json이 있어야 CWS가 받는다. dist/ 안에서 압축해 중첩을 막는다.

import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const DIST = join(ROOT, 'dist');
const OUT_DIR = join(ROOT, 'releases');

function fail(msg) {
  console.error(`[cws-package] ${msg}`);
  process.exit(1);
}

function readJson(path) {
  try {
    return JSON.parse(readFileSync(path, 'utf8'));
  } catch (err) {
    fail(`${path} 읽기 실패: ${err.message}`);
  }
}

const pkgVersion = readJson(join(ROOT, 'package.json')).version;

if (!existsSync(DIST)) {
  fail('dist/ 없음. `npm run build` 먼저 실행하세요.');
}

const manifestPath = join(DIST, 'manifest.json');
if (!existsSync(manifestPath)) {
  fail('dist/manifest.json 없음. 빌드가 중단됐을 수 있습니다.');
}

const manifestVersion = readJson(manifestPath).version;
if (manifestVersion !== pkgVersion) {
  fail(
    `버전 불일치 — package.json ${pkgVersion} vs dist/manifest.json ${manifestVersion}.\n` +
      '  버전을 올린 뒤 `npm run build`를 다시 실행하세요.',
  );
}

// =============================================================================
// 런타임 자산 완전성 검사
//
// v1.7.1 패키징에서 실제로 겪은 사고: git worktree에서 빌드하면 node_modules가
// 비어 있어(패키지는 부모 저장소에 있고, Node의 import 해석만 상위로 올라간다)
// setup-tesseract.mjs가 `node_modules/tesseract.js-core/...`를 못 찾는다. 그런데
// 그 스크립트는 파일마다 "skip (not found)" 경고만 내고 exit 0으로 통과하므로,
// 빌드는 성공한 것처럼 보이고 OCR 엔진 13개 파일(11MB)이 빠진 패키지가 나온다.
// 이미지 3종(PNG/JPG/WEBP) 처리가 통째로 죽는데 업로드 전까지 아무도 모른다.
//
// 스토어에 올라가기 직전이 마지막 관문이므로 여기서 막는다.
// =============================================================================

/** [경로, 최소 크기(bytes) 또는 디렉터리면 최소 파일 수, 설명] */
const REQUIRED_ASSETS = [
  ['manifest.json', 1, '확장 매니페스트'],
  ['_locales', 1, '다국어 메시지'],
  ['icons', 3, '아이콘'],
  ['assets', 10, '번들 스크립트'],
  ['ort', 3, 'ONNX Runtime (NER 추론)'],
  ['tesseract/worker.min.js', 100_000, 'Tesseract 워커 (OCR)'],
  ['tesseract/tesseract-core-simd.wasm', 1_000_000, 'Tesseract SIMD 코어 (OCR)'],
  ['tesseract/tesseract-core.wasm', 1_000_000, 'Tesseract 코어 (OCR)'],
  ['tesseract/kor.traineddata', 500_000, '한국어 OCR 학습 데이터'],
  ['tesseract/eng.traineddata', 500_000, '영어 OCR 학습 데이터'],
];

const problems = [];
for (const [rel, threshold, desc] of REQUIRED_ASSETS) {
  const abs = join(DIST, rel);
  if (!existsSync(abs)) {
    problems.push(`${rel} 없음 — ${desc}`);
    continue;
  }
  const st = statSync(abs);
  if (st.isDirectory()) {
    const n = readdirSync(abs).length;
    if (n < threshold) problems.push(`${rel}/ 파일 ${n}개 (최소 ${threshold}개 필요) — ${desc}`);
  } else if (st.size < threshold) {
    problems.push(`${rel} ${st.size} bytes (최소 ${threshold} 필요) — ${desc}`);
  }
}

if (problems.length > 0) {
  fail(
    `dist/에 런타임 자산이 빠졌습니다 — 이 패키지를 올리면 기능이 죽습니다.\n\n` +
      problems.map((p) => `  ✗ ${p}`).join('\n') +
      `\n\n  가장 흔한 원인: git worktree에서 빌드해 node_modules가 비어 있는 경우.\n` +
      `  ${ROOT}/node_modules 에 패키지가 설치돼 있는지 확인하고,\n` +
      `  \`npm ci && npm run build\` 를 저장소 루트에서 다시 실행하세요.`,
  );
}

mkdirSync(OUT_DIR, { recursive: true });
const zipPath = join(OUT_DIR, `npo-privacy-v${pkgVersion}-cws.zip`);
rmSync(zipPath, { force: true });

try {
  // -X: macOS 확장 속성 제외 (CWS가 __MACOSX 항목을 경고로 잡는다)
  // -r: 재귀, -q: 조용히. dist/ 안에서 실행해 zip 루트를 dist 내용물로 만든다.
  execFileSync('zip', ['-q', '-r', '-X', zipPath, '.', '-x', '*.DS_Store', '*.map'], {
    cwd: DIST,
    stdio: ['ignore', 'inherit', 'inherit'],
  });
} catch (err) {
  if (err.code === 'ENOENT') fail('`zip` 명령을 찾을 수 없습니다. (macOS/ubuntu 기본 포함)');
  fail(`zip 실패: ${err.message}`);
}

const sizeMB = (statSync(zipPath).size / 1e6).toFixed(1);
console.log(`[cws-package] v${pkgVersion} → ${zipPath} (${sizeMB} MB)`);

// CI에서 다음 스텝이 경로를 받을 수 있게 출력.
if (process.env.GITHUB_OUTPUT) {
  const { appendFileSync } = await import('node:fs');
  appendFileSync(process.env.GITHUB_OUTPUT, `zip_path=${zipPath}\nversion=${pkgVersion}\n`);
}
