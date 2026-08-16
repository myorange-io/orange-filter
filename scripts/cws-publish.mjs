#!/usr/bin/env node
// Chrome Web Store 업로드/게시 자동화 (CWS API v2).
//
// v1.1 API(www.googleapis.com/chromewebstore/v1.1)는 2026-10-15 지원 종료 → v2만 사용한다.
//   token       POST https://oauth2.googleapis.com/token
//   upload      POST https://chromewebstore.googleapis.com/upload/v2/publishers/{P}/items/{E}:upload
//   publish     POST https://chromewebstore.googleapis.com/v2/publishers/{P}/items/{E}:publish
//   fetchStatus GET  https://chromewebstore.googleapis.com/v2/publishers/{P}/items/{E}:fetchStatus
//
// 기본 동작은 **업로드까지만** — 게시(심사 제출)는 `--publish`를 명시해야 일어난다.
// 게시는 실사용자에게 나가는 되돌리기 어려운 동작이라, 워크플로 오작동이나 손이 미끄러진
// 실행으로 배포되지 않도록 opt-in으로 둔다.
//
// 필요한 환경변수 (설정 방법은 docs/CWS_RELEASE.md):
//   CWS_CLIENT_ID  CWS_CLIENT_SECRET  CWS_REFRESH_TOKEN  CWS_PUBLISHER_ID  CWS_EXTENSION_ID
//
// 사용:
//   node scripts/cws-publish.mjs                    # 업로드만 (심사 제출 안 함)
//   node scripts/cws-publish.mjs --publish          # 업로드 + 심사 제출
//   node scripts/cws-publish.mjs --publish --percentage 10   # 10% 단계 배포로 제출
//   node scripts/cws-publish.mjs --status           # 현재 상태만 조회
//   node scripts/cws-publish.mjs --dry-run          # 자격증명·zip 검증만, 업로드 안 함

import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const API = 'https://chromewebstore.googleapis.com';
const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const POLL_INTERVAL_MS = 10_000;
const POLL_TIMEOUT_MS = 10 * 60_000;

// ---------------------------------------------------------------------------
// 인자 파싱
// ---------------------------------------------------------------------------

function parseArgs(argv) {
  const opts = { publish: false, staged: false, status: false, dryRun: false, zip: null, percentage: null };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    switch (a) {
      case '--publish': opts.publish = true; break;
      case '--staged': opts.staged = true; break;
      case '--status': opts.status = true; break;
      case '--dry-run': opts.dryRun = true; break;
      case '--zip': opts.zip = argv[++i]; break;
      case '--percentage': opts.percentage = Number(argv[++i]); break;
      case '--help': case '-h': printUsage(); process.exit(0); break;
      default: die(`알 수 없는 인자: ${a}  (--help 참고)`);
    }
  }
  if (opts.percentage !== null) {
    if (!Number.isInteger(opts.percentage) || opts.percentage < 0 || opts.percentage > 100) {
      die('--percentage는 0~100 정수여야 합니다.');
    }
    if (!opts.publish) die('--percentage는 --publish와 함께 써야 합니다.');
  }
  if (opts.staged && !opts.publish) die('--staged는 --publish와 함께 써야 합니다.');
  return opts;
}

function printUsage() {
  console.log(`
사용: node scripts/cws-publish.mjs [옵션]

  (옵션 없음)          dist zip을 업로드만 한다. 심사 제출 안 함.
  --publish            업로드 후 심사에 제출한다. 승인되면 실사용자에게 배포된다.
  --staged             --publish와 함께. 승인 후 자동 배포 대신 대기 상태로 둔다.
  --percentage <0-100> --publish와 함께. 단계 배포 시작 비율.
  --zip <path>         업로드할 zip 경로. 기본 releases/npo-privacy-v<version>-cws.zip
  --status             현재 아이템 상태만 조회하고 종료.
  --dry-run            자격증명·zip 검증만. 네트워크 쓰기 없음.
`.trim());
}

// ---------------------------------------------------------------------------
// 유틸
// ---------------------------------------------------------------------------

function die(msg) {
  console.error(`\n✗ ${msg}\n`);
  process.exit(1);
}

function log(msg) {
  console.log(`[cws] ${msg}`);
}

