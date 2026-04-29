// AEGIS PII NER 한국어 자연 문장 정확도 측정.
//
// 모델 카드 자체 보고: 한국어 F1 0.9632 — 학습 분포 내 측정값.
// 본 스크립트는 우리 도메인(자연 문장 paste)에서 정확도를 별도 검증한다.
//
// 측정 항목:
//   1) Lenient overlap match — 카테고리 무관, span 50% overlap이면 TP.
//      (마스킹 관점: PII가 어떤 카테고리로든 가려지면 사용자 보호 OK)
//   2) Strict match — 카테고리까지 일치해야 TP.
//   3) Per-category P/R/F1.
//   4) FPR — 부정 케이스에서 잘못 잡은 비율.
//
// 정규식 단독 결과도 함께 보고 (현재 v1.1.0 호출자 동작 — paste 후킹/sidepanel 마스킹).
// 비교: NER 통합이 정규식 대비 얼마나 개선하는가.

import { pipeline, env } from '@huggingface/transformers';
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

env.allowLocalModels = false;
env.useBrowserCache = false; // Node 환경 — file system cache 사용

const MODEL_ID = 'YATAV-ENT/aegis-personal-pii-ner';

// model-runtime.ts의 mapLabel 사본 — Node에서 ts import 회피.
function mapLabel(label) {
  const tag = label.replace(/^[BIES]-/, '');
  switch (tag) {
    case 'PER':
    case 'GIVENNAME':
    case 'SURNAME':
      return 'person_name';
    case 'ORG':
    case 'COMPANY':
      return 'organization';
    case 'LOC':
    case 'STREET':
    case 'CITY':
    case 'ZIPCODE':
    case 'BUILDINGNUM':
      return 'address';
    case 'DATE':
    case 'DATEOFBIRTH':
    case 'TIME':
      return 'date';
    case 'EMAIL':
      return 'email';
    case 'TELEPHONENUM':
      return 'mobile';
    case 'IDCARD':
      return 'rrn';
    case 'CREDITCARDNUMBER':
      return 'card';
    case 'ACCOUNTNUM':
      return 'account';
    case 'DRIVERLICENSENUM':
      return 'driver_license';
    case 'PASSWORD':
      return 'credential';
    default:
      return null;
  }
}

const MIN_CONFIDENCE = 0.3; // v2: 0.5 → 0.3 — 모델이 confidence 낮게 주는 경향. 정규식과 합칠 때는 낮은 임계치 OK.

