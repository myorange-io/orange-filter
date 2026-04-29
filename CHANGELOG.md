# Changelog

본 파일은 [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) 형식 + 한국어 명세.
버전: SemVer (MAJOR.MINOR.PATCH).

---

## [1.1.0] — 2026-04-29

마스킹 정확도 대폭 개선 + 모든 주요 파일 포맷에서 표 헤더 인식. 회귀 테스트
194 → 240 통과. 사용자 NPO 실 데이터 회귀 코퍼스에서 마스킹 spans 약
80건 → 168건으로 약 2배 증가.

### Added (신규 기능)

- **사람 이름 부분 가림 모드 (`partial`)** — `김갑돌 → 김O돌`처럼 첫·끝 글자만
  노출. NPO 보고서에서 같은 사람을 다수 행에 걸쳐 추적해야 할 때 사용.
  2자 이름은 첫 글자만(`김민→김O`), 4자는 양 끝만(`남궁아무→남OO무`).
- **표 헤더 자동 인식 + 강제 마스킹** — xlsx/csv/docx/pptx/hwp/hwpx의
  표 첫 row를 키워드 사전(성명/연락처/이메일/계좌/주민번호 등 15 카테고리)과
  매칭해 컬럼별 카테고리 강제 부여. 헤더 행 자체는 마스킹 제외.
- **인라인 라벨 패턴** — 표 구조가 없는 포맷(txt/pdf 등)에서 `성명: 김갑돌`,
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
