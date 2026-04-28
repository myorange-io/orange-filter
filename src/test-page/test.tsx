// 테스트 호스트 페이지. 두 가지 동작을 검증:
//   ① 직접 모달 트리거 (Shadow DOM 격리)
//   ② ChatGPT 어댑터의 paste 후킹 + execCommand 값 주입
//
// chatgpt.ts adapter는 hostname을 chat.openai.com / chatgpt.com으로 검사하지만,
// 여기서는 어댑터를 직접 install하여 hostname 매처를 우회한다 (테스트는 매처 로직이 아닌
// paste 후킹 + 값 주입 로직을 검증).

import { showPasteModal } from '@/content/show-paste-modal';
import { chatgptAdapter } from '@/content/site-adapters';

// 데모 RRN은 valid checksum이어야 모달이 RRN을 마스킹하는 모습을 보여줄 수 있음
// (validateRRNChecksum이 invalid면 detectRRN이 emit 안 함 — 데모 일관성 위해 valid 번호 사용).
const SAMPLE_TEXT = `안녕하세요. 김민수 부장입니다.
연락처는 010-1234-5678이고 사무실은 02-555-1234 입니다.
주민등록번호 901011-1234563 / 이메일 minsu.kim@example.org / API 토큰 sk-live-abcdefghijklmnopqrstuv`;

const sampleEl = document.getElementById('sample');
if (sampleEl) sampleEl.textContent = SAMPLE_TEXT;

// ① 직접 트리거
document.getElementById('trigger-direct')?.addEventListener('click', () => {
  showPasteModal({
    text: SAMPLE_TEXT,
    onConfirm: (masked) => {
      // eslint-disable-next-line no-console
      console.log('[oi-filter test] direct confirm:', masked);
    },
    onCancel: () => {
      // eslint-disable-next-line no-console
      console.log('[oi-filter test] direct cancel');
    },
  });
});

// ② 모델 추론 1회 실행
document.getElementById('run-model')?.addEventListener('click', async () => {
  const resultEl = document.getElementById('model-result');
  if (!resultEl) return;
  resultEl.textContent = '모델 로드 중… (첫 실행은 ~30MB 다운로드)';
  try {
    const { detectWithModel, loadModel } = await import('@/offscreen/model-runtime');
    await loadModel({
      onProgress: (p) => {
        resultEl.textContent = `다운로드 ${p.pct.toFixed(1)}% (${p.bytesLoaded}/${p.bytesTotal})`;
      },
    });
    const sample = 'Hello, my name is John Smith from Acme Corporation in New York.';
    const t0 = performance.now();
    const spans = await detectWithModel(sample);
    const t1 = performance.now();
    resultEl.textContent =
      `입력: ${sample}\n` +
      `추론 시간: ${(t1 - t0).toFixed(0)}ms\n` +
      `발견 스팬 ${spans.length}개:\n` +
      spans
        .map(
          (s) =>
            `  • ${s.text} [${s.category}] confidence=${s.confidence.toFixed(2)} (${s.start}-${s.end})`,
        )
        .join('\n');
  } catch (err) {
    resultEl.textContent = `❌ 모델 실행 실패: ${err instanceof Error ? err.message : String(err)}`;
    // eslint-disable-next-line no-console
    console.error('[oi-filter test] model error:', err);
  }
});

// ③ 클립보드에 샘플 텍스트 복사 (브라우저 권한 필요)
document.getElementById('copy-sample')?.addEventListener('click', async () => {
  try {
    await navigator.clipboard.writeText(SAMPLE_TEXT);
    // eslint-disable-next-line no-console
    console.log('[oi-filter test] sample copied to clipboard');
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn('[oi-filter test] clipboard.writeText failed (사용자 동작 필요할 수 있음):', err);
  }
});

// ③ ChatGPT 어댑터를 hostname 매처 우회로 직접 설치
chatgptAdapter.install((ctx) => {
  showPasteModal({
    text: ctx.text,
    onConfirm: (masked) => ctx.replaceWith(masked),
    onCancel: () => ctx.cancel(),
  });
});

// eslint-disable-next-line no-console
console.log('[oi-filter test] ChatGPT 어댑터 설치 완료 — contenteditable에 paste 가능');
