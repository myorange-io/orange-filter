# Orange Filter

비영리 업무에 ChatGPT·Gemini·Claude·오렌지임팩트 같은 생성형 AI를 안전하게 쓰기 위한 Chrome 확장입니다. 텍스트를 붙여넣거나 파일을 올리기 전, 사용자의 PC 안에서 개인정보를 가려냅니다.

회원 명부·후원자 정보·결산공시·기부금 명세서처럼 비영리 단체가 자주 다루는 자료에는 사적 개인 식별 정보(PII)가 섞여있습니다. 이 자료를 LLM에 그대로 올리는 순간 외부 서버로 빠져나갑니다. Orange Filter는 그 직전 단계에서, 외부 전송이 일어나기 전에 디바이스 안에서 PII를 탐지·마스킹합니다.

## 어떻게 가려지나

실제 입력:

```
no.   소속        성명     연락처            이메일                  계좌정보
1     단체A       홍길동   010-1234-5678     hong@example.com         우리 1002-100-100100
2     단체B       김철수   010-2345-6789     kim@example.com          국민 031-88-8888-888
3     단체C       박영     010-3456-7890     park@example.com         하나 333-333333-33333
```

마스킹된 결과:

```
no.   소속        성명     연락처            이메일                       계좌정보
1     단체A       ●●●     010-XXXX-XXXX     h***@example.com             우리 100X-XXX-XXX100
2     단체B       ●●●     010-XXXX-XXXX     k**@example.com              국민 03X-XX-XXXX-XX8
3     단체C       ●●      010-XXXX-XXXX     p***@example.com             하나 333-XXXXXX-XX333
```

`성명`·`연락처`·`이메일`·`계좌정보` 헤더가 자동 인식되어 같은 컬럼의 모든 데이터 셀이 카테고리별로 마스킹됩니다. 2글자 이름도 컨텍스트로 처리되며, 단체명은 PII가 아니므로 그대로 둡니다.

## 가리는 정보

17개 카테고리를 탐지합니다.

```
사람 이름      주민등록번호    외국인등록번호   운전면허번호
여권번호       휴대폰 번호     유선전화         이메일
주소           카드번호         계좌번호         사업자등록번호
법인등록번호   조직명           URL              날짜
비밀번호·인증키
```

각 카테고리별로 마스킹 모드를 선택할 수 있습니다.

- **형태 보존** — `010-XXXX-XXXX`처럼 길이와 포맷 유지
- **태그 치환** — `[휴대폰]`, `[이름]` 같은 의미 라벨
- **가짜 데이터** — `010-0000-0000` 같은 placeholder
- **부분 가림** — 사람 이름 한정. `조성도 → 조O도`, `김민 → 김O`, `남궁아무 → 남OO무`
- **완전 제거** — 빈 문자열

## 두 가지 사용법

Orange Filter는 두 진입점에서 같은 마스킹 파이프라인을 실행합니다.

**1. 붙여넣기 후킹** — ChatGPT·Claude·Gemini·Perplexity·오렌지임팩트 입력창에 텍스트를 붙여넣으면 미리보기 창이 뜹니다. 이 창은 웹페이지가 들여다볼 수 없도록 분리된 영역(closed Shadow DOM)에 떠 있어, 사이트 코드가 마스킹 전 원문을 가로챌 수 없습니다. 미리보기에서 카테고리별로 켜고 끌 수 있고 마스킹 방식도 즉석에서 바꿀 수 있습니다. 확인을 누르면 마스킹된 텍스트가 입력창에 들어갑니다.

**2. 파일 업로드** — 사이드 패널에 파일을 드래그하면 셀·텍스트 노드 단위로 PII를 추출·마스킹한 뒤 같은 형식으로 다시 저장합니다. 지원 형식은 HWP·HWPX·DOCX·XLSX·PPTX·CSV·TXT·PDF·PNG·JPG·WEBP 11종입니다. 본문뿐 아니라 파일에 숨어있는 메타데이터(작성자·제목·수정자 같은 문서 속성, 셀 코멘트, PDF 정보, 이미지 EXIF 등)까지 마스킹합니다. 이미지는 OCR(Tesseract.js, 한국어+영어)로 글자를 읽어낸 뒤 `.txt`로 저장됩니다.

## 설치

Chrome 웹 스토어에서 **"Orange Filter"** 를 검색해 설치합니다.

사이드 패널을 처음 열면 안내 화면이 표시되며 한국어 정밀 보호 모델(약 170MB)을 1회 다운로드합니다 — 이후 인터넷 없이도 동작합니다. 모델이 설치되기 전까지는 입력 UI 자체를 차단합니다. 부정확한 보호로 거짓 안심을 주지 않기 위함입니다.

