# Changelog

본 파일은 [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) 형식 + 한국어 명세.
버전: SemVer (MAJOR.MINOR.PATCH).

---

## [1.3.0] — 2026-04-29

PII 정의 정정(조직명·일반어 미검출) + 모델 설치 게이트 UI + OOXML 메타데이터
누출 차단 + XLSX 코멘트/PDF metadata 마스킹 + 이미지 EXIF 마스킹 + 영문명 통일.
회귀 테스트 271 → 295(2 skip) 통과.

### Removed (정리)

- **ModelManager 컴포넌트 삭제** — GateScreen 도입 후 모델 미설치 시 입력 UI
  자체가 차단되므로 ModelManager가 렌더되는 시점엔 항상 cached 상태. 단일 모델
  (TIER1_DEFAULT) 환경에서 multi-model loop·진행률·취소 UI는 dead code였고,
  설치 상태는 footer "🟢 AI 보호 켜짐" 점이 이미 표시. `src/sidepanel/ModelManager.tsx`
  + App.tsx의 inline `<section>` 제거. `ALL_MODELS`/`TIER2_OPTIONS`는 background에서
  사용 + v2 멀티 모델 자리로 보존.

### Changed (정의 정정)

- **조직명은 PII 아님** — 한국사회적기업진흥원·조달청·협동조합·교육센터 등 모든
  조직명을 마스킹 대상에서 제외. `ORGANIZATION_KOREAN`/`ACRONYM` 정규식 detector
  제거 + NER `ORG`/`COMPANY` 라벨도 `mapLabel`에서 null 매핑. 사용자 정의에 따라
  공공·사기업·일반 단체를 구분하지 않음.
- **일반 본문에서 정규식 NAME 검출 OFF** — "선착순/노트북/하반기/조달청"
  같은 일반어 false positive가 압도적이라 정규식 NAME 검출을 표 PII 컬럼
  (`nameHintOnly`)에 한정. 일반 본문의 사람 이름은 NER(AEGIS 한국어 mBERT)이
  컨텍스트 보고 책임. `detectKoreanName`/`detectOrganization` 함수 제거,
  `detectContextualName`으로 NAME 검출 일원화 + dedupe + 직책(`박사`·`교수`)
  단독 차단.

### Added (신규 기능)

- **HWPX `Preview/PrvText.txt` 마스킹** — 본문(section*.xml)을 가렸어도 미리보기
  평문이 zip 안에 그대로 남아 파일 미리보기에 PII 노출되던 결함 해결. `parseHwpx`/
  `exportHwpx` 모두 PrvText.txt를 single segment로 처리.
- **OOXML `docProps/*.xml` 마스킹** — DOCX/PPTX의 `docProps/core.xml`/`app.xml`/
  `custom.xml`(작성자·제목·키워드·회사·lastModifiedBy)을 마스킹 파이프라인에 포함.
  `src/sidepanel/parsers/ooxml-docprops.ts` 공통 helper. 본문 가려도 메타데이터에
  PII가 남던 누출 차단.
- **XLSX 메타데이터 + 셀 코멘트 마스킹** — SheetJS `wb.Props`(Title/Author/Company/
  Keywords/Comments/LastAuthor 등) + `wb.Custprops` + `cell.c[]`(셀 코멘트 author·text)을
  마스킹 파이프라인에 포함. zip 직접 처리가 아닌 SheetJS Workbook API 통합.
- **PDF 메타데이터 마스킹** — `parsePdf`가 정보 dictionary(Title/Author/Subject/Keywords/
  Creator/Producer)를 segment로 노출하고 `exportPdf`가 pdf-lib `setTitle`/`setAuthor`/...로
  새 PDF에 마스킹 적용. PDF reader의 "Properties" 탭에 PII 누출되던 결함 차단.
- **이미지 EXIF/XMP/IPTC 텍스트 메타데이터 마스킹** — `parseImage`가 OCR 본문과 함께
  EXIF Artist/Copyright/ImageDescription/UserComment, XMP dc:creator/rights/description,
  IPTC by-line/caption/credit을 segment로 노출. `exportImage`가 마스킹된 메타데이터를
  출력 .txt 끝 `[이미지 메타데이터]` 섹션에 추가해 사용자가 원본 이미지 공유 전 인지
  가능하게 함. 의존성: `exifr` 7.1.3 (MIT, ~75KB lazy chunk). GPS 좌표는 위치 카테고리
  부재로 v1.3 범위 밖 — 별도 슬라이스에서 처리.
