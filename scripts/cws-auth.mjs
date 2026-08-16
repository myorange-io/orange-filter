#!/usr/bin/env node
// CWS refresh token 발급 — 로컬 loopback OAuth 플로우.
//
// OAuth Playground를 대체한다. 토큰이 화면·클립보드·셸 히스토리 어디에도 노출되지 않고,
// 이 스크립트 안에서 바로 GitHub secret 또는 .env로 들어간다.
//
// Playground 경로 대비 이점:
//   - refresh token을 사람이 복사·붙여넣기 하지 않는다 (유출 표면 제거)
//   - `redirect_uri_mismatch`·스코프 오입력 같은 흔한 실패가 사라진다
//   - PKCE(S256) 적용
//
// 사전 준비 (Cloud Console에서 1회, docs/CWS_RELEASE.md 1-3절):
//   Chrome Web Store API 사용 설정 → OAuth 클라이언트 ID(**데스크톱 앱**) 생성
//   → client id / secret을 .env에 저장:
//       CWS_CLIENT_ID=...
//       CWS_CLIENT_SECRET=...
//
// 사용:
//   node scripts/cws-auth.mjs --set-secrets    # gh secret으로 3개 등록
//   node scripts/cws-auth.mjs --write-env      # .env에 refresh token 추가
//   node scripts/cws-auth.mjs --set-secrets --write-env --port 8976
//
// 브라우저 로그인·동의는 사람이 한다. 스토어 아이템을 소유한 계정으로 승인해야 한다.

