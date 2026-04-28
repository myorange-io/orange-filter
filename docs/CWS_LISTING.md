# Chrome Web Store 출시 메타데이터

CWS 개발자 콘솔(https://chrome.google.com/webstore/devconsole) 등록 시 그대로
복사·붙여넣기 가능한 텍스트.

---

## 기본 정보

- **확장 이름**: 오렌지 필터
- **카테고리**: Productivity (생산성) — 부카테고리 Privacy & Security
- **언어**: 한국어 (Korean)
- **가격**: 무료 (Free)

## 짧은 설명 (132자 이내, 한국어)

```
LLM(ChatGPT·Gemini·Claude·오렌지임팩트)에 붙여넣거나 파일을 올리기 전에, 개인정보를 이 PC 안에서 자동으로 가립니다.
```

길이: 73자 ✓

## 긴 설명 (16,000자 이내)

```
오렌지 필터는 NPO·공익법인·기부단체 직원이 결산공시·기부금 명세서를 LLM에
paste할 때 주민등록번호·휴대폰·계좌·인명이 새는 사고를 막기 위해 만든
Chrome 확장입니다.

【핵심 약속】
■ 모든 처리는 이 PC 안에서 이뤄집니다
■ 외부 서버에 전송하지 않습니다
■ 모델 가중치 1회 다운로드 외 외부 통신 없음
■ 텔레메트리·분석 0건

【작동 방식】
1. paste 후킹 — ChatGPT·Gemini·Claude·Perplexity·오렌지임팩트에 붙여넣을 때
   개인정보가 발견되면 모달이 떠 미리보기와 마스킹 옵션 제시.
2. 파일 업로드 — 사이드 패널에 파일을 끌어다 놓으면 자동 추출·마스킹·다운로드.
   PDF/DOCX/PPTX/XLSX/XLS/CSV/TXT/HWP/HWPX/PNG/JPG/JPEG/WEBP 13개 형식.
3. 이미지 OCR — PNG/JPG는 Tesseract.js로 한국어+영어 텍스트 추출 후 .txt 저장.
4. 온디바이스 NER — 한국어 정밀 보호 모델(약 50MB)을 사이드 패널에서 한 번
   설치하면 인터넷 없이도 동작.

【17개 PII 카테고리】
사람 이름 · 주민등록번호 · 외국인등록번호 · 운전면허번호 · 여권번호 ·
휴대폰 번호 · 유선전화 · 이메일 · 주소 · 카드번호 · 계좌번호 ·
사업자등록번호 · 법인등록번호 · 조직명 · URL · 날짜 · 비밀번호·인증키

각 카테고리별 4가지 마스킹 모드:
■ 형태 보존 (010-XXXX-XXXX)
■ 태그 치환 ([휴대폰])
■ 가짜 데이터 (010-0000-0000)
■ 완전 제거

【권한 사용 목적】
■ storage: 사용자 설정(카테고리 토글, 화이트리스트, 테마) 디바이스 안 저장
■ sidePanel: 파일 업로드·모델 관리 사이드 패널
■ offscreen: AI 모델 추론 (Service Worker 수명 초과 동작)
■ host_permissions: ChatGPT·Claude·Gemini·Perplexity·오렌지임팩트 5개 LLM
  사이트에서만 paste 후킹 (임의 사이트 X)

【보안】
- MV3 strict CSP 호환 (script-src 'self' 'wasm-unsafe-eval')
- ORT WebAssembly + Tesseract OCR worker 모두 self-host
- closed Shadow DOM + isolated world로 호스트 페이지와 격리
- externally_connectable 부재 (외부 확장 메시지 차단)

【다크 모드】
사이드 패널 → 설정 탭에서 라이트/다크 명시 선택 (기본 라이트).

【NPO 직원을 위해】
한국일보 기사가 다룬 결산공시·기부금 양식 누출 사고를 1차 타겟으로 합니다.
정부 표준 양식(.hwp/.hwpx)에서 텍스트를 추출해 RRN·계좌·인명을 마스킹한 후
.txt 또는 동일 양식으로 다운로드합니다.

【오픈소스】
- 코드: https://github.com/myorange-io/orange-filter
- 위협 모델: https://github.com/myorange-io/orange-filter/blob/main/docs/THREAT_MODEL.md
- 개인정보 처리방침: https://github.com/myorange-io/orange-filter/blob/main/docs/PRIVACY_POLICY.md
- 이슈/문의: pengdo@myorange.io

문제가 있다면 GitHub Issues로 알려주세요.
```

## 개인정보 처리방침 URL

```
https://github.com/myorange-io/orange-filter/blob/main/docs/PRIVACY_POLICY.md
```

## 권한 정당성 (CWS Justification 입력)

- **storage**: 사용자가 선택한 카테고리·화이트리스트·테마를 디바이스 안에 저장하기 위해. chrome.storage.local만 사용. 외부 송신 없음.
- **sidePanel**: 파일 업로드 큐와 모델 관리 UI를 보여주는 사이드 패널을 등록하기 위해.
- **offscreen**: ONNX 추론 모델을 메모리에 유지하기 위해. Service Worker는 약 30초 후 evict되어 모델 재로드 비용이 큼. Offscreen Document로 위임.
- **host_permissions** (5개 LLM 도메인): paste 이벤트를 가로채 개인정보를 마스킹한 뒤 입력하기 위해. 외부 임의 사이트는 권한 없음.

## 스크린샷 가이드

CWS는 1280×800 또는 640×400 PNG/JPEG, 최대 5장 권장.

- 01: 사이드 패널 라이트 모드 — 헤더 + 모델 카드 + 파일 드롭존
- 02: 사이드 패널 다크 모드 — 동일 화면 다크
- 03: paste 모달 — 7건 발견 + 카테고리 뱃지 + 미리보기
- 04: 카테고리 17개 + 마스킹 모드 드롭다운(형태 보존/태그 치환/가짜 데이터/완전 제거)
- 05: 파일 업로드 → 다운로드 (HWP/PDF/PPTX 등)

스크린샷 캡처:
1. `chrome://extensions` → 오렌지 필터 사이드 패널 열기
2. 각 화면을 1280×800으로 캡처 (macOS: ⌘⇧4 후 영역 선택, 또는 mcp preview screenshot)
3. `releases/screenshots/`에 저장

## 프로모 이미지 (선택)

CWS 검색 결과 카드 노출용 — 권장 사항이지만 필수 아님:
- Small promo: 440×280 PNG/JPEG
- Marquee (검색 hero): 1400×560

`public/icons/icon.svg`를 베이스로 디자인 가능. v1.1+ 작업.

## 출시 옵션

CWS는 3가지 게시 모드:
- **Public**: 검색·발견 가능. 일반 출시.
- **Unlisted**: 링크 아는 사람만. 베타 테스터 5명 권장.
- **Private**: 우리 도메인 사용자만. 회사 내부.

NPO 5명 베타 → "Unlisted"로 시작 → 피드백 후 "Public"으로 전환 권장.

## 검토 시간

- 첫 제출: 5-7 영업일 (개인 publisher) / 1-2일 (기업 publisher 검증 후)
- 업데이트: 24시간 내 자동 승인 (보통)

## 개발자 비용

- CWS 개발자 등록비: $5 (1회성)
- 기업 publisher 등록: 추가 검증 (도메인 소유 확인 등). 무료.

## 출시 절차 (사용자 작업)

1. https://chrome.google.com/webstore/devconsole 접속 + Google 계정 로그인
2. $5 등록비 결제 (한 번만)
3. 새 항목 추가 → ZIP 업로드 → `releases/orange-filter-v1.0.0.zip`
4. 위 메타데이터 복사·붙여넣기
5. 스크린샷 5장 업로드
6. 게시 모드 선택 (Unlisted 권장 → Public)
7. 검토 제출

## 출시 후 모니터링

- CWS 콘솔 → "Stats" 탭: 설치 수·평점·리뷰
- GitHub Issues: 사용자 버그 리포트
- v1.1 패치: `dist/`만 ZIP으로 업데이트 (메타데이터는 별도 변경 없으면 유지)