- **이름 통일 (Orange Filter)** — 모든 한국어 문서·UI에서 "오렌지 필터" 표기를 영문
  "Orange Filter"로 통일. manifest.config.ts·README·docs·sidepanel 등 11개 파일.
- **모델 설치 게이트 UI** — 사이드패널 첫 진입 시 모델 미설치면 입력 UI 대신
  GateScreen(welcome/downloading/error) 5 화면 시안. 사용자 정의(A 모드) — AI 모델
  없이는 부정확한 보호로 거짓 안심을 주지 않음. 시안 [docs/ux-gate-mockup.html](docs/ux-gate-mockup.html).
- **합성 결산공시 데모 fixture** — "예시 파일로 한 번 시험해보기" 1-click. JSZip으로
  minimal HWPX 즉석 생성 → 큐 추가. 가짜 PII가 가려지는 동시에 조직명·일반어는
  그대로 남아 v1.3 정의를 사용자에게 시연.
- **푸터 모델 상태 점** — 사이드패널 메인에 "🟢 AI 보호 켜짐" 작은 점. 게이트는
  통과 후 다시 보이지 않음.

### Fixed (회귀 잠금)

- **`tests/hwp-roundtrip.test.ts`** — `sample/1.hwpx` 명시 회귀: PrvText.txt segment
  포함 + 조직명·일반어("한국사회적기업진흥원"·"선착순"·"노트북" 등 10종)가 정규식
  detect로 안 잡힘 검증.
- **`src/sidepanel/parsers/ooxml-docprops.test.ts`** (신규) — docProps 추출/치환/
  XML 이스케이프 보존 7 케이스.
- **`src/sidepanel/demo-fixture.test.ts`** (신규) — 데모 HWPX 구조·MIME·합성 PII
  존재 4 케이스.
- **`src/sidepanel/parsers/parsers.test.ts`** — XLSX `wb.Props`/`Custprops`/`cell.c`
  추출 + round-trip 마스킹 검증. PDF 단위 테스트는 vitest node 환경의 pdfjs-dist DOM
  의존성으로 skip 처리, e2e 회귀에 의존.
- **`src/sidepanel/parsers/image.test.ts`** (신규) — `exifMetaToSegments` 순수 함수
  단위 검증(허용 키 필터링, NFC 정규화, 빈 값 제외) + `exportImage` footer 출력
  검증. parseImage 자체는 Tesseract worker가 vitest node에서 미작동이라 단위 미커버.

---

## [1.2.0] — 2026-04-29

온디바이스 NER 광고와 실 동작이 일치하도록 호출자 라우팅 통합 + perplexity 후킹
강건성 보강 + 첫 paste 모델 워밍업. 회귀 테스트 240 → 267 통과.

### Added (신규 기능)

- **NER 통합 (Finding 3 해결)** — paste 후킹과 사이드패널 파일 마스킹이
  background `DETECT_REQUEST`로 라우팅되어 정규식 + AEGIS NER을 실제로 합산.
  v1.1.0까지는 호출자가 정규식만 호출해 50MB 모델 다운로드가 효과 0이었음.
  자연 문장 안 사람 이름(예: "조성도가 작성한 보고서") 보강이 핵심 가치.
- **모델 사전 워밍업** — content script가 페이지 진입 시 background에 dummy
  detect 1회 보내 offscreen이 IndexedDB에서 모델을 메모리로 사전 로드.
  사용자의 첫 paste에서 모델 로드 ~3-5s wait 제거. 미설치 사용자는 정규식
  폴백이라 영향 없음.
- **NER 후처리 — SURNAME+GIVENNAME 머지 + 조사 trim** — AEGIS는 한국어
  이름을 두 라벨로 분리 출력(예: "조성도" → "조"+"성도")하므로 인접 머지
  후처리 필수. 매치 끝이 조사·존칭("의","가","씨","님" 등)이면 한 글자
  trim해서 마스킹 결과 텍스트 무결성 보장.
- **AEGIS PII 자연 문장 평가 자동화** — `scripts/eval-aegis/run.mjs` +
  `cases.json`. 36 cases 회귀 측정 결과 person_name F1=0.966, FP 0/8,
  평균 추론 5ms/case. 자세한 결과: [docs/EVAL_AEGIS_v1.2.md](docs/EVAL_AEGIS_v1.2.md).
- **`shared/lib/detect-client`** — content/sidepanel이 사용하는 background
  DETECT_REQUEST 클라이언트. timeout/runtime 부재/ERROR 모두 정규식 폴백
  으로 다단계 안전망.

### Changed (개선)

