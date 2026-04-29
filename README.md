# Orange Filter v1.3.0 소개

LLM에 텍스트를 붙여넣거나 파일을 올리기 전에, 사용자의 PC 안에서 개인정보를 가려내고 마스킹하는 Chrome 확장을 소개합니다.

---

오늘 우리는 한국 비영리(NPO) 현장의 개인정보 보호 격차를 메우기 위한 도구를 공개합니다. Orange Filter는 ChatGPT·Claude·Gemini·Perplexity·오렌지임팩트 등 LLM 인터페이스 앞단에서 동작하며, 결산공시·기부금 명세서 같은 정형 양식이 외부 모델에 노출되기 전에 사적 개인 식별 정보(PII)를 탐지·마스킹합니다.

Orange Filter는 두 가지 입력 경로 — **paste 후킹**과 **파일 업로드** — 양쪽에서 동일한 마스킹 파이프라인을 적용합니다. 모든 처리는 디바이스 안에서 끝나며, 가공되지 않은 데이터를 외부 서버로 전송하지 않습니다.

이번 릴리스(v1.3.0)는 **메타데이터 누출 채널을 정조준**합니다. 본문이 잘 가려져도 zip 안 메타데이터 파일에 작성자·후원자 명단이 남던 결함을 차단했습니다 — HWPX `Preview/PrvText.txt`, OOXML `docProps/*.xml`(DOCX/PPTX 작성자·키워드·회사), XLSX `wb.Props`/`Custprops` + 셀 코멘트, PDF 정보 dictionary(Title/Author/Subject/Keywords), 이미지 EXIF/XMP/IPTC 텍스트 채널까지 동일 마스킹 파이프라인에 통합했습니다. 동시에 **PII 정의를 정정**해 조직명·일반 명사를 마스킹 대상에서 제외했고(공공기관·공무 담당자·공식 직책은 보호 대상이 아님), **모델 설치 게이트**를 도입해 한국어 정밀 보호 모델 미설치 상태에서 부정확한 보호로 거짓 안심을 주지 않습니다. 회귀 테스트는 267 → 293(2 skip)통과로 늘어났습니다.

## 정형 양식까지 폭넓게 처리하는 PII 탐지

기존 정규식 기반 도구는 휴대폰·이메일 같은 형태가 명확한 정보에는 잘 동작하지만, 표 헤더 아래 셀이나 파일명 안에 박힌 이름처럼 문맥에 의존하는 식별자는 자주 놓칩니다. Orange Filter는 다음 세 단계를 결합해 이 격차를 메웁니다.

- **정규식 + 체크섬** — 주민등록번호·외국인등록번호·사업자등록번호·카드번호(Luhn)·운전면허번호를 자릿수 검증 후에만 마스킹.
- **표 헤더 인식** — `xlsx`/`csv`/`docx`/`pptx`/`hwp`/`hwpx` 첫 행을 키워드 사전(성명/연락처/이메일/계좌 등 15 카테고리)과 매칭해 컬럼별로 카테고리를 강제 부여.
- **온디바이스 NER** — 한국어 정밀 보호 모델(AEGIS PII, mBERT 기반, 약 50MB)을 사이드 패널에서 한 번 설치하면 인터넷 없이도 동작.

탐지 결과가 충돌할 경우 더 구체적인 스팬과 높은 confidence가 우선합니다.

## 17개 카테고리, 4가지 마스킹 모드

탐지하는 PII 카테고리는 다음과 같습니다.

```
사람 이름      주민등록번호    외국인등록번호   운전면허번호
여권번호       휴대폰 번호     유선전화         이메일
주소           카드번호         계좌번호         사업자등록번호
법인등록번호   조직명           URL              날짜
비밀번호·인증키
```

각 카테고리별로 4 + 1가지 마스킹 모드를 선택할 수 있습니다.

- **형태 보존** — `010-XXXX-XXXX`처럼 길이와 포맷 유지
- **태그 치환** — `[휴대폰]`, `[이름]` 같은 의미 라벨
- **가짜 데이터** — `010-0000-0000` 같은 placeholder
- **부분 가림 (partial)** — 사람 이름 한정. `조성도 → 조O도`, `김민 → 김O`, `남궁아무 → 남OO무`
- **완전 제거** — 빈 문자열

## 동작 방식

Orange Filter는 두 진입점에서 같은 마스킹 파이프라인을 실행합니다.

