# AEGIS PII NER — 한국어 자연 문장 정확도 측정 (v1.2 사전 평가)

**측정일**: 2026-04-29
**모델**: `YATAV-ENT/aegis-personal-pii-ner` (mBERT-base 178M, ONNX INT8 ~50MB)
**런타임**: Transformers.js 4.2.0 / Node 20 / onnxruntime-node
**케이스셋**: `scripts/eval-aegis/cases.json` (36 cases — 28 positive, 8 negative)

## 측정 동기

v1.1.0 main의 README/사이드패널 UI는 "온디바이스 NER (AEGIS PII, ~50MB)"를 강조하지만, paste 후킹·사이드패널 파일 마스킹 모두 정규식만 호출하고 background `detect()`로 라우팅되지 않음 (Finding 3). 사용자가 50MB를 다운받아도 효과가 0이다.

v1.2에서 통합을 결정하기 전, AEGIS의 모델 카드 자체 보고치(한국어 F1 **0.9632**)가 우리 도메인 — 한국어 자연 문장 paste — 에서도 그대로 유효한지 확인할 필요가 있다. 모델 카드 매트릭스는 학습 분포 내 측정값이므로, OOD(out-of-distribution) 자연 문장에서는 다른 결과가 나올 수 있다.

## 평가 셋

- **Positive (28건)**: Finding 1 회귀 케이스(자연 문장 안 사람 이름 + 조사) + 다중 PII 케이스 + 호칭/소속 컨텍스트.
- **Negative (8건)**: PII가 없는 일반 한국어 문장. FPR 측정용.

매칭 정책:
- **Lenient**: 카테고리 무관, span IOU ≥ 0.5 → TP. (마스킹 관점: 어떤 카테고리로든 가려지면 보호 OK)
- **Strict**: 카테고리까지 일치 → TP.
- 하나의 expected 당 최대 한 개의 predicted와만 매칭.

## v1: 후처리 없음, MIN_CONFIDENCE=0.5 (transformers.js의 simple aggregation 그대로)

| Metric | Lenient | Strict |
|---|---|---|
| Precision | 0.4828 | 0.4828 |
| Recall | 0.5833 | 0.5833 |
| F1 | **0.5283** | **0.5283** |

| Category | TP | FP | FN | F1 |
|---|---|---|---|---|
| person_name | 28 | 28 | 2 | 0.651 |
| email/mobile/rrn/card/account/landline | 0 | 0 | each | 0 |
| organization/driver_license/business_number | 0 | 0 | each | 0 |
| credential/foreign_registration | 0 | 0 | each | 0 |

**FP in negative cases: 0**

### 진단

- **AEGIS는 한국어 이름을 SURNAME과 GIVENNAME으로 분리 라벨링한다**.
  예: "조성도" → `B-SURNAME(조)`, `B-GIVENNAME(성도)` → `aggregation_strategy: 'simple'`이 두 entity_group으로 분리해 출력. 결과적으로 IOU < 0.5로 매칭 실패하고, person_name FP가 폭증.
- **mobile/email/rrn/card/account 등 번호류 PII를 모델이 거의 못 잡는다** (TP=0). 모델 카드의 EMAIL F1=0.9978, IDCARD F1=0.9222는 학습 분포 내 측정일 가능성이 매우 높다. 우리 자연 문장에서는 학습 분포 외(OOD)로, 모델 신뢰도가 0.5 임계치에 미치지 못한다.

## v2: SURNAME+GIVENNAME 인접 머지 후처리 + MIN_CONFIDENCE=0.3

| Metric | Lenient | Strict |
|---|---|---|
| Precision | **0.9333** | **0.9333** |
| Recall | **0.5833** | **0.5833** |
| F1 | **0.7179** | **0.7179** |

| Category | TP | FP | FN | F1 |
|---|---|---|---|---|
| **person_name** | **28** | **0** | **2** | **0.966** |
| address | 0 | 2* | 0 | — |
| email/mobile/rrn/card/account/landline | 0 | 0 | each | 0 |

\* address FP 2건은 모델이 정확히 잡은 "서울시 강남구 테헤란로 123" + "06234"(우편번호). 우리 케이스셋이 address를 expected에 넣지 않은 라벨링 누락 — **모델 진짜 FP가 아니라 측정 셋 결함.**

**FP in negative cases: 0** (8개 부정 케이스에서 잘못 잡은 PII 0건)

**평균 추론 latency: 5ms / case** (INT8 + ONNX, M-series CPU)