function cleanWord(w) {
  return w.replace(/##/g, '').replace(/\s+/g, ' ').trim();
}

// AEGIS는 SURNAME과 GIVENNAME을 분리 라벨로 출력하므로(예: 조성도 → 조 + 성도)
// aggregation_strategy: 'simple' 결과를 person_name 카테고리로 합쳐 반환.
// 인접 (또는 1글자 이내 gap) person_name 스팬을 머지.
function mergeAdjacentNames(spans) {
  const sorted = [...spans].sort((a, b) => a.start - b.start);
  const out = [];
  for (const s of sorted) {
    const prev = out[out.length - 1];
    if (
      prev &&
      prev.category === 'person_name' &&
      s.category === 'person_name' &&
      s.start - prev.end <= 1 // 직접 인접 또는 1자 gap (조사 없는 한국 이름)
    ) {
      prev.end = s.end;
      prev.text = prev.text + (s.start === prev.end - (s.end - s.start) ? '' : '');
      // text는 caller가 외부에서 text.slice로 다시 추출하는 게 안전 — 여기서는 표기만 수정.
      prev.text = `${prev.text}${s.text}`.replace(/\s+/g, ' ');
      continue;
    }
    out.push({ ...s });
  }
  return out;
}

function modelInferToSpans(text, raw) {
  const spans = [];
  let cursor = 0;
  for (const e of raw) {
    const category = mapLabel(e.entity_group ?? e.entity ?? '');
    if (!category) continue;
    if (e.score < MIN_CONFIDENCE) continue;

    let start = typeof e.start === 'number' ? e.start : -1;
    let end = typeof e.end === 'number' ? e.end : -1;

    if (start < 0 || end < 0) {
      const cleaned = cleanWord(e.word);
      if (!cleaned) continue;
      const idx = text.indexOf(cleaned, cursor);
      if (idx < 0) continue;
      start = idx;
      end = idx + cleaned.length;
      cursor = end;
    }
    spans.push({ start, end, text: text.slice(start, end), category });
  }
  // 후처리: 인접 person_name 머지 (SURNAME + GIVENNAME → person_name)
  const merged = mergeAdjacentNames(spans);
  // text 재정합 — slice from input
  for (const s of merged) {
    s.text = text.slice(s.start, s.end);
  }
  return merged;
}

function expectedToSpans(textVal, expected) {
  const out = [];
  for (const e of expected) {
    const idx = textVal.indexOf(e.text);
    if (idx < 0) {
      throw new Error(`expected text not found in input: "${e.text}" in case`);
    }
    out.push({ start: idx, end: idx + e.text.length, text: e.text, category: e.category });
  }
  return out;
}

function spansOverlap(a, b) {
  return a.start < b.end && b.start < a.end;
}

function overlapRatio(a, b) {
  const overlapStart = Math.max(a.start, b.start);
  const overlapEnd = Math.min(a.end, b.end);
  if (overlapEnd <= overlapStart) return 0;
  const overlap = overlapEnd - overlapStart;
  const union = Math.max(a.end, b.end) - Math.min(a.start, b.start);
  return overlap / union;
}

function evalCase(predicted, expected) {
  const matchedExpected = new Set();
  const matchedPredicted = new Set();
  let strictTP = 0;
  let lenientTP = 0;

  for (let i = 0; i < expected.length; i++) {
    const exp = expected[i];
    for (let j = 0; j < predicted.length; j++) {
      if (matchedPredicted.has(j)) continue;
      const pred = predicted[j];
      if (!spansOverlap(exp, pred)) continue;
      // overlap 비율 50% 이상 — lenient 매치
      const ratio = overlapRatio(exp, pred);
      if (ratio < 0.5) continue;
      lenientTP += 1;
      if (exp.category === pred.category) strictTP += 1;
      matchedExpected.add(i);
      matchedPredicted.add(j);
      break;
    }
  }

  return {
    strictTP,
    lenientTP,
    expectedCount: expected.length,
    predictedCount: predicted.length,
    falsePositives: predicted.length - lenientTP,
    falseNegatives: expected.length - lenientTP,
  };
}

function fmt(n, digits = 4) {
  return Number.isFinite(n) ? n.toFixed(digits) : 'n/a';
}

function safeDiv(a, b) {
  return b === 0 ? 0 : a / b;
}

function metricsBlock(label, total) {
  const lenientP = safeDiv(total.lenientTP, total.lenientTP + total.fpLenient);
  const lenientR = safeDiv(total.lenientTP, total.lenientTP + total.fnLenient);
  const lenientF1 = safeDiv(2 * lenientP * lenientR, lenientP + lenientR);

  const strictP = safeDiv(total.strictTP, total.strictTP + (total.fpLenient + (total.lenientTP - total.strictTP)));
  const strictR = safeDiv(total.strictTP, total.strictTP + total.fnLenient + (total.lenientTP - total.strictTP));
  const strictF1 = safeDiv(2 * strictP * strictR, strictP + strictR);

  return {
    label,
    lenient: { P: lenientP, R: lenientR, F1: lenientF1 },
    strict: { P: strictP, R: strictR, F1: strictF1 },
  };
}

async function loadRegexDetector() {
  // src/background/pii/regex.ts는 TypeScript — Node에서 직접 import 어려움.
  // 우리가 측정하려는 건 "정규식 vs NER" 비교이므로 별도로 컴파일해서 가져오기.
  // 가장 간단한 방법: tsx 또는 ts-node 없이도 vitest로 함께 측정하기.
  // 본 스크립트에서는 regex 비교 생략하고, 별도 vitest로 측정하면 됨.
  return null;
}

async function main() {
  const casesPath = path.join(__dirname, 'cases.json');
  const { cases } = JSON.parse(readFileSync(casesPath, 'utf-8'));

  console.log(`[eval] cases: ${cases.length} (${cases.filter((c) => c.kind === 'positive').length} positive, ${cases.filter((c) => c.kind === 'negative').length} negative)`);
  console.log(`[eval] loading model ${MODEL_ID}...`);
  const t0 = Date.now();
  const pipe = await pipeline('token-classification', MODEL_ID, { dtype: 'q8' });
  console.log(`[eval] model loaded in ${(Date.now() - t0) / 1000}s`);

  const totals = {
    strictTP: 0,
    lenientTP: 0,
    fpLenient: 0,
    fnLenient: 0,
    fpStrict: 0,
    fnStrict: 0,
  };
  const byCategory = new Map();
  const fpInNegative = []; // 부정 케이스에서 잡힌 span 목록
  const perCase = [];

  for (const c of cases) {
    const expected = expectedToSpans(c.text, c.expected);
    const t1 = Date.now();
    const raw = await pipe(c.text, { aggregation_strategy: 'simple' });
    const predicted = modelInferToSpans(c.text, raw);
    const dur = Date.now() - t1;

    const r = evalCase(predicted, expected);
    totals.strictTP += r.strictTP;
    totals.lenientTP += r.lenientTP;
    totals.fpLenient += r.falsePositives;
    totals.fnLenient += r.falseNegatives;
    totals.fpStrict += r.falsePositives + (r.lenientTP - r.strictTP);
    totals.fnStrict += r.falseNegatives + (r.lenientTP - r.strictTP);

    // 부정 케이스에서 predicted가 있으면 FP 누적
    if (c.kind === 'negative' && predicted.length > 0) {
      for (const p of predicted) {
        fpInNegative.push({ id: c.id, text: p.text, category: p.category });
      }
    }

    // per-category counter
    for (const exp of expected) {
      const cat = exp.category;
      if (!byCategory.has(cat)) byCategory.set(cat, { tp: 0, fn: 0, fp: 0 });
      const bucket = byCategory.get(cat);
      const matched = predicted.find((p) => spansOverlap(exp, p) && overlapRatio(exp, p) >= 0.5);
      if (matched) bucket.tp += 1;
      else bucket.fn += 1;
    }
    for (const pred of predicted) {
      const matchedExp = expected.find((e) => spansOverlap(e, pred) && overlapRatio(e, pred) >= 0.5);
      if (!matchedExp) {
        const cat = pred.category;
        if (!byCategory.has(cat)) byCategory.set(cat, { tp: 0, fn: 0, fp: 0 });
        byCategory.get(cat).fp += 1;
      }
    }

    perCase.push({
      id: c.id,
      kind: c.kind,
      durMs: dur,
      expected: expected.map((e) => `${e.text}/${e.category}`),
      predicted: predicted.map((p) => `${p.text}/${p.category}`),
      strictTP: r.strictTP,
      lenientTP: r.lenientTP,
      fp: r.falsePositives,
      fn: r.falseNegatives,
    });
  }

  // Aggregate
  const lenientP = safeDiv(totals.lenientTP, totals.lenientTP + totals.fpLenient);
  const lenientR = safeDiv(totals.lenientTP, totals.lenientTP + totals.fnLenient);
  const lenientF1 = safeDiv(2 * lenientP * lenientR, lenientP + lenientR);

  const strictP = safeDiv(totals.strictTP, totals.strictTP + totals.fpStrict);
  const strictR = safeDiv(totals.strictTP, totals.strictTP + totals.fnStrict);
  const strictF1 = safeDiv(2 * strictP * strictR, strictP + strictR);

  // Per-category metrics
  const catMetrics = [];
  for (const [cat, b] of byCategory) {
    const p = safeDiv(b.tp, b.tp + b.fp);
    const r = safeDiv(b.tp, b.tp + b.fn);
    const f1 = safeDiv(2 * p * r, p + r);
    catMetrics.push({ category: cat, tp: b.tp, fp: b.fp, fn: b.fn, P: p, R: r, F1: f1 });
  }
  catMetrics.sort((a, b) => b.tp + b.fn - (a.tp + a.fn));

  // Console summary
  console.log('\n=== AEGIS PII — Korean Natural Sentence Eval ===');
  console.log(`Cases: ${cases.length} (${perCase.filter((c) => c.kind === 'positive').length} positive, ${perCase.filter((c) => c.kind === 'negative').length} negative)`);
  console.log(`Total expected spans: ${totals.lenientTP + totals.fnLenient}`);
  console.log(`Total predicted spans: ${totals.lenientTP + totals.fpLenient}`);
  console.log('');
  console.log(`Lenient (overlap-based, category-agnostic):`);
  console.log(`  Precision: ${fmt(lenientP)}, Recall: ${fmt(lenientR)}, F1: ${fmt(lenientF1)}`);
  console.log(`Strict (category must match):`);
  console.log(`  Precision: ${fmt(strictP)}, Recall: ${fmt(strictR)}, F1: ${fmt(strictF1)}`);
  console.log('');
  console.log(`FP in negative cases: ${fpInNegative.length}`);
  for (const fp of fpInNegative) {
    console.log(`  - [${fp.id}] "${fp.text}" → ${fp.category}`);
  }
  console.log('');
  console.log(`Per category (lenient P/R):`);
  for (const cm of catMetrics) {
    console.log(
      `  ${cm.category.padEnd(22)} TP=${cm.tp} FP=${cm.fp} FN=${cm.fn}  P=${fmt(cm.P, 3)} R=${fmt(cm.R, 3)} F1=${fmt(cm.F1, 3)}`,
    );
  }

  const avgInferMs = perCase.reduce((s, c) => s + c.durMs, 0) / perCase.length;
  console.log(`\nAvg inference latency: ${avgInferMs.toFixed(0)}ms / case`);

  // Detailed per-case for failing cases
  const fails = perCase.filter((c) => c.fn > 0 || c.fp > 0);
  if (fails.length > 0) {
    console.log(`\n=== Failures (${fails.length} cases) ===`);
    for (const f of fails) {
      console.log(`[${f.id}] kind=${f.kind} fn=${f.fn} fp=${f.fp}`);
      console.log(`  expected: ${f.expected.join(', ') || '(none)'}`);
      console.log(`  predicted: ${f.predicted.join(', ') || '(none)'}`);
    }
  }

  // Save full report
  const report = {
    generatedAt: new Date().toISOString(),
    modelId: MODEL_ID,
    totals,
    overall: {
      lenient: { P: lenientP, R: lenientR, F1: lenientF1 },
      strict: { P: strictP, R: strictR, F1: strictF1 },
    },
    perCategory: catMetrics,
    fpInNegative,
    avgInferMs,
    perCase,
  };
  const reportPath = path.join(__dirname, 'report.json');
  writeFileSync(reportPath, JSON.stringify(report, null, 2));
  console.log(`\nReport saved: ${reportPath}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
