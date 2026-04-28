# 오렌지 필터

LLM(ChatGPT·Gemini·Claude·Perplexity 등)과 오렌지임팩트 AI 임팩트 빌더에 붙여넣거나 파일을 올리기 전에,
개인정보를 **사용자의 PC 안에서 자동으로 가립니다**.

> 모든 처리는 디바이스 안에서 이뤄지며, **외부 서버에 전송하지 않습니다.**
> 비영리조직 구성원이 공시 자료 및 기부금 명세서 등을 LLM에 업로드할 때
> 개인정보가 노출되는 사고를 막기 위해 만들었습니다.

## 작동 방식

1. **paste 후킹** — ChatGPT·Gemini·Claude·Perplexity·오렌지임팩트 입력창에
   붙여넣을 때, 텍스트에 개인정보가 있으면 모달이 떠 미리보기와 마스킹 옵션 제시.
2. **파일 업로드** — 사이드 패널에 파일을 드래그하면 PII 추출·마스킹·다운로드.
   PDF/DOCX/PPTX/XLSX/XLS/CSV/TXT/HWP/HWPX/PNG/JPG/JPEG/WEBP 13개 형식.
3. **이미지 OCR** — PNG/JPG는 Tesseract.js (한국어+영어)로 텍스트 추출 후 .txt 저장.
4. **온디바이스 NER** — 한국어 정밀 보호 모델(AEGIS PII, mBERT 기반, ~50MB)을
   사이드 패널에서 한 번 설치하면 인터넷 없이도 동작.

## 17개 PII 카테고리

사람 이름 · 주민등록번호 · 외국인등록번호 · 운전면허번호 · 여권번호 · 휴대폰 번호 ·
유선전화 · 이메일 · 주소 · 카드번호 · 계좌번호 · 사업자등록번호 · 법인등록번호 ·
조직명 · URL · 날짜 · 비밀번호·인증키

각 카테고리별 **4가지 마스킹 모드** 선택 가능:
- **형태 보존** (예: `010-XXXX-XXXX`) — 길이/포맷 유지
- **태그 치환** (예: `[PHONE]`) — 의미 라벨로 교체
- **가짜 데이터** (예: `010-0000-0000`) — placeholder
- **완전 제거** — 빈 문자열

## 설치

### 개발자 빌드

```bash
git clone https://github.com/myorange-io/orange-filter.git
cd orange-filter
npm install
npm run build       # tsc + vite + Tesseract self-host + 아이콘 생성
```

`dist/` 폴더가 chrome.google.com/webstore 업로드 가능한 unpacked extension.

Chrome에 로컬 로드:
1. `chrome://extensions` → 개발자 모드 ON
2. "압축 해제된 확장 프로그램 로드" → `dist/` 선택
3. 첫 사이드 패널에서 "한국어 정밀 보호 모델 설치하기" 클릭 (50MB, 1회만)

### NPO 사용자 (CWS 출시 후)

Chrome 웹 스토어에서 "오렌지 필터" 검색 → 설치. 사이드 패널에서 모델 설치
한 번 후 자동 동작.

## 개발자 명령어

| 명령 | 설명 |
|------|------|
| `npm run dev` | Vite dev 서버 (`localhost:5173`) — HMR + sidepanel/test-page 라이브 |
| `npm run build` | tsc + vite production 빌드 → `dist/` |
| `npm test` | Vitest 단위/통합 테스트 (193 tests) |
| `npm run e2e` | Playwright 야간 smoke (headless chromium) |
| `npm run setup:tesseract` | Tesseract worker/wasm/lang 자동 다운로드 |
| `npm run build:icons` | `public/icons/icon.svg` → 16/48/128 PNG |
| `TESSDATA_VARIANT=best npm run setup:tesseract` | 정밀 LSTM 모델 (~13MB/lang) |

## 아키텍처

```
┌────────── Host Page (chatgpt.com 등) ──────────┐
│  paste event (capture)                         │
└────────────────┬───────────────────────────────┘
                 ▼
┌─── content script (isolated world) ──────┐
│  closed Shadow DOM + Radix Dialog        │
└────────────────┬─────────────────────────┘
                 │ chrome.runtime.sendMessage
                 ▼
┌─── Service Worker ───────┐    ┌─── Offscreen Document ────┐
│  정규식 + 마스킹 + 라우팅│ ──→│  Transformers.js NER 추론  │
└──────────────────────────┘    └────────────────────────────┘
                                          │
                                          ▼
                                   IndexedDB (모델 캐시)
```

핵심 파일:
- `src/content/PasteModal.tsx` — paste 후킹 모달
- `src/sidepanel/App.tsx` — 사이드 패널 UI
- `src/background/pii/regex.ts` — 17 카테고리 정규식 + 체크섬
- `src/background/pii/mask.ts` — 4가지 마스킹 모드
- `src/offscreen/model-runtime.ts` — Transformers.js NER 호스트
- `src/sidepanel/parsers/` — 파일 형식별 round-trip 파서

## 보안 / 프라이버시

- 자세한 위협 모델: [docs/THREAT_MODEL.md](docs/THREAT_MODEL.md) (STRIDE, 5개 Open Items)
- 개인정보 처리방침: [docs/PRIVACY_POLICY.md](docs/PRIVACY_POLICY.md)
- paste/파일 동작 명세: [docs/PASTE_GUIDE.md](docs/PASTE_GUIDE.md)

핵심 약속:
- **외부 서버에 전송 0건**. 모델 가중치 다운로드 1회 외 텔레메트리 부재.
- **MV3 strict CSP 안전**. ORT WASM + Tesseract worker 모두 self-host.
- **최소 권한**. `storage` / `sidePanel` / `offscreen` 3개만. tabs/cookies/webRequest 부재.

## 라이선스

- 본 확장 코드: TBD (출시 전 확정)
- 의존성 라이선스: [LICENSES/](LICENSES/) 폴더 참조
- AEGIS PII 모델: Apache-2.0 ([YATAV-ENT/aegis-personal-pii-ner](https://huggingface.co/YATAV-ENT/aegis-personal-pii-ner))
- Tesseract traineddata: Apache-2.0
- Pretendard 폰트: SIL Open Font License 1.1

## 문의

- 이슈/PR: GitHub Issues
- 보안 우려: pengdo@myorange.io (개인정보 처리방침 §11)