- **paste listener를 window+document 양쪽 capture phase에 등록 (Finding 2 보강)**
  — `defaultPrevented` 가드로 중복 처리 방지. window가 더 외부라 SPA의
  capture handler에 가려지지 않으며 document fallback이 legacy 환경 대비.
  (기존 PR #15에서 contenteditable 매처는 이미 적용 + 실 perplexity에서
  동작 검증 완료.)
- **manifest host_permissions에 `https://perplexity.ai/*` (root) 추가** —
  사용자가 www 없이 직접 접근 시 redirect 전에도 content script가 inject되도록.
- **MIN_CONFIDENCE 0.5 → 0.3** — 자연 문장 paste에서 모델 신뢰도가 0.5에
  못 미치는 케이스 다수 확인. 부정 케이스 FP 0/8로 안전성 검증.
- **사이드패널 파일 마스킹이 segment-level 진행률** — `mask-segments`가
  비동기로 변환되며 `onProgress` 콜백 노출. 파일 큐가 50→80% 사이를 보간.
- **vite/playwright config을 env override 가능하게** — `VITE_PORT`,
  `VITE_HMR_PORT`, `PLAYWRIGHT_BASE_URL` 환경변수로 평행 worktree 지원.

### Fixed (버그 수정)

- **README/UI 광고 ↔ 실 동작 불일치 (Finding 3)** — 위 NER 통합으로 해결.
- **Playwright e2e의 closed Shadow DOM piercing 시도** — closed shadow는
  의도된 보안 격리이므로 host element 존재 + closed mode lock으로 검증
  변경. 사이드패널 사람 이름 selector를 `switch` role로 좁혀 combobox
  중복 매치 회피.

### Verified

- vitest **267 passed** (기존 242 + 신규 25: NER 후처리 12, detect-client
  6, mask-segments 7).
- Playwright e2e **9 passed** (paste-modal smoke 2 + screenshots 7).
- 실 브라우저(perplexity.ai) — Claude in Chrome MCP로 paste 시뮬레이션:
  `defaultPrevented: true`, shadow host mount 확인. 자세한 검증 기록:
  [docs/QA_VERIFICATION_v1.2.md](docs/QA_VERIFICATION_v1.2.md).

### Known limitations

- 첫 paste의 모델 워밍업은 페이지 진입 시점에 시작. 페이지 진입 직후 즉시
  paste하면 워밍업 미완료 상태에서 정규식 폴백으로 응답. 다음 paste부터는
  모델 적용. 사용자 인지 거의 없음.
- 번호류(mobile/email/rrn/card/account 등)는 AEGIS가 학습 분포 외라 NER이
  추가 가치 없음. 정규식 단독이 우월. NER + 정규식 합산이 v1.2의 핵심
  가치(자연 문장 안 사람 이름 보강).

---

## [1.1.0] — 2026-04-29

마스킹 정확도 대폭 개선 + 모든 주요 파일 포맷에서 표 헤더 인식. 회귀 테스트
194 → 240 통과. 사용자 NPO 실 데이터 회귀 코퍼스에서 마스킹 spans 약
80건 → 168건으로 약 2배 증가.

### Added (신규 기능)

- **사람 이름 부분 가림 모드 (`partial`)** — `조성도 → 조O도`처럼 첫·끝 글자만
  노출. NPO 보고서에서 같은 사람을 다수 행에 걸쳐 추적해야 할 때 사용.
  2자 이름은 첫 글자만(`김민→김O`), 4자는 양 끝만(`남궁아무→남OO무`).
- **표 헤더 자동 인식 + 강제 마스킹** — xlsx/csv/docx/pptx/hwp/hwpx의
  표 첫 row를 키워드 사전(성명/연락처/이메일/계좌/주민번호 등 15 카테고리)과
  매칭해 컬럼별 카테고리 강제 부여. 헤더 행 자체는 마스킹 제외.
- **인라인 라벨 패턴** — 표 구조가 없는 포맷(txt/pdf 등)에서 `성명: 조성도`,
  `연락처 010-...` 같은 라벨/값 패턴 감지해 값 영역을 카테고리별 강제 마스킹.
- **이름 힌트 컬럼 (`nameHintOnly`)** — 신분증/통장사본/이력서/면허증/약력/CV
  컬럼에서 컨텍스트 제한 2~4자 이름 매칭 활성화. `_박영.pdf`, `김아무개_약력`
  같이 짧거나 긴 이름까지 처리.