### v1 대비 개선

| | v1 | v2 |
|---|---|---|
| person_name F1 | 0.651 | **0.966** |
| Overall F1 (lenient) | 0.5283 | **0.7179** |
| FP in person_name | 28 | **0** |

후처리 두 줄 추가 — 인접 person_name 스팬을 IOU 무관히 머지 — 만으로 F1 0.31 상승.

### 누락된 2개 케이스 분석

- **P12** "조성도가 작성한 보고서입니다." — NER이 "조성도가"를 잡지 못함. 정규식이 PARTICLE_AFTER_NAME에 "가"를 포함시켜 잡으므로 (v1.1.0 fix 후), **정규식 + NER 합치면 커버**.
- **P24** "제갈공명 선생의 가르침을 따릅니다." — NER이 복성(2자 성씨) 학습 부족. 정규식의 DOUBLE_SURNAME_PATTERN이 잡으므로, 역시 합치면 커버.

## v1.2 통합 결정

### 결정

**AEGIS NER을 통합한다. 단 사람 이름 보강 용도로 한정.**

근거:
1. **person_name F1=0.966, FP=0**: 정규식이 못 잡는 자연 문장 안 이름(조사 인접)을 보완.
2. **부정 케이스 FP 0건**: 정규식의 stoplist 부담 경감.
3. **추론 5ms/case**: paste UX에 무감.
4. **번호류는 모델이 못 잡음**: 정규식 단독이 우월. NER 통합이 추가 이득 없음.

### 구현 정책

1. `model-runtime.ts`의 `detectWithModel`에 후처리 두 단계 추가:
   - **SURNAME + GIVENNAME 인접 머지** (gap ≤ 1자) → 단일 person_name 스팬.
   - **인접 조사 trim**: 매치 끝이 한국어 조사("의", "가", "은", "는", "이", "을", "를", "께", "씨", "님" 등)면 한 글자 제거. 마스킹 결과 텍스트 무결성 보장.

2. `merge.ts`의 합치기 정책:
   - 카테고리 일치 시: 정규식 confidence 우선, 단 모델이 더 긴 스팬을 잡으면 NER 사용 (이름 boundary 더 정확).
   - 카테고리 불일치 시: 우선순위(rrn > credential > card > … > person_name > address > organization)를 따름. NER의 person_name이 정규식의 organization을 덮지 않도록 주의.

3. **호출자 라우팅 변경**: 
   - `show-paste-modal.tsx` (paste 후킹) → background `detect()` 사용.
   - `mask-segments.ts` (사이드패널 파일) → background `detect()` 사용.
   - 둘 다 `chrome.runtime.sendMessage('DETECT_REQUEST', ...)`로 비동기 호출.

4. **모델 미설치 사용자 보호**: background `detect()`가 model 실패 시 정규식만 반환하도록 이미 try/catch 설계됨. 추가 작업 없음.

5. **카테고리별 신뢰도**:
   - NER 결과 중 person_name, address는 채택.
   - email/mobile/rrn/card/account/landline/business_number/credential/foreign_registration/driver_license는 NER이 학습 분포 외라 신뢰도 낮음 — 정규식이 잡은 것이 있으면 NER 결과 폐기. 정규식이 못 잡은 것만 NER 결과 채택 (단 confidence ≥ 0.7).

### 광고와 실 동작 정합성

README/사이드패널은 "한국어 정밀 보호 모델"로 표기 중. 측정 결과 사람 이름 정확도(F1=0.966)에 부합하므로 표기는 유지하되, **"50MB 다운로드 후 동작" 표현이 실제 동작과 일치하도록** 호출자 라우팅 통합이 v1.2 핵심 작업이다.

## 후속 작업

- 우리 케이스셋에 address ground truth 추가 후 재측정.
- 라벨이 mismatch한 카테고리(예: 모델이 ZIPCODE인데 우리 PIICategory는 address 통합)에 대한 표준화.
- v1.2 통합 후 실 브라우저 e2e 회귀 테스트.

## 참조

- 측정 스크립트: [scripts/eval-aegis/run.mjs](../scripts/eval-aegis/run.mjs)
- 케이스셋: [scripts/eval-aegis/cases.json](../scripts/eval-aegis/cases.json)
- Raw report: [scripts/eval-aegis/report.json](../scripts/eval-aegis/report.json) (gitignore 권장)
- 모델 카드: https://huggingface.co/YATAV-ENT/aegis-personal-pii-ner