function requireEnv() {
  const names = ['CWS_CLIENT_ID', 'CWS_CLIENT_SECRET', 'CWS_REFRESH_TOKEN', 'CWS_PUBLISHER_ID', 'CWS_EXTENSION_ID'];
  const missing = names.filter((n) => !process.env[n]);
  if (missing.length > 0) {
    die(
      `환경변수 누락: ${missing.join(', ')}\n` +
        '  설정 방법은 docs/CWS_RELEASE.md 참고.\n' +
        '  로컬: node --env-file=.env scripts/cws-publish.mjs …',
    );
  }
  return Object.fromEntries(names.map((n) => [n, process.env[n]]));
}

/** API 에러 응답을 사람이 읽을 수 있는 한 줄로. 토큰·시크릿은 절대 싣지 않는다. */
async function describeError(res) {
  let body;
  try {
    body = await res.json();
  } catch {
    return `HTTP ${res.status} ${res.statusText}`;
  }
  const e = body?.error;
  if (!e) return `HTTP ${res.status}: ${JSON.stringify(body).slice(0, 500)}`;
  const detail = Array.isArray(e.details) && e.details.length > 0 ? ` — ${JSON.stringify(e.details).slice(0, 400)}` : '';
  return `HTTP ${res.status} ${e.status ?? ''}: ${e.message ?? '(메시지 없음)'}${detail}`;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ---------------------------------------------------------------------------
// zip 검증 — 버전 일치 + 루트 manifest
// ---------------------------------------------------------------------------

function resolveZipPath(explicit) {
  if (explicit) {
    const p = resolve(explicit);
    if (!existsSync(p)) die(`zip 없음: ${p}`);
    return p;
  }
  const version = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8')).version;
  const p = join(ROOT, 'releases', `npo-privacy-v${version}-cws.zip`);
  if (!existsSync(p)) {
    die(`zip 없음: ${p}\n  \`npm run cws:package\` 를 먼저 실행하세요 (그 전에 \`npm run build\`).`);
  }
  return p;
}

/**
 * zip 안의 manifest.json 버전을 확인한다.
 * `unzip`이 없는 환경에서는 건너뛴다 — 검증 실패가 아니라 미검증으로 처리하고 경고만.
 */
function verifyZip(zipPath) {
  const pkgVersion = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8')).version;
  let raw;
  try {
    raw = execFileSync('unzip', ['-p', zipPath, 'manifest.json'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
  } catch {
    log('⚠ zip 내 manifest 검증 생략 (unzip 없음 또는 루트에 manifest.json 없음)');
    return null;
  }
  let zipVersion;
  try {
    zipVersion = JSON.parse(raw).version;
  } catch {
    die('zip 안의 manifest.json을 파싱할 수 없습니다.');
  }
  if (zipVersion !== pkgVersion) {
    die(
      `버전 불일치 — package.json ${pkgVersion} vs zip 내 manifest ${zipVersion}.\n` +
        '  오래된 zip을 올리려는 것일 수 있습니다. `npm run build && npm run cws:package` 재실행.',
    );
  }
  return zipVersion;
}

// ---------------------------------------------------------------------------
// API 호출
// ---------------------------------------------------------------------------

async function getAccessToken(env) {
  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: env.CWS_CLIENT_ID,
      client_secret: env.CWS_CLIENT_SECRET,
      refresh_token: env.CWS_REFRESH_TOKEN,
      grant_type: 'refresh_token',
    }),
  });
  if (!res.ok) {
    // 토큰 엔드포인트 에러는 {error, error_description} 형태 — 시크릿은 포함되지 않는다.
    let hint = '';
    try {
      const b = await res.json();
      hint = `: ${b.error ?? ''} ${b.error_description ?? ''}`.trim();
    } catch { /* 본문 없음 */ }
    die(
      `액세스 토큰 발급 실패 (HTTP ${res.status})${hint}\n` +
        '  refresh token이 만료·폐기됐거나 client id/secret이 다를 수 있습니다.\n' +
        '  docs/CWS_RELEASE.md의 "refresh token 재발급" 절 참고.',
    );
  }
  const { access_token } = await res.json();
  if (!access_token) die('토큰 응답에 access_token이 없습니다.');
  return access_token;
}

function itemPath(env) {
  return `publishers/${env.CWS_PUBLISHER_ID}/items/${env.CWS_EXTENSION_ID}`;
}

