# QA 검증 — Orange Filter v1.2

**검증 일자**: 2026-04-29
**검증 환경**: macOS / Chrome (Claude in Chrome MCP) / unpacked extension
**검증 대상**: v1.1.0 main + v1.2 NER 통합 변경 (이 PR)

이 문서는 [`docs/QA_FINDINGS_v1.1.0.md`](QA_FINDINGS_v1.1.0.md)에서 보고된 3개 finding의 v1.2 시점 상태를 기록한다.

## Finding 1 — 자연 문장 안 사람 이름 미탐 (P1)

**상태: ✅ 해결 (PR #15 + v1.2 보강)**

PR #15 (commit d3eb4e7)에서 `NAME_BARE`에 `PARTICLE_AFTER_NAME` 화이트리스트를 추가해 정규식 단독으로도 자연 문장 안 이름(예: "조성도입니다", "조성도가") 매치. v1.2에서는 NER 통합으로 이중 안전망 — 정규식이 못 잡는 4자 이상 한자어 인접 케이스도 NER이 보강.

검증:
- vitest 회귀 테스트 67건 (regex.test.ts 'detectKoreanPII') 통과
- AEGIS NER 측정 결과 person_name F1=0.966, FP=0 ([EVAL_AEGIS_v1.2.md](EVAL_AEGIS_v1.2.md))

## Finding 2 — Perplexity paste 후킹 부재 (P0)

**상태: ✅ 해결 (PR #15) + v1.2 강건성 보강**

### PR #15 fix (이미 적용)

commit 1183dc3에서 `perplexity.ts`의 `isInput`에 `[contenteditable="true"]` + `[role="textbox"]` 매처 추가. 2026 Q2 기준 perplexity 메인 입력란이 ProseMirror contenteditable로 변경된 케이스 매치.

### v1.2 실 브라우저 검증 (2026-04-29)

Claude in Chrome MCP로 `https://www.perplexity.ai/`에서 실 paste 시뮬레이션:

```
[npo-privacy] adapter installed: perplexity   ← content script install OK
ClipboardEvent dispatch 결과:
  defaultPrevented: true                       ← listener 동작 + preventDefault
  hostExists: true                             ← shadow host mount
  targetText: ""                               ← 입력창에 평문 안 들어감
```

신버전 perplexity 입력창 DOM 구조:
- `<div contenteditable="true" role="textbox" placeholder="...">` — `closest('form')` false
- `[role="textbox"]` 매처가 첫 번째 분기에서 매치 → install OK

### v1.2 강건성 보강 (이 PR)

`createPasteAdapter`의 paste listener를 `window`와 `document` 양쪽 capture phase에 등록 + `defaultPrevented` 가드로 중복 처리 방지. window가 더 외부라 SPA의 capture handler에 가려지지 않으며, document fallback이 legacy WebView 환경 대비.

`manifest.config.ts`의 host_permissions에 `https://perplexity.ai/*` (root) 추가 — www 없이 직접 접근 시 redirect 전 content script가 inject되도록.

영향 받는 파일:
- [src/content/site-adapters/factory.ts](../src/content/site-adapters/factory.ts)
- [manifest.config.ts](../manifest.config.ts)

## Finding 3 — NER 통합 부재 (v1.1.0 README 광고 ↔ 실 동작 불일치)

**상태: ✅ 해결 (이 PR — v1.2 NER 통합)**

v1.1.0의 README와 사이드패널은 "온디바이스 NER (AEGIS PII, ~50MB)"를 광고하지만 paste 후킹과 사이드패널 파일 마스킹이 background `detect()`로 라우팅되지 않아 50MB 다운로드 효과가 0이었다. v1.2에서 호출자를 background DETECT_REQUEST로 라우팅한다.

변경 내역:
- `src/offscreen/model-runtime.ts` — SURNAME+GIVENNAME 머지 + 조사 trim 후처리 (MIN_CONFIDENCE 0.5→0.3)
- `src/shared/lib/detect-client.ts` — background DETECT_REQUEST helper, 정규식 폴백
- `src/content/show-paste-modal.tsx` — 비동기로 변경, `requestDetect()` 호출
- `src/sidepanel/mask-segments.ts` — 비동기 + segment-level onProgress

측정 결과 (자세한 사항은 [EVAL_AEGIS_v1.2.md](EVAL_AEGIS_v1.2.md)):

| | F1 | 비고 |
|---|---|---|
| person_name | 0.966 | 후처리 적용 후 P=1.0, R=0.933 |
| 부정 케이스 FP | 0 / 8 | 정규식 stoplist 부담 경감 |
| 평균 추론 | 5ms / case | INT8 ONNX, paste UX 무감 |

번호류(mobile/email/rrn/card/account 등)는 모델이 OOD라 거의 못 잡으므로 정규식 단독이 우월. NER + 정규식 합쳐서 한국어 자연 문장의 사람 이름 보강이 v1.2의 핵심 가치.

## 자동 회귀 테스트

| Suite | Count | 결과 |
|---|---|---|
| vitest (전체) | 267 | ✅ 모두 통과 |
| Playwright e2e | 9 | ✅ 모두 통과 |

신규 테스트:
- `src/offscreen/model-runtime.test.ts` — `mergeAdjacentNames`, `trimTrailingParticles` 12건 (Finding 3)
- `src/shared/lib/detect-client.test.ts` — chrome.runtime 폴백 경로 6건 (Finding 3)
- `src/sidepanel/mask-segments.test.ts` — 비동기 + onProgress + isHeader/forcedCategory 7건 (Finding 3)

수정된 e2e:
- `playwright/paste-modal.spec.ts` — closed shadow DOM은 의도된 보안 격리이므로 host element 존재 + closed mode lock으로 검증
- 사이드패널 사람 이름 selector를 `switch` role로 좁힘 (combobox 중복 매치 회피)

## 미검증 (수동 QA 권장)

- ChatGPT/Claude/Gemini 실 사이트 paste 후킹 — 인증 필요해서 자동화 미수행. 어댑터 구조가 perplexity와 동일하므로 동일하게 동작 예상. 수동 검증 시 주의 점:
  - 첫 paste는 모델 워밍업으로 ~3-5s 대기 (background detect await + Transformers.js model load)
  - 두 번째 paste부터는 즉시 응답 (offscreen이 모델을 메모리에 유지)
- 사이드패널 파일 마스킹 round-trip 실 사용자 동작 — Playwright 파일 업로드 시뮬레이션은 별개 작업.

## 우선순위 잔여 작업

| Finding | v1.2 상태 | 후속 |
|---|---|---|
| F1 — 자연 문장 이름 | 해결 | — |
| F2 — perplexity 후킹 | 해결 + 보강 | 실 사용자 회귀 모니터링 |
| F3 — NER 통합 | 해결 | 첫 paste UX 개선 (모델 warm-up 사전 트리거) — v1.3 |
