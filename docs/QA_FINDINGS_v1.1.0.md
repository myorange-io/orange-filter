# QA 결과 — Orange Filter v1.1.0 (실 브라우저 / paste 후킹)

**검증 일자**: 2026-04-29
**검증 환경**: macOS / Chrome (Claude in Chrome MCP) / Orange Filter v1.1.0 unpacked extension
**검증 시나리오**: 4개 LLM 화이트리스트 도메인 paste 후킹 + 5개 카테고리 PII 텍스트
**입력 픽스처**: `신청자 김철수 (010-1234-5678), 주민등록번호 900101-1234568, 카드 4242-4242-4242-4242, 계좌 110-234-567890`

---

## 통과 매트릭스

| 도메인 | paste 후킹 | 모달 발화 | 5개 카테고리 발견 | 마스킹 적용 | 비고 |
|--------|:---------:|:---------:|:---------:|:---------:|------|
| chatgpt.com | ✅ | ✅ | ✅ | ✅ | — |
| claude.ai | ✅ | ✅ | ✅ | ✅ | — |
| gemini.google.com | ✅ | ✅ | ✅ | ✅ | 입력창에 🛡️ visual indicator 표시 |
| **www.perplexity.ai** | **❌** | **❌** | **❌** | **❌** | **Finding 2 — 회귀** |

---

## Finding 1 — 자연 문장 안 사람 이름 미탐 (P1)

### 증상

자연 한국어 문장에서 사람 이름이 다른 한글 토큰과 인접하면 누락된다.

```
입력: "안녕하세요, 조성도입니다. 연락처는 010-1234-5678 이고 이메일은 jodo@example.com 입니다."
모달 카운트: 2건 (휴대폰·이메일만)
미리보기: "안녕하세요, 조성도입니다. 연락처는 010-XXXX-XXXX 이고 이메일은 j***@example.com 입니다."
                       ^^^^^^^                              ← 평문 노출
```

### 원인

[src/background/pii/regex.ts](../src/background/pii/regex.ts)의 `NAME_BARE` 정규식이 끝에 `(?![가-힣])` lookahead를 사용한다. "조성도" 다음 글자가 "입"(한글)이라 lookahead가 차단 → 매치 실패.

```ts
const NAME_BARE = new RegExp(
  `(?<![가-힣])(?:(?:${DOUBLE_SURNAME_PATTERN})[가-힣]{2}|${SURNAME_CLASS}[가-힣]{2})(?![가-힣])`,
  'g',
);
```

이 lookahead는 stoplist만으로는 막기 어려운 4자 일반 한자어("한국문화", "주요내용" 등)의 FP를 막기 위해 도입됐지만, 자연 문장에서 이름 + 조사("입니다", "씨", "님", "이/가") 패턴까지 차단하는 부수효과가 있다.

### 영향

- v1.1.0의 sample 회귀 픽스처(NPO 실 데이터 xlsx)는 셀 단위 단일 텍스트라 양쪽 boundary가 셀 경계 → 매치됨. 즉 회귀 테스트가 이 케이스를 가렸다.
- 실 사용자 텍스트(자연 문장 paste)는 이름 뒤에 조사가 붙는 게 일반적 → 빈번히 누락.
- AEGIS PII NER 모델 미설치 사용자에게 직접 노출 (정규식 단독으로는 못 잡음).

### 제안 fix (3가지 옵션)

#### A. 한국어 조사·접미사 화이트리스트로 boundary 완화 (추천)

이름 다음에 등장하는 토큰이 명백한 조사·존칭이면 매치 허용.

```ts
const PARTICLE_AFTER_NAME = '(?:은|는|이|가|을|를|의|에|과|와|도|만|씨|님|입니다|에게|께|보다|처럼|만큼)';

const NAME_BARE = new RegExp(
  `(?<![가-힣])(?:(?:${DOUBLE_SURNAME_PATTERN})[가-힣]{2}|${SURNAME_CLASS}[가-힣]{2})` +
  `(?:(?![가-힣])|(?=${PARTICLE_AFTER_NAME}))`,
  'g',
);
```

**장점**: stoplist 부담 없이 이름 + 조사 케이스 직접 매치.
**단점**: 4자 일반 한자어 중 끝이 "씨"·"님"이면 FP 위험 (예: "회의실님"… 거의 없음). 조사 리스트가 길어질수록 정규식 복잡도 증가.

#### B. 이름 + 조사 별도 detector

`NAME_BARE`는 그대로 두고, 별도 패턴 추가.

```ts
const NAME_WITH_PARTICLE = new RegExp(
  `(?<![가-힣])(?:${SURNAME_CLASS}[가-힣]{2})(?=${PARTICLE_AFTER_NAME}\\b)`,
  'g',
);

// detectKoreanName에 추가 호출
for (const m of text.matchAll(NAME_WITH_PARTICLE)) {
  // 이름 부분만 push (조사 제외)
  out.push({ start: m.index, end: m.index + m[0].length, text: m[0], category: 'person_name', confidence: 0.6 });
}
```

**장점**: 기존 NAME_BARE 동작 영향 최소. confidence 별도 관리.
**단점**: 코드 중복, 정규식 2회 traversal.