async function fetchStatus(env, token) {
  const res = await fetch(`${API}/v2/${itemPath(env)}:fetchStatus`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) die(`상태 조회 실패 — ${await describeError(res)}`);
  return res.json();
}

async function uploadPackage(env, token, zipPath) {
  const bytes = readFileSync(zipPath);
  const res = await fetch(`${API}/upload/v2/${itemPath(env)}:upload`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/zip',
      'Content-Length': String(bytes.byteLength),
    },
    body: bytes,
  });
  if (!res.ok) die(`업로드 실패 — ${await describeError(res)}`);
  return res.json();
}

/** uploadState가 IN_PROGRESS면 fetchStatus로 폴링. SUCCEEDED/FAILED로 끝날 때까지. */
async function waitForUpload(env, token) {
  const deadline = Date.now() + POLL_TIMEOUT_MS;
  while (Date.now() < deadline) {
    await sleep(POLL_INTERVAL_MS);
    const status = await fetchStatus(env, token);
    const state = status.lastAsyncUploadState;
    log(`업로드 상태: ${state ?? '(미보고)'}`);
    if (state === 'SUCCEEDED') return status;
    if (state === 'FAILED' || state === 'NOT_FOUND') {
      die(`업로드가 ${state}로 종료됐습니다. 개발자 대시보드에서 상세를 확인하세요.`);
    }
  }
  die(`업로드가 ${POLL_TIMEOUT_MS / 60000}분 안에 끝나지 않았습니다. 대시보드에서 확인 후 --status로 재조회하세요.`);
}

async function publishItem(env, token, { staged, percentage }) {
  const body = {};
  if (staged) body.publishType = 'STAGED_PUBLISH';
  if (percentage !== null) body.deployInfos = [{ deployPercentage: percentage }];
  const res = await fetch(`${API}/v2/${itemPath(env)}:publish`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) die(`게시 실패 — ${await describeError(res)}`);
  return res.json();
}

// ---------------------------------------------------------------------------
// main
// ---------------------------------------------------------------------------

const opts = parseArgs(process.argv.slice(2));
const env = requireEnv();

log(`아이템 ${env.CWS_EXTENSION_ID} (publisher ${env.CWS_PUBLISHER_ID})`);

if (opts.status) {
  const token = await getAccessToken(env);
  const status = await fetchStatus(env, token);
  console.log(JSON.stringify(status, null, 2));
  process.exit(0);
}

const zipPath = resolveZipPath(opts.zip);
const zipVersion = verifyZip(zipPath);
log(`패키지 ${zipPath} (${(statSync(zipPath).size / 1e6).toFixed(1)} MB${zipVersion ? `, manifest v${zipVersion}` : ''})`);

if (opts.dryRun) {
  await getAccessToken(env); // 자격증명이 실제로 동작하는지만 확인
  log('✓ dry-run — 자격증명 유효, zip 검증 통과. 업로드하지 않았습니다.');
  process.exit(0);
}

const token = await getAccessToken(env);

log('업로드 중…');
const upload = await uploadPackage(env, token, zipPath);
log(`업로드 응답: uploadState=${upload.uploadState}${upload.crxVersion ? ` crxVersion=${upload.crxVersion}` : ''}`);

if (upload.uploadState === 'FAILED') {
  die('업로드가 거절됐습니다. 버전이 스토어의 현재 버전보다 높은지, 패키지가 유효한지 확인하세요.');
}
if (upload.uploadState === 'IN_PROGRESS') {
  log('비동기 처리 중 — 완료까지 폴링합니다.');
  await waitForUpload(env, token);
}

if (!opts.publish) {
  log('✓ 업로드 완료. 심사 제출은 하지 않았습니다 (--publish 필요).');
  log('  대시보드에서 확인 후 제출하거나, --publish로 다시 실행하세요.');
  process.exit(0);
}

log(`심사 제출 중…${opts.staged ? ' (STAGED_PUBLISH)' : ''}${opts.percentage !== null ? ` (배포 ${opts.percentage}%)` : ''}`);
const published = await publishItem(env, token, opts);
log(`✓ 제출 완료 — state=${published.state}`);
for (const w of published.warningInfo?.warnings ?? []) {
  log(`⚠ 경고: ${typeof w === 'string' ? w : JSON.stringify(w)}`);
}