1. **paste 후킹** — 지원 도메인에서 입력창에 붙여넣기 시 closed Shadow DOM 모달이 뜹니다. 미리보기에서 카테고리별로 켜고 끌 수 있고 모드도 즉석에서 변경 가능합니다.
2. **파일 업로드** — 사이드 패널에 파일을 드래그하면 셀·텍스트 노드 단위로 PII를 추출·마스킹한 뒤 같은 형식으로 다시 저장합니다. 13개 파일 형식(PDF / DOCX / PPTX / XLSX / XLS / CSV / TXT / HWP / HWPX / PNG / JPG / JPEG / WEBP)을 지원하며, 본문은 물론 zip 안 메타데이터 파일(HWPX `Preview/PrvText.txt`, OOXML `docProps/*.xml`, XLSX 셀 코멘트, PDF 정보 dictionary)까지 마스킹합니다. 이미지는 Tesseract.js(한국어+영어)로 OCR 후 `.txt` fallback으로 저장되며, EXIF/XMP/IPTC 텍스트 메타데이터(Artist·Copyright·ImageDescription·UserComment 등)도 함께 마스킹돼 출력 .txt 끝 `[이미지 메타데이터]` 섹션에 표시됩니다.

## 입력 텍스트 예시

```
no.   소속        성명     연락처            이메일                  계좌정보
1     단체A       홍길동   010-1234-5678     hong@example.com         우리 1002-100-100100
2     단체B       김철수   010-2345-6789     kim@example.com          우리 1002-200-200200
3     단체C       박영     010-3456-7890     park@example.com         하나 333-333333-33333
```

## 마스킹된 텍스트

```
no.   소속        성명     연락처            이메일                       계좌정보
1     단체A       ●●●     010-XXXX-XXXX     h***@example.com             우리 100X-XXX-XXX100
2     단체B       ●●●     010-XXXX-XXXX     k**@example.com              우리 100X-XXX-XXX200
3     단체C       ●●      010-XXXX-XXXX     p***@example.com             하나 333-XXXXXX-XX333
```

`소속`/`성명`/`연락처`/`이메일`/`계좌정보` 헤더가 자동 인식되어 같은 컬럼의 모든 데이터 셀이 적절한 카테고리로 마스킹됩니다. 2글자 이름(`박영`)도 컨텍스트로 처리되며, 파일명 컬럼(신분증·통장사본·이력서)에서는 컨텍스트 제한 매칭이 추가로 활성화됩니다.

## 표 구조 추출

이번 릴리스에서는 OOXML/HWPX/HWP 포맷의 표를 셀 단위로 식별합니다.

| 포맷 | 표 추출 | 헤더 인식 | 데이터 셀 강제 카테고리 |
|------|---------|-----------|--------------------------|
| xlsx, csv | ✅ | ✅ | ✅ |
| docx | ✅ `<w:tbl>` | ✅ | ✅ |
| pptx | ✅ `<a:tbl>` (슬라이드 안) | ✅ | ✅ |
| hwpx | ✅ `<hp:tbl>` | ✅ | ✅ |
| hwp | ✅ TableControl (hwp.js walker) | ✅ | ✅ |
| pdf | ⏸️ 보류 (별도 작업) | — | — |
| txt, image | 표 구조 부재 — 인라인 라벨 패턴(`성명: 조성도`)으로 처리 | — | — |

모든 파서에 NFC 정규화가 일관 적용되어 macOS Finder의 NFD 자모 분해 케이스도 정확히 매치됩니다.

## 설치

### Chrome 웹 스토어

검토 통과 후 Chrome 웹 스토어에서 "Orange Filter" 검색 후 설치할 수 있습니다. 사이드 패널을 처음 열면 게이트 화면이 표시되며 한국어 정밀 보호 모델(약 50MB)을 1회 다운로드합니다 — 이후 인터넷 없이도 동작합니다. 모델 미설치 상태에서는 부정확한 보호로 거짓 안심을 주지 않도록 입력 UI 자체를 차단합니다.

### 개발자 빌드

```bash
git clone https://github.com/myorange-io/orange-filter.git
cd orange-filter
bun install
bun run build       # tsc + vite + Tesseract self-host + 아이콘 생성
```

빌드 결과 `dist/`를 Chrome에 unpacked로 로드:

1. `chrome://extensions` → 개발자 모드 ON
2. "압축 해제된 확장 프로그램 로드" → `dist/` 선택
3. 사이드 패널 첫 진입 시 "한국어 정밀 보호 모델 설치하기" 클릭(1회)

| 명령 | 설명 |
|------|------|
| `bun run dev` | Vite dev 서버 + HMR |
| `bun run build` | production 빌드 |
| `bun run test` | Vitest 295 tests (293 통과 + 2 PDF skip) |
| `bun run e2e` | Playwright headless smoke |
| `bun run setup:tesseract` | Tesseract worker/wasm/lang 다운로드 |
| `bun run install:hooks` | pre-commit PII 차단 훅 설치 (clone 직후 1회) |

## 아키텍처

