// orange-impact AI 임팩트 빌더 어댑터 — *.orangeimpact.kr.
// plan 결정: prod 도메인 orangeimpact.kr. 라우트 `/builder`, `/builder/chat/[roomId]`.
// 입력 요소: 순수 `<textarea>` — 안정 셀렉터 `form textarea[placeholder="답변을 입력하세요."]`.
// 추가 트리거: textarea에 `/종료` 입력 시 즉시 결과 생성 → submit 후킹은 S14에서 (per plan).
import { createPasteAdapter } from './factory';

const PRIMARY_PLACEHOLDER = '답변을 입력하세요.';

export const orangeImpactAdapter = createPasteAdapter({
  id: 'orange-impact',
  hosts: ['orangeimpact.kr'],
  isInput(target) {
    if (!(target instanceof HTMLTextAreaElement)) return false;
    if (target.placeholder === PRIMARY_PLACEHOLDER) return true;
    // 폴백: form 내부의 단일 textarea (placeholder 변경 대비)
    const form = target.closest('form');
    if (form && form.querySelectorAll('textarea').length === 1) return true;
    return false;
  },
});
