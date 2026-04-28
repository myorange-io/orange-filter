# Paste 동작 가이드 — 어떤 입력을 어떻게 처리하나요

**버전**: 0.0.1
**대상**: 오렌지 필터 사용자, NPO 직원, 개발자
**관련**: [개인정보 처리방침](./PRIVACY_POLICY.md), [위협 모델](./THREAT_MODEL.md)

이 문서는 LLM 사이트(ChatGPT, Claude, Gemini, Perplexity, Orange-Impact)에 paste할 때
**오렌지 필터가 어떤 입력을 가로채고 어떤 입력은 그대로 통과시키는지**를 명세합니다.

> 핵심 원칙: 우리는 **텍스트 paste만 가로챕니다**. 그 외(파일 첨부, 이미지, ZIP)는
> 사이드 패널 파일 업로드 영역에서만 PII 처리합니다. paste 가로채기는 사용자의
> 키보드 흐름을 끊지 않는 텍스트에 한정.

---

## 1. 가로채는 입력 (Tier 0 — paste 모달 발동)

| 입력 형태 | 가로챔? | 비고 |
|-----------|--------:|------|
| Plain text (`text/plain`) | ✅ | 기본 동작 |
| Rich text / HTML (`text/html`) | ✅ | HTML 태그 제거 후 텍스트만 detect/마스킹 |
| 다중 줄 / 들여쓰기 | ✅ | 원본 개행·공백 보존 |
| 한국어 / 한자 / 이모지 혼합 | ✅ | UTF-8 처리 |

`paste` 이벤트의 `clipboardData.types`에 `text/plain` 또는 `text/html`이 포함되면
모달이 뜹니다. 모달에서 사용자가 "가리고 붙여넣기" 또는 "취소" 또는 "꾹 누르면
원본 그대로(1.5초 hold)" 중 결정.

---

## 2. 가로채지 않는 입력 (그대로 통과)

| 입력 형태 | 가로챔? | 이유 |
|-----------|--------:|------|
| 이미지 (`image/png`, `image/jpeg` 등) | ❌ | OCR 미지원. 이미지 안 PII는 사이드 패널에서 별도 OCR 슬라이스 (v1.1+) |
| 파일 첨부 (`Files` 항목) | ❌ | 파일 paste는 일반적이지 않음. 사이드 패널 파일 업로드 영역 사용 권장 |
| ZIP (`application/zip`) | ❌ | 텍스트 추출 비결정적 + 압축 해제 시점 보안 부담 |
| 바이너리 (`application/octet-stream`) | ❌ | 텍스트 아님 |
| 빈 클립보드 | ❌ | 모달 띄울 컨텐츠 없음 |
| PII 0건 텍스트 | ✅(passthrough) | 모달은 뜨지 않고 원본 그대로 즉시 paste |

---

## 3. 화이트리스트 도메인

사이드 패널 → 설정 → 화이트리스트에 등록된 도메인에서는 **paste 모달을 띄우지
않습니다**. 사용자가 명시적으로 "이 사이트는 신뢰" 등록한 경우를 위해.

화이트리스트 매칭 규칙:
- 정확 매치: `chatgpt.com`은 `chatgpt.com` 도메인에만 적용
- 서브도메인 포함: `example.com` 등록 시 `app.example.com`, `www.example.com`도 적용
- 프로토콜·경로 무시: 입력값에서 `https://`, 경로(`/path`)는 자동 제거

---

## 4. 파일이 PII를 담고 있는데 paste만 가능할 때

권장 워크플로우:

1. **사이드 패널 → 파일 업로드 영역**으로 파일 끌어다 놓기 (PDF/DOCX/XLSX/HWP 등)
2. 큐에 추가됨 → 자동 추출·마스킹·다운로드
3. 다운로드된 마스킹 파일을 LLM 사이트에 첨부

⚠️ **이미지 파일을 LLM에 paste**하는 경우, 현재 버전은 OCR을 지원하지 않아
이미지 안 텍스트의 PII를 탐지하지 못합니다. 직접 검토 후 paste 또는 v1.1+에서
온디바이스 OCR(Tesseract WASM 등) 슬라이스가 추가되면 자동 처리됩니다.

---

## 5. 사이트별 한계

| 사이트 | 가로챔 표면 | 알려진 한계 |
|--------|-------------|-------------|
| ChatGPT | `[contenteditable]` (ProseMirror) | iframe 내 채팅창은 미지원 |
| Claude | `[contenteditable=true]` (fieldset/form 안) | 무관 |
| Gemini | `.ql-editor` (Quill) | 음성 입력 paste는 별도 — 미지원 |
| Perplexity | `textarea` (placeholder 매처) | 무관 |
| Orange-Impact | `textarea[placeholder="답변을 입력하세요."]` | 폴백 셀렉터로 일반 textarea도 처리 |

paste 모달이 뜨지 않는다면 다음 중 하나:
1. 사이트가 위 5개 도메인이 아님 (확장이 install 안 됨)
2. 도메인이 화이트리스트에 등록됨 (사이드 패널 → 설정에서 확인)
3. paste 컨텐츠가 텍스트가 아님 (이미지 등)
4. paste한 텍스트에 PII 0건 (모달 생략, 자동 통과)

---

## 6. 디버깅

브라우저 DevTools 콘솔에서 다음 로그 확인:

```
[npo-privacy] adapter installed: chatgpt   // 또는 claude/gemini/perplexity/orange-impact
[npo-privacy] router → tier1-default       // paste 시점
```

확장이 활성이지만 모달이 뜨지 않으면:
1. 콘솔에 `[npo-privacy] adapter installed:` 로그가 있는지 확인
2. 없으면 manifest의 host_permissions 미허가 — `chrome://extensions`에서 권한 확인
3. paste 컨텐츠를 일반 텍스트로 다시 복사 후 재시도

---

## 7. 변경 이력

| 일자 | 버전 | 변경 |
|------|------|------|
| 2026-04-28 | 0.0.1 | 최초 작성 (S19) — paste 가로채기 표면 + 화이트리스트 + 사이트별 한계 명세 |