- **로마자 한국 이름** — `KimAB`, `KimDoeFoo`, `DoeFooKim` 같이 한국
  성씨 영문 표기 + CamelCase 패턴 매칭. 파일명 안 `_KimDoeFoo.pdf`도 동작.
- **파일명 internal token** — `임꺽정이력서_202402.doc`처럼 이름과 정형단어가
  구분자 없이 붙은 경우 이름 부분만 매치.
- **은행 prefix 계좌번호 detector** — 은행명 prefix 다음 다양한 자릿수 형식
  (3-6-5, 6-2-6, 3-3-5 등) 모두 인식.
- **조직명 detector** — `○○대학교`, `○○법인`, `○○재단` 한국어 + KAIST/POSTECH
  영문 약어 화이트리스트.

### Changed (개선)

- **NAME_BARE 정규식 확장** — 한국 성씨 사전에 `'선'` 추가, 복성 8개(남궁/황보/
  제갈/사공/선우/서문/독고/을지) 분리 매칭. NAME_WITH_TITLE 1~3자 이름 허용
  (단성+3자=`김아무개 박사`, 복성+3자=`남궁아무개 교수`).
- **stoplist 광범위 보강** — 정형 양식 어휘 30+ 항목 추가(이메일/이력서/신분증/
  단체명/주문서/지원자 등). 4자 일반 한자어 stoplist도 별도 보강.
- **조사 차단 리스트 정밀화** — `'만'/'도'` 제거 (지석만/김민도 같은 이름 끝글자).
- **모든 파서에 NFC 정규화 일관 적용** — txt/docx/pptx/pdf/hwp/hwpx/image.
  macOS Finder가 한글 파일명을 NFD(자모 분해)로 저장해 정규식 `[가-힣]`이
  매치 못 하던 이슈 해결.

### Fixed (버그 수정)

- **헤더 행 오탐** — `이메일`, `신분증`, `이력서` 같은 헤더 텍스트가
  person_name으로 오탐되어 `●●●`로 망가지던 문제 (헤더 인식으로 자동 해결).
- **동일 셀 중복 매칭 누락** — `7.성춘향-주민등록증사본_성춘향.pdf` 같이
  같은 이름이 한 셀에 여러 번 등장할 때 둘 중 하나가 NFD 자모 분해돼 누락되던
  문제. NFC 정규화로 해결.

### 새 파일

- `src/background/pii/header-hints.ts` — 헤더 키워드 사전 + 표 헤더 감지
- `src/sidepanel/parsers/table-walker.ts` — XML 기반 포맷 공용 표 walker
- `src/sidepanel/mask-segments.ts` — segment 단위 detect+mask 로직 분리

### 남은 한계 (백로그)

- PDF 표 구조 추출 — pdfjs textContent의 x/y 좌표 클러스터링 필요. v1.2+
- 파일명 안 raw digit run (`우리은행계좌10020030405060.jpg`) — 별도 작업
- korean_ner 모델 활성화·튜닝 — v1.2 이후

---

## [1.0.0] — 2026-04-28

Chrome Web Store 첫 출시. 디자인 review 통과 + 라이트/다크 토글 + WASM CSP
정정 + 13개 파일 형식 + 17개 PII 카테고리 + AEGIS PII 모델 + Tesseract OCR.

### Added (출시 ship-blocker 완료)

- **17개 PII 카테고리** 정규식 + 체크섬 검증
  - 사람 이름 / 주민등록번호 / 외국인등록번호 / 운전면허번호 / 여권번호
  - 휴대폰 번호 / 유선전화 / 이메일 / 주소
  - 카드번호 / 계좌번호 / 사업자등록번호 / 법인등록번호
  - 조직명 / URL / 날짜 / 비밀번호·인증키
- **4가지 마스킹 모드** — 형태 보존 / 태그 치환 / 가짜 데이터 / 완전 제거.
  드롭다운에 카테고리별 예시 부기.
- **5개 LLM 사이트 어댑터** — ChatGPT · Claude · Gemini · Perplexity · 오렌지임팩트
- **13개 파일 형식 파서** — PDF · DOCX · PPTX · XLSX · XLS · CSV · TXT · HWP · HWPX · PNG · JPG · JPEG · WEBP
- **이미지 OCR** — Tesseract.js 7.0 (한국어+영어), self-host worker/wasm/lang
- **온디바이스 NER** — AEGIS PII 모델 (mBERT 기반, INT8 양자화 ~50MB).
  사이드 패널에서 명시 설치, IndexedDB 캐시
