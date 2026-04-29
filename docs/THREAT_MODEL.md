# Orange Filter 위협 모델 (Threat Model)

**버전**: 0.0.1 (M1 ship-ready)
**최종 갱신**: 2026-04-28
**프레임워크**: STRIDE (Spoofing / Tampering / Repudiation / Information Disclosure / Denial of Service / Elevation of Privilege)

이 문서는 Orange Filter Chrome 확장 (MV3)의 4개 핵심 표면 — **paste hook**, **file upload**, **model fetch**, **telemetry** — 에 대한 위협 분석이다. 1.0 출시 전 자체 검토 산출물이며, 미해결 위협은 [§5 Open Items](#5-open-items)에 정리한다.

---

## 1. 시스템 개요

### 1.1 자산 (Assets)

| 자산 | 설명 | 민감도 |
|------|------|--------|
| **사용자 paste 텍스트** | LLM 입력창에 붙여넣을 원본 (이메일, 문서, RRN/연락처 등 포함 가능) | 매우 높음 |
| **업로드 파일 컨텐츠** | PDF/DOCX/XLSX/HWP 등 사이드패널 큐에 추가된 파일 | 매우 높음 |
| **사용자 설정** | `chrome.storage.local` 저장 — 카테고리 토글, 화이트리스트 도메인 | 낮음 |
| **모델 가중치** | IndexedDB 캐시 (`huggingface/transformers/...`) | 낮음 (공개 자산) |
| **Service Worker 메모리** | 정규식 매처, 라우터 결정 | 낮음 (휘발성) |

### 1.2 신뢰 경계 (Trust Boundaries)

```
┌────────────────────── 호스트 페이지 (untrusted) ──────────────────────┐
│  chatgpt.com / claude.ai / gemini.google.com / perplexity.ai /       │
│  *.orangeimpact.kr — JavaScript는 호스트 페이지 권한                  │
└─────────────┬─────────────────────────────────────────────┬──────────┘
              │ paste event (capture)                       │
              ▼                                             │
┌──── content script (Orange Filter) ───┐    ┌─── Shadow DOM (closed) ───┐
│  isolated world, 호스트 JS 격리    │ ──→│  Radix Dialog + 마스킹     │
│  shadow root mount                  │    │  미리보기 — 호스트 격리   │
└─────────────┬───────────────────────┘    └────────────────────────────┘
              │ chrome.runtime.sendMessage
              ▼
┌─── Service Worker ───────────────┐    ┌─── Offscreen Document ────────┐
│  정규식 detect, 라우터, mask     │ ──→│  Transformers.js 모델 추론    │
│  storage I/O                     │    │  IndexedDB 모델 캐시           │
└──────────────────────────────────┘    └────────────────────────────────┘
                  │
                  ▼
       chrome.storage.local (설정), IndexedDB (모델 weights)
```

**핵심 원칙**: 모든 PII 데이터는 디바이스 밖으로 나가지 않는다. 외부 네트워크 호출은 (1) 모델 가중치 다운로드 (HuggingFace CDN) 1회, (2) 폰트 로드 (확장 패키지 내부) 0회 — 그 외 0건.

---

## 2. 표면별 STRIDE

### 2.1 Paste Hook (content script)

**컴포넌트**: `src/content/index.ts`, `src/content/site-adapters/*.ts`, `src/content/PasteModal.tsx`

| STRIDE | 위협 | 영향 | 대응 (현재) | 잔존 위험 |
|--------|------|------|-------------|-----------|
| **S** | 호스트 페이지가 가짜 paste 이벤트 발사 → 사용자 모르게 마스킹 우회 | 중 | 모달은 사용자 입력(`pointerdown` 1.5s hold) 없이 confirm 안 됨. `dispatchEvent`로 모달 닫기 불가 (Radix focus trap) | 낮음 |
| **T** | 호스트 페이지가 Shadow DOM 내부 React state 조작 시도 | 중 | `attachShadow({ mode: 'closed' })` — host.shadowRoot 접근 불가. CSS는 별도 스타일시트, host 페이지 스타일 새지 않음 | 낮음 (closed mode 충분) |
| **R** | 사용자가 마스킹 결정을 했다는 증거 부재 | 낮음 | v1: 디바이스 안 토스트 카운터(S16). v1.1+: 로컬 audit log 검토 | 낮음 (분쟁 가능성 적음) |
| **I** | **paste 텍스트가 호스트 페이지로 누출** | **매우 높음** | content script는 isolated world에서 동작. paste 이벤트는 `capture: true` + `preventDefault()`로 가로채 호스트 핸들러보다 먼저 처리. 마스킹 후 `execCommand('insertText')` 또는 textarea native setter로 주입 | **중** — 호스트 페이지가 input event listener에서 raw 값 읽을 가능성 있으나 우리 입력은 이미 마스킹됨 |
| **I** | Shadow DOM 모달 내용을 host 페이지 JS가 읽기 시도 | 높음 | closed shadow root — 외부 JS는 `host.shadowRoot === null`. 단, **host 페이지 확장이 `chrome.scripting.executeScript`로 동일 isolated world 진입 시 노출 가능** (cross-extension) | 낮음 (대부분 호스트 페이지에 그런 권한 없음) |
| **D** | 호스트 페이지가 paste event spam → CPU 소모 | 낮음 | 정규식 + 모델은 모달 표시 trigger에만 동작. paste 1회당 1 detect | 낮음 |
| **E** | content script → Service Worker 권한 우회 | 낮음 | 메시지는 `chrome.runtime.sendMessage`로 정의된 `Message` 유니온만 처리. 모르는 kind는 무시 | 낮음 |

**결정 근거**:
- **closed shadow root**: open mode는 `host.shadowRoot`로 호스트 페이지가 모달 DOM에 접근 가능 → PII 미리보기 텍스트 읽힐 위험. closed mode는 Radix가 graceful 처리하여 (DialogTitle/Description 명시 시점) dev console 경고도 발생 안 함 — S6 status log의 알려진 한계는 v1 출시 시점에 해소됨 (2026-04-28 검증).
- **execCommand('insertText')**: textarea native setter / `dispatchEvent('input')` 대비 React-controlled component / ProseMirror에서 안정적이며, host 페이지 onPaste handler를 우회하지 않음 (정상 paste 경로 시뮬레이션).

### 2.2 File Upload (sidepanel)

**컴포넌트**: `src/sidepanel/FileDropZone.tsx`, `src/sidepanel/use-file-queue.ts`, `src/sidepanel/parsers/*.ts`

| STRIDE | 위협 | 영향 | 대응 | 잔존 위험 |
|--------|------|------|------|-----------|
| **S** | 사용자 모르게 외부 origin이 파일 업로드 트리거 | 낮음 | sidepanel은 `chrome-extension://` origin만, 외부에서 `<input type=file>` click 불가 | 낮음 |
| **T** | 파일 파서가 악성 컨텐츠로 메모리 변조 | 중 | 파서는 모두 NPM 패키지 (`xlsx`, `pdfjs-dist`, `mammoth`, `hwp.js`, `papaparse`). NPM audit 정기 점검 필요 | **중** — `xlsx` 등에 과거 prototype pollution CVE 이력. v1.0 전 dependency-check 자동화 필수 |
| **R** | 어떤 파일을 마스킹했는지 기록 부재 | 낮음 | v1: 큐 UI에 파일명+상태만. 다운로드된 마스킹 결과물은 사용자가 검토 | 낮음 |
| **I** | **파서가 외부 네트워크에 컨텐츠 송신** | **매우 높음** | `xlsx`, `pdfjs-dist`, `hwp.js`는 네트워크 호출 없음 (오프라인 동작 확인 — `vitest run` 환경에서 검증). MV3 host_permissions에는 LLM 도메인만, 외부 fetch는 CSP 차단 | **낮음** — supply chain 공격 시 의존성 자체가 변조 가능 (§5 참조) |
| **I** | PDF에 외부 리소스 로드 (예: external image / JS in PDF) | 중 | `pdfjs-dist`는 default로 외부 리소스 차단. PDF JavaScript 비활성 (`disableWorker: false, isEvalSupported: false`) | 낮음 |
| **D** | 거대 파일 (수 GB)로 메모리 OOM | 중 | v1: 클라이언트 리미트 없음. **v1.0 전 100MB 상한 필요** | **높음** (M1 미해결) |
| **E** | 파일 시스템 접근 → confined directory 밖 읽기 | 낮음 | `<input type=file>` + Drag&Drop만 사용 — 사용자가 명시적으로 선택한 파일만 접근 | 낮음 |

**결정 근거**:
- **HWP 파서 라이선스**: `hwp.js`는 Apache-2.0. `LICENSES/` 폴더에 명시. v2의 `rhwp` WASM (round-trip write 지원)은 별도 검토 필요.
- **마스킹 다운로드**: 결과 파일은 `URL.createObjectURL` + `<a download>`으로 사용자 디스크에만 저장. 외부 송신 없음.

### 2.3 Model Fetch (offscreen + transformers.js)

**컴포넌트**: `src/offscreen/model-runtime.ts`, `public/ort/*` (self-hosted ORT WASM)

| STRIDE | 위협 | 영향 | 대응 | 잔존 위험 |
|--------|------|------|------|-----------|
| **S** | HuggingFace를 사칭하는 가짜 CDN | 높음 | `@huggingface/transformers` 기본 endpoint (`https://huggingface.co`)는 라이브러리에 하드코딩. 직접 URL을 우리가 검증하지 않음 | **중** — DNS hijack / TLS 신뢰 체인 의존 |
| **T** | 다운로드된 모델 weights가 변조 → 마스킹 회피 (예: PER 라벨이 영원히 0) | 높음 | **v1: 모델 hash 검증 없음**. Transformers.js는 IndexedDB 캐시만, weights 파일 무결성 미검증 | **높음** (M1 미해결, §5 #1) |
| **R** | 어떤 모델 버전이 활성인지 audit | 낮음 | `getActiveModelId()` 노출. 사이드패널 ModelManager (S15)에서 사용자 가시화 | 낮음 |
| **I** | 모델 추론 중 텍스트가 외부로 leak | **매우 높음** | Transformers.js는 ONNX Runtime Web 위에서 동작 — 추론은 100% 클라이언트. ORT WASM은 self-host (`public/ort/*`, manifest의 `web_accessible_resources`). MV3 CSP는 `script-src 'self'` — 외부 스크립트 로드 차단 | **낮음** |
| **I** | Service Worker / offscreen 메시지 가로채기 | 중 | `chrome.runtime` 메시지는 동일 확장 내부 origin만. cross-extension은 `externally_connectable` 없는 한 차단 (현재 manifest에 없음) | 낮음 |
| **D** | 거대 모델 (~수 GB) 다운로드 강제 → 디바이스 행 | 중 | int8 quantized 모델 (~30MB) 사용. S15에서 사용자에게 다운로드 동의 + 진행률 + cancel 제공 | 낮음 |
| **E** | offscreen 페이지가 SW 권한 escalation | 낮음 | offscreen은 별도 context, `chrome.offscreen.createDocument`로 한정된 reasons (`WORKERS`)만 명시 | 낮음 |

**결정 근거**:
- **Self-hosted ORT WASM**: `public/ort/`에 패키징하여 MV3 CSP `script-src 'self'` 호환. 외부 CDN 의존 제거.
- **IndexedDB 캐시**: 첫 다운로드 후 오프라인 동작. 캐시 키는 `huggingface/transformers/{model_id}/...`.

### 2.4 Telemetry

**컴포넌트**: 없음 (의도적)

| STRIDE | 위협 | 영향 | 대응 | 잔존 위험 |
|--------|------|------|------|-----------|
| **I** | 사용 통계가 외부 분석 서비스에 송신 | 매우 높음 | **v1: 텔레메트리 0건**. 외부 fetch 호출 일체 없음 (모델 다운로드 외). [Privacy Policy](./PRIVACY_POLICY.md) §3 명시 | 낮음 |
| **R** | 사용자 행동 로그 부재 → 디버깅 불가 | 낮음 | 콘솔 로그(`console.debug`)만, 디바이스 안 | 낮음 |

**결정 근거**:
- v1.0은 텔레메트리 없이 출시. v2에서 도입 검토 시 (1) 옵트인 default OFF, (2) PII 차분 제거된 카운터만, (3) end-to-end 암호화 — 세 조건을 모두 충족할 때만.

---

## 3. 공격자 모델

| 공격자 | 동기 | 능력 | 대응 우선순위 |
|--------|------|------|---------------|
| **악성 호스트 페이지** (chatgpt.com 사칭, 광고 inject 등) | paste 텍스트 탈취 | DOM 조작, paste event spoofing | 높음 — 1차 표면 |
| **공격적 LLM 사이트** (legit한 chatgpt.com이지만 paste handler가 raw 값 분석) | LLM training data 수집 | DOM API | 중 — 마스킹 후 주입으로 충분 |
| **Supply chain 공격자** (npm 패키지 변조, HuggingFace 모델 변조) | PII 우회 / 백도어 | 의존성 PR / CDN | 높음 — §5 #1 #2 |
| **Cross-extension 공격자** | paste 텍스트 탈취 | 동일 host 페이지에 다른 확장 inject | 중 — closed shadow root + isolated world로 차단 |
| **로컬 멀웨어** | 설정 / 모델 캐시 변조 | 디스크 R/W | 낮음 (out of scope — OS 보안 책임) |
| **물리적 접근자** (잠금 해제된 PC) | chrome.storage 로컬 데이터 조회 | full filesystem | 낮음 (out of scope) |

---

## 4. 보안 결정 요약 (Security Decisions)

1. **Closed Shadow DOM**: 호스트 페이지 격리 ↔ Radix a11y 경고. 보안 우선.
2. **Self-hosted ORT WASM**: 외부 CDN 의존 제거. CSP 호환.
3. **No telemetry**: 디바이스 밖 송신 0건. v1.0 핵심 약속.
4. **MV3 strict CSP**: `script-src 'self' 'wasm-unsafe-eval'; object-src 'self'`. 일반 `eval`/외부 스크립트는 차단, WASM 컴파일만 허용 (ORT + Tesseract 필요). manifest 보안 회귀 테스트로 lock.
5. **Optional host_permissions** (TODO v1.1): 사용자가 사이트별로 명시 허가하도록 변경 검토 (현재는 manifest에 5개 LLM 도메인 고정).
6. **Minimum permissions**: `storage`, `sidePanel`, `offscreen`만. `tabs`, `webRequest`, `cookies` 등 high-risk 권한 미요구.

---

## 5. Open Items (1.0 ship-blocker)

1. **모델 무결성 검증** [높음] — 다운로드된 모델 weights의 SHA-256를 known-good hash와 비교. Transformers.js에 hook이 없으므로 wrapper 구현 필요. [Issue: TBD]
2. **NPM dependency 자동 점검** [중] — 2026-04-28 기준 `npm audit` 결과 8건 (5 moderate, 3 high), 모두 자동 fix 미가능. 분석:
   - **dev-only** (esbuild/vite/vitest/rollup): dev 서버 + 빌드 타임 한정. 사용자 영향 X. 무시 가능.
   - **xlsx** (prototype pollution + ReDoS): no fix available. Mitigation: (1) 파일 크기 상한 (100MB/파일 + 500MB 큐) → ReDoS 입력 제한. (2) 사용자 신뢰 파일만 처리(NPO 직원 본인 양식). attacker-controlled XLSX paste는 일반 시나리오 아님. v1.1+에서 SheetJS commercial 또는 exceljs로 교체 검토.
   - 자동화: GitHub Dependabot 활성화 권장. CI에 `npm audit --audit-level=high` 추가.
3. **파일 크기 상한** [높음] — 100MB / 파일 + 큐 총합 500MB. 초과 시 reject + 사용자 안내. [Issue: TBD]
4. **Cross-extension 노출 검토** [중] — 동일 isolated world에 진입할 수 있는 확장 시나리오 재검토. closed shadow root만으로 충분한지 외부 보안 검토 (S20 직전).
5. **Subresource Integrity for HF CDN** [낮음] — Transformers.js가 SRI를 지원하지 않음. v2에서 wrapper로 추가.

---

## 6. 변경 이력

| 일자 | 버전 | 변경 |
|------|------|------|
| 2026-04-28 | 0.0.1 | 최초 작성 (S17). 4개 표면 × STRIDE × 5 Open Items |