## 어떤 점을 주의해야 하나

Orange Filter는 익명화 도구가 아니며, 컴플라이언스 인증이나 사람의 판단을 대체하지 않습니다. 마스킹은 광범위한 프라이버시 중심 설계의 한 요소로 사용해야 합니다.

다음 한계를 기억해주세요.

- **로마자 한국 이름 일부 누락** — `Kim`/`Lee`/`Park` 등 30개 성씨 영문 표기 + CamelCase만 인식. 그 외 표기는 미탐지 가능.
- **드물게 쓰이는 식별자** — 외국인 등록번호 외 비표준 신분증 번호, 주민증과 다른 자릿수의 ID 카드는 별도 정규식이 필요할 수 있음.
- **2자 이름의 본문 출현** — 표 헤더 컬럼 외 일반 텍스트에서 2글자 한국 이름은 오탐 위험으로 차단됩니다.

법률·의료·금융처럼 민감도가 높은 분야에서는 사람의 검토가 여전히 중요합니다.

## 무엇이 안전한가

- **외부 서버 전송 0건** — 모델 가중치 1회 다운로드 외, 사용 기록을 보내는 통신이 일체 없습니다.
- **분리된 미리보기 영역** — 마스킹 미리보기 창은 ChatGPT·Claude 같은 사이트가 들여다볼 수 없는 영역(closed Shadow DOM)에 떠 있어, 사이트 코드가 마스킹 전 원문을 가로챌 수 없습니다.
- **최소 권한** — Chrome에 요구하는 권한은 `storage`(설정 저장) / `sidePanel`(사이드 패널 표시) / `offscreen`(모델 실행) 3개뿐입니다. 브라우저 탭·쿠키·네트워크 요청에는 접근하지 않습니다.
- **검증된 보안 설정(MV3 strict CSP)** — AI 추론 엔진(ONNX Runtime)과 OCR 워커를 모두 확장 안에 직접 포함해, 외부 스크립트를 끌어오지 않습니다.

상세 문서:

- 위협 모델: [docs/THREAT_MODEL.md](docs/THREAT_MODEL.md) (STRIDE, 5 Open Items)
- 개인정보 처리방침: [docs/PRIVACY_POLICY.md](docs/PRIVACY_POLICY.md)
- paste/파일 동작 명세: [docs/PASTE_GUIDE.md](docs/PASTE_GUIDE.md)

## PII 탐지 방식

기존 정규식 기반 도구는 휴대폰·이메일 같은 형태가 명확한 정보에는 잘 동작하지만, 표 헤더 아래 셀이나 파일명 안에 박힌 이름처럼 문맥에 의존하는 식별자는 자주 놓칩니다. Orange Filter는 세 단계를 결합해 이 격차를 메웁니다.

- **정규식 + 체크섬** — 주민등록번호·외국인등록번호·사업자등록번호·카드번호·운전면허번호를 자릿수 검증 후에만 마스킹.
- **표 헤더 인식** — `xlsx`/`csv`/`docx`/`pptx`/`hwp`/`hwpx` 첫 행을 키워드 사전(성명/연락처/이메일/계좌 등 15 카테고리)과 매칭해 컬럼별로 카테고리를 강제 부여.
- **온디바이스 NER** — 한국어 정밀 보호 모델(AEGIS PII, mBERT 기반, 약 170MB)을 한 번 설치하면 인터넷 없이도 동작.

탐지 결과가 충돌할 경우 더 구체적인 스팬과 높은 confidence가 우선합니다.

지원 표 추출:

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
- [src/sidepanel/parsers/](src/sidepanel/parsers/) — 파일 형식별 round-trip 파서
- [src/sidepanel/parsers/table-walker.ts](src/sidepanel/parsers/table-walker.ts) — OOXML/HWPX 공용 표 walker
- [src/offscreen/model-runtime.ts](src/offscreen/model-runtime.ts) — Transformers.js NER 호스트

## 라이선스

- 의존성 라이선스: [LICENSES/](LICENSES/) 폴더 참조
- AEGIS PII 모델: Apache-2.0 ([YATAV-ENT/aegis-personal-pii-ner](https://huggingface.co/YATAV-ENT/aegis-personal-pii-ner))
- Tesseract traineddata: Apache-2.0
- Pretendard 폰트: SIL Open Font License 1.1

## 문의

- 이슈 / PR: [GitHub Issues](https://github.com/myorange-io/orange-filter/issues)
- 보안 우려: pengdo@myorange.io (개인정보 처리방침 §11)

---

작성자: 마이오렌지