- **Peak-End 카운터** — confirm 시 누적 마스킹 통계, 0건일 땐 숨김
- **화이트리스트 도메인** — 특정 사이트에서 paste 모달 비활성
- **파일 크기 상한** — 100MB/파일, 500MB/큐 합계 (OOM/ReDoS 방어)
- **모델 다운로드 유도 배너** — 첫 사이드 패널 진입 시 헤더 아래 강조
- **사용자 친화 텍스트** — NER/PII/mBERT/AEGIS 등 기술 용어 제거,
  모델명만 작은 회색 부기로 식별 정보 보존
- **사이트 어댑터 Playwright skeleton** — 야간 smoke (test-page 기반)
- **HWPX round-trip 회귀** — 31개 합성 fixture × parse → mask → export → re-parse
- **Seed P/R 회귀 코퍼스** — 25개 fixture × 카테고리별 P/R/F1 게이트
- **위협 모델 + 개인정보 처리방침** — [docs/THREAT_MODEL.md](docs/THREAT_MODEL.md), [docs/PRIVACY_POLICY.md](docs/PRIVACY_POLICY.md)
- **Paste 동작 가이드** — [docs/PASTE_GUIDE.md](docs/PASTE_GUIDE.md)
- **브랜드 아이콘** — 16/48/128 PNG (SVG 자동 변환)
- **manifest 보안 회귀 테스트** — externally_connectable 부재, 최소 권한 lock

### Changed (UX 통합)

- **모델 탭 제거** → 헤더 바로 아래 ModelManager 인라인. 사용자가 사이드 패널
  열자마자 "설치하기" 버튼 즉시 노출. 탭 이동 마찰 0.
- **카테고리 순서 재정렬** — 사람 이름 우선, 운전면허/법인등록 신규 추가,
  미국 SSN/국제 전화 제거
- **AEGIS PII를 default 모델로** — 영문 NER fallback 제거 (영문 F1 0.91이라
  fallback도 동등 cover)
- **자동 워밍업 제거** — 50MB 자동 다운로드 X. 사용자 명시 클릭 후만 시작
- **헤더 부텍스트 분리** — 두 줄로 가독성 향상

### Security

- **MV3 strict CSP 안전** — ORT WASM + Tesseract worker 모두 `public/`에 self-host
- **Closed Shadow DOM** — 호스트 페이지가 모달 DOM 접근 불가
- **최소 권한** — storage/sidePanel/offscreen 3개만. tabs/cookies/webRequest 부재
- **externally_connectable 부재** — 외부 확장/사이트 메시지 차단 (manifest 회귀 테스트로 lock)
- **NPM 의존성 audit** — 8건(5 moderate / 3 high) 모두 dev-only 또는 mitigation
  적용 ([THREAT_MODEL #2](docs/THREAT_MODEL.md))

### Infrastructure

- **빌드 자동화** — `prebuild`/`predev` 훅으로 Tesseract self-host + 아이콘 생성
- **193개 단위/통합 테스트** — vitest. 카테고리별 정규식, 마스킹, 라우터, 머지,
  파서 round-trip, manifest 회귀, mapLabel 매핑
- **Tesseract variant 선택** — `TESSDATA_VARIANT=best` 환경 변수로 fast(~1.6MB) ↔ best(~13MB) 전환

### Known Limitations

- HWP 5.x (OLE2)는 hwp.js read-only — round-trip 불가, smoke만. v2에서 rhwp WASM 검토.
- DOC/PPT (Office 97-2003 binary) 미지원. v2.
- 첫 OCR 시 ~10MB 다운로드 (worker 110KB + core 3.4MB + lang ~5MB), IndexedDB 캐시 후 오프라인.
- P/R 게이트 코퍼스 56개 (목표 ≥500). NPO 실 데이터 수집 후 강화.

### Plan 슬라이스 추적

S1–S20 진행:
- ✅ S1–S14: 초기 빌드 (regex, mask, router, parsers, file queue, settings, sidepanel)
- ✅ S15: Tier 2 모델 → AEGIS PII로 unblock
- ✅ S16: Peak-End 카운터 + a11y polish + Korean honorific
- ✅ S17: Threat Model + Privacy Policy
- ⚠️ S18 (부분): seed 25 + HWPX 31 = 56 fixture (목표 ≥500은 NPO 실 데이터 필요)
- ⚠️ S19 (부분): HWPX 31 + sample 2 + Playwright skeleton + paste 가이드
  (HWP 5.x round-trip은 read-only 한계로 미지원)
- ❌ S20: NPO 베타 사용자 5명 + CWS 출시 (사용자 측 작업)

---