import { execFileSync, spawn } from 'node:child_process';
import { createHash, randomBytes } from 'node:crypto';
import { createServer } from 'node:http';
import { appendFileSync, existsSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const ENV_PATH = join(ROOT, '.env');
const SCOPE = 'https://www.googleapis.com/auth/chromewebstore';
const AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const DEFAULT_PORT = 8976;
const TIMEOUT_MS = 5 * 60_000;

function die(msg) {
  console.error(`\n✗ ${msg}\n`);
  process.exit(1);
}
const log = (m) => console.log(`[cws-auth] ${m}`);

// --- 인자 -------------------------------------------------------------------

const opts = { setSecrets: false, writeEnv: false, port: DEFAULT_PORT };
for (let i = 2; i < process.argv.length; i++) {
  const a = process.argv[i];
  if (a === '--set-secrets') opts.setSecrets = true;
  else if (a === '--write-env') opts.writeEnv = true;
  else if (a === '--port') opts.port = Number(process.argv[++i]);
  else if (a === '--help' || a === '-h') {
    console.log(`사용: node scripts/cws-auth.mjs [--set-secrets] [--write-env] [--port N]

  --set-secrets  발급된 값을 gh secret으로 등록 (CWS_CLIENT_ID/SECRET/REFRESH_TOKEN)
  --write-env    .env에 CWS_REFRESH_TOKEN 추가
  --port N       loopback 수신 포트 (기본 ${DEFAULT_PORT})

토큰은 어느 경우에도 화면에 출력되지 않는다.`);
    process.exit(0);
  } else die(`알 수 없는 인자: ${a}`);
}
if (!opts.setSecrets && !opts.writeEnv) {
  die('--set-secrets 또는 --write-env 중 하나는 지정해야 합니다.\n  토큰을 화면에 찍지 않으므로, 어디에 넣을지 정해야 합니다.');
}
if (!Number.isInteger(opts.port) || opts.port < 1024 || opts.port > 65535) {
  die('--port는 1024~65535 정수여야 합니다.');
}

// --- client id / secret 로드 -------------------------------------------------

/** .env를 아주 단순하게 파싱 — KEY=VALUE, # 주석, 따옴표 제거. */
function loadDotenv(path) {
  if (!existsSync(path)) return {};
  const out = {};
  for (const line of readFileSync(path, 'utf8').split('\n')) {
    const m = /^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/.exec(line);
    if (!m || line.trim().startsWith('#')) continue;
    out[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
  return out;
}

const dotenv = loadDotenv(ENV_PATH);
const CLIENT_ID = process.env.CWS_CLIENT_ID || dotenv.CWS_CLIENT_ID;
const CLIENT_SECRET = process.env.CWS_CLIENT_SECRET || dotenv.CWS_CLIENT_SECRET;

if (!CLIENT_ID || !CLIENT_SECRET) {
  die(
    'CWS_CLIENT_ID / CWS_CLIENT_SECRET을 찾을 수 없습니다.\n' +
      `  ${ENV_PATH} 에 두 줄을 넣거나 환경변수로 주세요:\n` +
      '    CWS_CLIENT_ID=...\n    CWS_CLIENT_SECRET=...\n' +
      '  발급 방법은 docs/CWS_RELEASE.md 1-3절 (OAuth 클라이언트 유형은 "데스크톱 앱").',
  );
}

// --- PKCE + state ------------------------------------------------------------

const b64url = (buf) => buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
const codeVerifier = b64url(randomBytes(32));
const codeChallenge = b64url(createHash('sha256').update(codeVerifier).digest());
const state = b64url(randomBytes(16));
const redirectUri = `http://127.0.0.1:${opts.port}`;

const authUrl =
  `${AUTH_URL}?` +
  new URLSearchParams({
    client_id: CLIENT_ID,
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: SCOPE,
    access_type: 'offline',
    prompt: 'consent', // refresh token을 반드시 받기 위해 매번 동의를 요구
    state,
    code_challenge: codeChallenge,
    code_challenge_method: 'S256',
  });

// --- loopback 수신 -----------------------------------------------------------

function page(title, body, ok) {
  return `<!doctype html><meta charset="utf-8"><title>${title}</title>
<div style="font:16px/1.6 system-ui,sans-serif;max-width:34rem;margin:15vh auto;padding:0 1.5rem">
<h1 style="font-size:1.3rem;color:${ok ? '#137333' : '#c5221f'}">${title}</h1>
<p style="color:#3c4043">${body}</p></div>`;
}

function waitForCode() {
  return new Promise((resolvePromise, rejectPromise) => {
    const server = createServer((req, res) => {
      const url = new URL(req.url, redirectUri);
      if (url.pathname !== '/') {
        res.writeHead(404).end();
        return;
      }
      const err = url.searchParams.get('error');
      const code = url.searchParams.get('code');
      const gotState = url.searchParams.get('state');

      const finish = (status, html, settle) => {
        res.writeHead(status, { 'Content-Type': 'text/html; charset=utf-8' }).end(html);
        server.close();
        settle();
      };

      if (err) {
        finish(400, page('승인 취소됨', `Google이 반환한 오류: ${err}`, false), () =>
          rejectPromise(new Error(`승인 거부/취소: ${err}`)));
        return;
      }
      if (gotState !== state) {
        // state 불일치 = 이 요청이 우리가 시작한 플로우가 아니다. 코드를 쓰지 않는다.
        finish(400, page('요청 불일치', 'state 값이 맞지 않아 중단했습니다.', false), () =>
          rejectPromise(new Error('state 불일치 — 요청을 폐기했습니다.')));
        return;
      }
      if (!code) {
        finish(400, page('코드 없음', '인가 코드가 오지 않았습니다.', false), () =>
          rejectPromise(new Error('인가 코드 없음')));
        return;
      }
      finish(200, page('승인 완료', '터미널로 돌아가세요. 이 창은 닫아도 됩니다.', true), () =>
        resolvePromise(code));
    });

    server.on('error', (e) => {
      rejectPromise(
        e.code === 'EADDRINUSE'
          ? new Error(`포트 ${opts.port}이 사용 중입니다. --port로 다른 포트를 지정하세요.`)
          : e,
      );
    });

    server.listen(opts.port, '127.0.0.1', () => {
      log(`${redirectUri} 에서 승인 콜백을 기다립니다.`);
      log('브라우저에서 **스토어 아이템을 소유한 Google 계정**으로 로그인·승인하세요.');
      console.log(`\n${authUrl}\n`);
      // 자동 열기 실패는 무시 — 위 URL을 직접 열면 된다.
      const opener = process.platform === 'darwin' ? 'open' : process.platform === 'win32' ? 'start' : 'xdg-open';
      try {
        spawn(opener, [authUrl], { stdio: 'ignore', detached: true }).unref();
      } catch { /* 수동으로 열도록 안내됨 */ }
    });

    setTimeout(() => {
      server.close();
      rejectPromise(new Error(`${TIMEOUT_MS / 60000}분 안에 승인이 완료되지 않았습니다.`));
    }, TIMEOUT_MS).unref();
  });
}

// --- 토큰 교환 ---------------------------------------------------------------

async function exchange(code) {
  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: CLIENT_ID,
      client_secret: CLIENT_SECRET,
      code,
      code_verifier: codeVerifier,
      grant_type: 'authorization_code',
      redirect_uri: redirectUri,
    }),
  });
  if (!res.ok) {
    let hint = '';
    try {
      const b = await res.json();
      hint = ` — ${`${b.error ?? ''} ${b.error_description ?? ''}`.trim()}`;
      if (b.error === 'redirect_uri_mismatch') {
        hint += `\n  Cloud Console의 이 OAuth 클라이언트에 승인된 리디렉션 URI로 ${redirectUri} 를 추가하세요.`;
      }
    } catch { /* 본문 없음 */ }
    die(`토큰 교환 실패 (HTTP ${res.status})${hint}`);
  }
  const body = await res.json();
  if (!body.refresh_token) {
    die(
      'refresh_token이 응답에 없습니다.\n' +
        '  이미 승인된 클라이언트라 Google이 재발급을 생략했을 수 있습니다.\n' +
        '  https://myaccount.google.com/permissions 에서 이 앱의 접근 권한을 제거하고 다시 실행하세요.',
    );
  }
  return body.refresh_token;
}