#### C. NER 모델 강제 활성화 안내

처음 사이드패널 진입 시 모달로 NER 모델 설치 prompt 강화 (현재는 권장 배너 수준). 사용자가 "건너뛰기" 못 하게 또는 명시적으로 disable 선택해야 진행.

**장점**: 정규식 한계와 무관하게 한국어 NER가 자연 문장 케이스 잡음.
**단점**: 50MB 다운로드 강제 = 사용자 마찰. "당장 한 번만 paste" 사용자에게 과도.

### 추천

A (조사 화이트리스트) + C (NER 모델 안내 강화) 동시 적용. A는 NER 미설치 사용자도 보호, C는 장기 정확도. B는 코드 비용 대비 이점이 적음.

---

## Finding 2 — perplexity.ai에서 paste 후킹 동작 안 함 (P0)

### 증상

```
입력: "신청자 김철수 (010-1234-5678), 주민등록번호 900101-1234568, 카드 4242-4242-4242-4242, 계좌 110-234-567890"
모달: 발화 안 함
입력창 결과: 위 텍스트가 그대로(평문) 입력됨
```

3개의 다른 도메인(chatgpt.com / claude.ai / gemini.google.com)에서는 같은 paste 이벤트가 정상으로 모달을 발화시킴. perplexity만 누락.

### 원인 (가설)

`ClipboardEvent` dispatch 결과 `defaultPrevented: true`는 Perplexity 자체 paste handler가 이벤트를 차단한 흔적으로 보임. Orange Filter content script가 listener를 등록하기 전에 Perplexity가 capture phase에서 이벤트를 가로챘거나, Perplexity의 입력창이 Lexical/ProseMirror 같은 가상 DOM 위에 있어 실제 contenteditable 요소가 paste 이벤트를 다르게 다루는 가능성.

확인이 필요한 사항:

1. **content script 등록 시점** — `manifest.config.ts`의 `run_at: 'document_idle'`이 perplexity의 paste handler 초기화보다 늦을 수 있음.
2. **listener phase** — Orange Filter가 bubble phase에서 listener를 등록하면 capture phase의 site handler에 가려짐. capture phase listener로 등록 필요.
3. **shadow DOM / iframe** — Perplexity 입력창이 iframe 또는 closed shadow DOM에 있는지 확인. content script는 iframe에 별도 inject 필요.

### 영향

- 사용자가 NPO 자료를 perplexity로 보낼 때 마스킹 0건 → 실제 PII 외부 노출.
- 사이드패널·다른 사이트는 정상이라 사용자가 인지 못 할 가능성.

### 제안 fix

#### 즉시 (회귀 차단)

1. **재현 테스트 추가** — 합성 fixture 또는 e2e Playwright로 perplexity 페이지 가짜 DOM에서 paste handler 등록·차단 검증.
2. **paste listener를 capture phase로** — `document.addEventListener('paste', handler, { capture: true })` 시도. 다른 사이트 회귀 없는지 확인.
3. **`run_at: 'document_start'` 변경 시도** — content script가 페이지 스크립트 전 로드되도록. ChatGPT/Claude/Gemini는 그대로 통과해야 함.

#### 진단

- `chrome.scripting.executeScript`로 perplexity 페이지에서 `getEventListeners(document).paste` 출력해 누가 등록했는지 확인.
- Perplexity 입력창의 DOM 구조 (`contenteditable`, `role="textbox"`, framework signature) 확인.
- ChatGPT/Claude/Gemini와 차이점 비교.

#### 단기 (사용자 보호)

- 사이드패널에 "지원 사이트 동작 상태" 표시 — 각 도메인에 가서 paste hook이 활성인지 health-check.
- perplexity.ai 도메인에서 차단 실패가 감지되면 모달 대신 **명시적 경고 toast**: "Orange Filter가 이 페이지에서 동작하지 않습니다. 직접 입력 전 PII를 확인하세요."

---

## 미검증 (시간/접근권한 한계)

- **사이드패널 + 파일 업로드 round-trip** — `chrome.sidePanel.open`은 user gesture 필수라 자동 트리거 어려움. 수동 검증 권장.
- **카테고리별 설정 토글 UI** — 모달 안 "카테고리별 설정" 버튼 클릭 검증 미수행.
- **"꾹 누르면 원본 그대로" 동작** — 마스킹 우회 토글 미검증.
- **AEGIS NER 모델 활성 상태에서 Finding 1 재검증** — 본 검증은 정규식 단독 동작.

---

## 우선순위

| 순위 | Finding | 예상 작업량 | 영향 |
|------|---------|-----------|------|
| **P0** | Finding 2 (perplexity 후킹 부재) | 중 (재현 + capture phase 시도 + e2e) | 사용자 PII 직접 노출 |
| **P1** | Finding 1 (자연 문장 이름 미탐) | 소 (조사 화이트리스트 + 회귀 테스트) | NER 미설치 시 이름 누락 |
| **P3** | NER 모델 설치 안내 강화 | 소 (UI 모달) | 장기 정확도 |

---

작성: 자동 QA (Claude in Chrome MCP)
참고 보고서: `.gstack/qa-reports/` (해당 시) / 본 문서가 1차 결과
