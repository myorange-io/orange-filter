# 오렌지 필터 — Status Log

진행 중인 슬라이스의 결정 사항과 후속 작업을 누적 기록한다.
파일/모듈 단위 변경은 git log로 충분 — 여기는 *왜*와 *다음*만.

---

## S15 — HWP 5.x round-trip via @rhwp/core (2026-04-28)

### 배경
v1.0 직전 13개 형식 중 HWP 5.x만 read-only였다. parse → mask → `.txt` fallback
다운로드 흐름. NPO 결산공시 양식이 1차 use case라 양방향 round-trip 가치가 큼.

### 결정
**`@rhwp/core@0.7.7` (Rust+WASM) 통합** — MIT, deps 0, 4.4MB unpacked
(WASM raw 3.9MB). HWP 5.0 parse + `exportHwp(): Uint8Array` serializer.
`HwpDocument`에 `getSectionCount`/`getParagraphCount`/`getControlTextPositions`/
`getTableDimensions`/`insertText`/`deleteText`/`insertTextInCell`/`deleteTextInCell`
등 traversal + mutation API가 충분.

대안 검토 결과:
- `hwp-rs` (hahnlee): parser only, wasm-bindgen 준비 중 → 부적합.
- `hwpers`: parse + SVG render, write 없음 → 부적합.
- `hwp.js` fork: OLE2 binary writer 직접 구현은 v1.0 일정에 비현실적.

위험:
- pre-1.0 (0.7.x) — version 정확히 pinning (`"@rhwp/core": "0.7.7"`), 메이저 변경
  시 재검증.
- dist에 +4MB. Chrome Web Store zip 100MB 한도 내 안전.
- WASM init 환경 분기: 확장은 `chrome.runtime.getURL` + fetch, vitest는 fs로
  `initSync`. 두 경로 모두 spike에서 동작 확인.

### 적용 범위 (v1.0)
- 본문 단락: 텍스트 마스킹 가능. 단 inline control(표/그림)이 같은 단락에
  있으면 export 시 보수적으로 skip — `deleteText` 의 control 좌표 영향이
  미검증이라 안전 우선.
- 표 셀 단락: 모두 마스킹 적용. NPO 양식의 PII는 거의 100% 표 셀에 있음.
- 단일 섹션 + 1단 표만 검증. 중첩 표는 path 기반 API가 있지만 v1.0 범위 외.

### 회귀
- `src/sidepanel/parsers/parsers.test.ts`에 round-trip 케이스 추가 — 표 셀
  segment 1개를 sentinel로 마스킹 → export → 재파싱 후 같은 segment id에서
  sentinel 확인 + 전체 segment 수 보존.
- 테스트는 `NPO_SAMPLE_DIR` 환경변수 또는 worktree 상위 `sample/` 자동 탐지.
  fixture 부재 시 skip.

### 후속 (v1.1+)
- 본문 단락 + inline control 동시 존재 시 안전한 mutation: control char_offset
  보존 검증 후 활성화. `findNearestControlForward` + `deleteText` 영향 측정 spike
  필요.
- 머리말/꼬리말 마스킹: `insertTextInHeaderFooter`/`deleteTextInHeaderFooter`
  활용.
- 각주/미주: `insertTextInFootnote`/`deleteTextInFootnote`.
- 텍스트박스 (Shape control 안의 paragraph): `getTextBoxControlIndex`로 분기.
- 중첩 표: `*ByPath` 변종 사용.
- HWPX는 현재 JSZip 기반 `hwpx.ts`로 충분. rhwp의 HWPX serializer는 0.7.x
  beta(disabled)라 도입 가치 없음.
- 사용자 측 manual 검증 — sample/ NPO 양식 2개를 한컴오피스에서 열어 레이아웃
  비교. round-trip 후 양식 깨짐이 발견되면 control 인접 단락 정책 재검토.
