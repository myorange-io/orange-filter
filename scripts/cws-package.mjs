#!/usr/bin/env node
// CWS 업로드용 zip 패키징.
//
// `npm run build` 산출물(dist/)을 releases/npo-privacy-v<version>-cws.zip 으로 묶는다.
// 버전은 package.json에서 읽고, dist/manifest.json과 일치하는지 검증한다 — 빌드를 잊고
// 이전 dist를 그대로 올리는 사고가 CWS에서는 "버전 중복" 거절로만 드러나서 원인 파악이 늦다.
//
// zip 루트에 manifest.json이 있어야 CWS가 받는다. dist/ 안에서 압축해 중첩을 막는다.

import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, rmSync, statSync } from 'node:fs';
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
