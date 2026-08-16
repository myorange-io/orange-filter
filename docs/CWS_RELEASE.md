# CWS 배포 자동화

Chrome Web Store 업로드·게시를 스크립트와 GitHub Actions로 처리한다.

- `scripts/cws-package.mjs` — `dist/`를 `releases/npo-privacy-v<version>-cws.zip`으로 패키징
- `scripts/cws-publish.mjs` — CWS API v2로 업로드/게시
- `.github/workflows/cws-publish.yml` — 수동 실행 워크플로

**API 버전**: v2(`chromewebstore.googleapis.com`)만 사용한다. v1.1(`www.googleapis.com/chromewebstore/v1.1`)은 2026-10-15에 지원이 끝난다.

**기본 동작은 업로드까지만이다.** 심사 제출(=승인 시 실사용자 배포)은 `--publish`를 명시해야 일어난다. 되돌리기 어려운 동작이라 opt-in으로 뒀다.

---

## 1. 자격증명 준비 (최초 1회)

다섯 개 값이 필요하다. 전부 발급자 본인만 다룰 수 있으므로 아래는 직접 수행한다.

### 1-1. Extension ID

[개발자 대시보드](https://chrome.google.com/webstore/devconsole)에서 Orange Filter 항목을 열면 URL에 들어 있는 32자 소문자 문자열.

```
https://chrome.google.com/webstore/devconsole/.../<EXTENSION_ID>/edit
```

### 1-2. Publisher ID

같은 대시보드의 **계정 설정** 화면에 표시된다. v2 API는 아이템 경로가 `publishers/<PUBLISHER_ID>/items/<EXTENSION_ID>` 형태라 반드시 필요하다(v1에는 없던 값).

### 1-3. OAuth 클라이언트 (client id / secret)

1. [Google Cloud Console](https://console.cloud.google.com/)에서 프로젝트 생성 (기존 것 재사용 가능)
2. **API 및 서비스 → 라이브러리** → `Chrome Web Store API` 사용 설정
3. **API 및 서비스 → OAuth 동의 화면** 구성 (외부/내부 중 조직 상황에 맞게, 테스트 사용자에 본인 계정 추가)
4. **사용자 인증 정보 → 사용자 인증 정보 만들기 → OAuth 클라이언트 ID**
   - 애플리케이션 유형: **데스크톱 앱**
   - 생성된 **클라이언트 ID**와 **클라이언트 보안 비밀번호**를 보관

> Cloud 프로젝트를 만든 계정과 스토어 아이템을 소유한 계정이 달라도 된다. 다만 **다음 단계의 refresh token은 반드시 아이템을 소유한 계정으로** 발급해야 한다.

### 1-4. Refresh token

스코프는 `https://www.googleapis.com/auth/chromewebstore`.

가장 간단한 경로는 [OAuth 2.0 Playground](https://developers.google.com/oauthplayground):

1. 우측 상단 톱니 → **Use your own OAuth credentials** 체크 → 위에서 만든 client id/secret 입력
2. 좌측 입력란에 `https://www.googleapis.com/auth/chromewebstore` 직접 입력 → **Authorize APIs**
3. **아이템을 소유한 Google 계정**으로 로그인·승인
4. **Exchange authorization code for tokens** → 나온 **Refresh token** 보관

Playground를 쓰려면 OAuth 클라이언트의 승인된 리디렉션 URI에 `https://developers.google.com/oauthplayground`를 추가해야 한다.

> Refresh token은 비밀번호와 같은 값이다. 저장소·이슈·채팅에 붙여넣지 않는다. 유출되면 Cloud Console에서 클라이언트를 폐기하고 재발급한다.

---

## 2. GitHub Actions 설정

secret 5개를 등록한다.

| Secret | 값 |
|---|---|
| `CWS_CLIENT_ID` | 1-3의 클라이언트 ID |
| `CWS_CLIENT_SECRET` | 1-3의 클라이언트 보안 비밀번호 |
| `CWS_REFRESH_TOKEN` | 1-4의 refresh token |
| `CWS_PUBLISHER_ID` | 1-2의 publisher ID |
| `CWS_EXTENSION_ID` | 1-1의 extension ID |

### 방법 A — gh CLI + `.env` (권장)

로컬 실행에도 쓸 `.env`를 먼저 만들고(3절 참고), 그대로 밀어 넣는다. 한 번에 5개가 등록되고 값이 셸 히스토리에 남지 않는다.

```bash
gh secret set --env-file .env
```

`.env`는 gitignore 대상이지만 실제 자격증명이 담긴 파일이므로 등록 후에도 로컬에만 두고 공유하지 않는다.

등록 확인 — 이름과 수정일만 나온다. 값은 GitHub도 되돌려주지 않는다.

```bash
gh secret list
```

개별로 넣으려면 `--body` 없이 실행해 stdin으로 붙여넣는다. `--body "값"`은 셸 히스토리에 그대로 남으므로 쓰지 않는다.

```bash
gh secret set CWS_REFRESH_TOKEN
```

### 방법 B — 웹 UI

리포지토리 **Settings → Secrets and variables → Actions → New repository secret**에서 5개를 각각 등록한다.

### 등록 후 확인

`dry_run: true`로 워크플로를 1회 실행하면 업로드 없이 자격증명 유효성과 패키징만 검증한다. 로컬이라면:

```bash
node --env-file=.env scripts/cws-publish.mjs --dry-run
```

### 승인 게이트 (권장)

게시가 사람 승인을 거치게 하려면 **Settings → Environments**에서 `cws` environment를 만들고 **Required reviewers**를 지정한 뒤, `.github/workflows/cws-publish.yml`의 `environment: cws` 주석을 해제한다. 그러면 secret 접근 자체가 승인 뒤로 밀린다.

---

## 3. 사용

### GitHub Actions (권장)

**Actions → cws-publish → Run workflow**

| 입력 | 기본 | 의미 |
|---|---|---|
| `publish` | `false` | 심사 제출까지 한다. false면 업로드만 |
| `staged` | `false` | 승인 후 자동 배포 대신 대기 (`publish=true`일 때만) |
| `percentage` | 빈 값 | 단계 배포 시작 비율 0-100 |
| `dry_run` | `false` | 자격증명·패키지 검증만 |

워크플로는 typecheck + 유닛 테스트 → build → package → 업로드 순으로 돈다. 패키지는 업로드 성공 여부와 무관하게 artifact로 30일 보관되므로, API가 실패해도 수동 업로드로 넘어갈 수 있다.

트리거는 `workflow_dispatch` 하나뿐이다. 태그 push나 main merge에 걸지 않았다 — 게시 트리거는 사람이 쥐고 있는 편이 낫다.

### 로컬

```bash
npm run build
npm run cws:package
npm run cws:upload
```

자격증명은 환경변수로 준다. `.env`는 이미 gitignore 대상이다.

```bash
node --env-file=.env scripts/cws-publish.mjs --dry-run
```

`.env` 예시 (**커밋 금지**):

```
CWS_CLIENT_ID=...
CWS_CLIENT_SECRET=...
CWS_REFRESH_TOKEN=...
CWS_PUBLISHER_ID=...
CWS_EXTENSION_ID=...
```

주요 명령:

```bash
node scripts/cws-publish.mjs                  # 업로드만
node scripts/cws-publish.mjs --publish        # 업로드 + 심사 제출
node scripts/cws-publish.mjs --publish --percentage 10   # 10% 단계 배포로 제출
node scripts/cws-publish.mjs --status         # 현재 상태 조회
node scripts/cws-publish.mjs --dry-run        # 검증만
```

---

## 4. 릴리스 절차

1. 코드 변경 → PR → CI 통과 → main merge
2. `package.json` + `manifest.config.ts` 버전 동시 상향, CHANGELOG 작성 (릴리스 커밋에 포함)
3. **cws-publish** 워크플로를 `publish: false`로 1회 실행 → 대시보드에서 패키지 확인
4. 이상 없으면 `publish: true`로 재실행, 또는 대시보드에서 직접 제출

버전은 두 파일에 나뉘어 있고 `cws-package.mjs`가 `dist/manifest.json`과 `package.json`의 불일치를 막아준다. 한쪽만 올리면 패키징 단계에서 실패한다.

---

## 5. 자주 걸리는 것

**`업로드가 거절됐습니다`** — 새 버전이 스토어의 현재 버전보다 높아야 한다. 같거나 낮으면 거절된다. 대시보드에서 현재 게시 버전을 확인하고 올린다.

**`액세스 토큰 발급 실패`** — refresh token이 만료·폐기됐거나 client id/secret이 다르다. OAuth 동의 화면이 "테스트" 상태면 refresh token이 7일 후 만료되므로, 앱을 "프로덕션"으로 게시하거나 주기적으로 재발급해야 한다.

**`uploadState=IN_PROGRESS`** — 큰 패키지는 비동기 처리된다. 스크립트가 `fetchStatus`로 최대 10분 폴링한다. 초과하면 대시보드에서 확인 후 `--status`로 재조회한다.

**게시했는데 반영이 안 됨** — 심사 통과 후 반영이며, 신규 권한이 추가된 버전은 검토가 길어진다. 이번 릴리스는 권한 변경이 없다(`storage`·`sidePanel`·`offscreen` + LLM 5개 도메인).

**403 / `caller does not have permission`** — refresh token을 아이템 소유 계정이 아닌 계정으로 발급한 경우다. 1-4를 아이템 소유 계정으로 다시 수행한다.

---

관련 문서: 스토어 등재 문구·스크린샷 가이드는 [CWS_LISTING.md](CWS_LISTING.md).