// --- 저장 --------------------------------------------------------------------

function setSecret(name, value) {
  // 값을 인자로 넘기지 않는다 — 프로세스 목록·셸 히스토리에 남지 않도록 stdin으로만.
  execFileSync('gh', ['secret', 'set', name], { input: value, stdio: ['pipe', 'inherit', 'inherit'] });
  log(`gh secret set ${name} ✓`);
}

function appendEnv(name, value) {
  const existing = loadDotenv(ENV_PATH);
  if (existing[name]) {
    log(`⚠ .env에 ${name}이 이미 있습니다 — 덮어쓰지 않았습니다. 직접 교체하세요.`);
    return;
  }
  appendFileSync(ENV_PATH, `${existsSync(ENV_PATH) ? '' : ''}${name}=${value}\n`);
  log(`.env에 ${name} 추가 ✓`);
}

// --- main --------------------------------------------------------------------

log(`스코프: ${SCOPE}`);
let code;
try {
  code = await waitForCode();
} catch (e) {
  die(e.message);
}
log('인가 코드 수신 — 토큰으로 교환합니다.');
const refreshToken = await exchange(code);
log('refresh token 발급 완료 (화면에 출력하지 않습니다).');

if (opts.setSecrets) {
  try {
    setSecret('CWS_CLIENT_ID', CLIENT_ID);
    setSecret('CWS_CLIENT_SECRET', CLIENT_SECRET);
    setSecret('CWS_REFRESH_TOKEN', refreshToken);
  } catch (e) {
    die(`gh secret 등록 실패: ${e.message}\n  gh 인증(gh auth status)과 repo 권한을 확인하세요.`);
  }
}
if (opts.writeEnv) appendEnv('CWS_REFRESH_TOKEN', refreshToken);

log('✓ 완료. 검증: node scripts/cws-publish.mjs --dry-run');