```
┌────── Host Page (chatgpt.com 등) ───────┐
│  paste event (capture)                   │
└────────────────┬─────────────────────────┘
                 ▼
┌─── content script (isolated world) ─────┐
│  closed Shadow DOM + Radix Dialog       │
└────────────────┬────────────────────────┘
                 │ chrome.runtime.sendMessage
                 ▼
┌─── Service Worker ───┐  ┌─── Offscreen Document ───┐
│ 정규식 + 헤더 인식    │ →│ Transformers.js NER 추론 │
│ + 마스킹 라우팅       │  └────────┬─────────────────┘
└──────────────────────┘           ▼
                             IndexedDB (모델 캐시)
```

핵심 파일:

- [src/background/pii/regex.ts](src/background/pii/regex.ts) — 17 카테고리 정규식 + 체크섬
- [src/background/pii/header-hints.ts](src/background/pii/header-hints.ts) — 헤더 키워드 사전 + 인라인 라벨
- [src/background/pii/mask.ts](src/background/pii/mask.ts) — 5가지 마스킹 모드
- [src/sidepanel/parsers/](src/sidepanel/parsers/) — 13개 파일 형식 round-trip 파서
- [src/sidepanel/parsers/table-walker.ts](src/sidepanel/parsers/table-walker.ts) — OOXML/HWPX 공용 표 walker
- [src/offscreen/model-runtime.ts](src/offscreen/model-runtime.ts) — Transformers.js NER 호스트

## 제약 사항

Orange Filter는 익명화 도구가 아니며, 컴플라이언스 인증이나 높은 수준의 판단을 대체하지 않습니다. 마스킹은 광범위한 프라이버시 중심 설계의 한 요소로 사용해야 합니다.

다음 한계를 기억해주세요.

- **PDF 표 구조 추출 미지원** — pdfjs textContent의 좌표 클러스터링이 fragile해 v1.2 이후로 보류. 현재는 인라인 라벨 패턴만 동작.
- **로마자 한국 이름 일부 누락** — `Kim`/`Lee`/`Park` 등 30개 성씨 영문 표기 + CamelCase만 인식. 그 외 표기는 미탐지 가능.
- **드물게 쓰이는 식별자** — 외국인 등록번호 외 비표준 신분증 번호, 주민증과 다른 자릿수의 ID 카드는 별도 정규식이 필요할 수 있음.
- **2자 이름의 본문 출현** — 표 헤더 컬럼 외 일반 텍스트에서 2글자 한국 이름은 FP 위험으로 NAME_BARE가 차단합니다.

법률·의료·금융처럼 민감도가 높은 분야에서는 사람의 검토와 도메인 특화 평가가 여전히 중요합니다.

## 보안 / 프라이버시

- 위협 모델: [docs/THREAT_MODEL.md](docs/THREAT_MODEL.md) (STRIDE, 5 Open Items)
- 개인정보 처리방침: [docs/PRIVACY_POLICY.md](docs/PRIVACY_POLICY.md)
- paste/파일 동작 명세: [docs/PASTE_GUIDE.md](docs/PASTE_GUIDE.md)

핵심 약속:

- **외부 서버 전송 0건** — 모델 가중치 1회 다운로드 외 텔레메트리 부재
- **MV3 strict CSP 안전** — ORT WASM + Tesseract worker 모두 self-host
- **최소 권한** — `storage` / `sidePanel` / `offscreen` 3개. tabs/cookies/webRequest 부재

## 향후 과제

Orange Filter는 NPO 현장의 정형 양식 처리에 초점을 맞추면서도, 정확도와 안전한 기본값을 동시에 갖추도록 설계되었습니다. 다음 마일스톤에서는 PDF 좌표 기반 표 추출, 한국어 NER 모델 튜닝, 더 다양한 NPO 양식 fixture 확장을 다룰 예정입니다.

이번 릴리스는 NPO 동료들과 보안·프라이버시 커뮤니티의 피드백을 바탕으로 향후 정확도를 더 끌어올릴 계획입니다.

## 라이선스

- 본 확장 코드: TBD (출시 전 확정)
- 의존성 라이선스: [LICENSES/](LICENSES/) 폴더 참조
- AEGIS PII 모델: Apache-2.0 ([YATAV-ENT/aegis-personal-pii-ner](https://huggingface.co/YATAV-ENT/aegis-personal-pii-ner))
- Tesseract traineddata: Apache-2.0
- Pretendard 폰트: SIL Open Font License 1.1

## 문의

- 이슈 / PR: [GitHub Issues](https://github.com/myorange-io/orange-filter/issues)
- 보안 우려: pengdo@myorange.io (개인정보 처리방침 §11)

---

작성자: 마이오렌지 / 오렌지임팩트
릴리스: v1.3.0 — 2026-04-30
