// AEGIS eval 결과(`report.json`)를 읽어 gate 조건 검증.
// CI(workflow eval-aegis.yml)에서 호출 — fail 시 exit 1.
//
// Gate (사용자 정의 A, 보수):
//   - perCategory.person_name.F1 >= 0.93  (baseline 0.966)
//   - fpInNegative.length == 0            (NPO 일반명사 16건 strict 0건)

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPORT_PATH = path.join(__dirname, 'report.json');

const F1_MIN = 0.93;
const NEG_FP_MAX = 0;

const r = JSON.parse(readFileSync(REPORT_PATH, 'utf-8'));
const person = r.perCategory.find((c) => c.category === 'person_name');
const personF1 = person?.F1 ?? 0;
const negFp = r.fpInNegative?.length ?? 0;

console.log('=== Gate evaluation ===');
console.log(`person_name F1: ${personF1.toFixed(4)} (min ${F1_MIN})`);
console.log(`negative FP count: ${negFp} (max ${NEG_FP_MAX})`);
if (negFp > 0) {
  console.log('FP samples:');
  for (const fp of r.fpInNegative.slice(0, 10)) {
    console.log(`  - [${fp.id}] "${fp.text}" -> ${fp.category}`);
  }
}

const failures = [];
if (personF1 < F1_MIN) failures.push(`person_name F1 ${personF1.toFixed(4)} < ${F1_MIN}`);
if (negFp > NEG_FP_MAX) failures.push(`negative FP ${negFp} > ${NEG_FP_MAX}`);

if (failures.length > 0) {
  console.error('\nGATE FAIL:');
  for (const f of failures) console.error(`  - ${f}`);
  process.exit(1);
}
console.log('\nGATE PASS');
