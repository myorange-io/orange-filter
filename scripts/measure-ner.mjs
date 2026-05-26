// AEGIS PII NER 라벨링 측정 — "오렌지" 등 stoplist 후보들이 NER에서 어떻게 분류되는지 확인.
//
// 사용:  node scripts/measure-ner.mjs
// 첫 실행 시 모델 ~182MB 다운로드.

import { pipeline, env } from '@huggingface/transformers';

env.allowLocalModels = false;
env.useBrowserCache = false;

const MODEL_ID = 'YATAV-ENT/aegis-personal-pii-ner';
const MIN_CONFIDENCE = 0.05; // raw 신호를 보기 위해 낮춤

const CASES = [
  // === stoplist 추가 케이스 ===
  ['오렌지', 'v1.5.6 — 외래어/브랜드'],
  ['오렌지 필터', 'v1.5.6 — 컨텍스트'],
  ['오렌지 필터(Orange Filter) - AI 프라이버시 필터', 'v1.5.6 — 사용자 원본'],
  ['오렌지임팩트', 'v1.5.6 — 단체명'],
  ['오렌지는 비타민C가 풍부합니다', 'v1.5.6 — 자연 문장'],

  // === v1.5.5 부서명+직책 ===
  ['전략기획본부장', 'v1.5.5 — 부서명+직책'],
  ['정보보안 팀장', 'v1.5.5'],
  ['고객지원 부장님', 'v1.5.5'],

  // === v1.5 NPO 양식 일반명사 ===
  ['지급처는 한국문화재단입니다', 'v1.5'],
  ['장학금 신청자는 별도 안내', 'v1.5'],
  ['정규직 또는 비정규직', 'v1.5'],
  ['통장사본 첨부 필요', 'v1.5'],

  // === 진짜 인명 — sanity check ===
  ['김민수', '진짜 인명 (3자)'],
  ['김민수 팀장님께 보고드렸습니다', '진짜 인명 + 직책'],
  ['박지영', '진짜 인명 (3자)'],
  ['조성도', '진짜 인명 (3자)'],
  ['홍길동은 어디 있나', '진짜 인명 + 조사'],

  // === 일반 단어 ===
  ['선착순 모집', '일반어'],
  ['노트북 지참', '일반어'],
  ['하반기에 진행', '일반어'],
];

async function main() {
  console.log(`[load] ${MODEL_ID}...`);
  const ner = await pipeline('token-classification', MODEL_ID, { dtype: 'q8' });
  console.log('[load] done\n');

  for (const [text, note] of CASES) {
    const raw = await ner(text);
    const entries = Array.isArray(raw) ? raw : [raw];
    // raw 전체 토큰 출력 — O(non-entity)도 포함해서 NER이 실제 무엇을 보고 있는지 확인.
    console.log(`── "${text}"  [${note}]`);
    if (entries.length === 0) {
      console.log('   (NER returned 0 entities — 정말 침묵)');
    } else {
      // PII 의심 라벨만 (B-/I-/E-/S- SURNAME/GIVENNAME/...)
      const piiOnly = entries.filter((e) => {
        const label = e.entity ?? e.entity_group ?? '';
        return label && label !== 'O' && !label.endsWith('-O');
      });
      if (piiOnly.length === 0) {
        console.log('   (모든 토큰 O 또는 PII 외 라벨)');
      } else {
        for (const e of piiOnly) {
          const label = e.entity_group ?? e.entity ?? '?';
          const w = e.word ?? '?';
          const score = e.score.toFixed(3);
          const span = e.start !== undefined ? ` [${e.start}-${e.end}]` : '';
          console.log(`   ${label.padEnd(20)} score=${score}  word="${w}"${span}`);
        }
      }
    }
    console.log();
  }
}

main().catch((err) => {
  console.error('FAIL:', err);
  process.exit(1);
});
