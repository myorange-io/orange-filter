// 통합 테스트 — sample/ 폴더의 실 NPO 양식 파일로 round-trip 검증.
// node 20+ File API 사용. 사용자가 sample/을 옮기면 이 테스트는 skip 처리됨.

import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, test } from 'vitest';
import { parseTxt, exportTxt } from './txt';
import { parseCsv, exportCsv } from './csv';
import { parseXlsx, exportXlsx } from './xlsx';
import { parseDocx, exportDocx } from './docx';
import { parsePptx, exportPptx } from './pptx';
import { exportHwp, parseHwp } from './hwp';

/**
 * sample/ 디렉터리 위치 결정. 워크트리(`.claude/worktrees/<id>`)에서 실행 시 cwd가
 * 워크트리 루트라 메인 repo의 sample/을 못 본다. cwd부터 상위로 4단계까지 탐색.
 * 환경변수 `NPO_SAMPLE_DIR`로 명시 override 가능.
 */
function resolveSampleDir(): string | null {
  const env = process.env.NPO_SAMPLE_DIR;
  if (env && existsSync(env)) return env;
  const candidates = [
    join(process.cwd(), 'sample'),
    join(process.cwd(), '..', 'sample'),
    join(process.cwd(), '..', '..', 'sample'),
    join(process.cwd(), '..', '..', '..', 'sample'),
    join(process.cwd(), '..', '..', '..', '..', 'sample'),
  ];
  for (const c of candidates) if (existsSync(c)) return c;
  return null;
}

const SAMPLE_DIR = resolveSampleDir();

function fileFromDisk(path: string): File {
  const buf = readFileSync(path);
  const name = path.split('/').pop() ?? 'file';
  return new File([buf], name);
}

function findSample(pattern: RegExp): string | null {
  if (!SAMPLE_DIR || !existsSync(SAMPLE_DIR)) return null;
  for (const name of readdirSync(SAMPLE_DIR)) {
    if (pattern.test(name)) return join(SAMPLE_DIR, name);
  }
  return null;
}

describe('TXT parser', () => {
  test('round trip preserves content', async () => {
    const file = new File(['홍길동 010-1234-5678'], 'test.txt');
    const parsed = await parseTxt(file);
    expect(parsed.segments).toHaveLength(1);
    expect(parsed.segments[0]!.text).toBe('홍길동 010-1234-5678');

    const masked = new Map([['doc', '[NAME] 010-1234-XXXX']]);
    const blob = await exportTxt(file, masked);
    const out = await blob.text();
    expect(out).toBe('[NAME] 010-1234-XXXX');
  });
});

describe('CSV parser', () => {
  test('parse + mask + export → 셀 단위 round trip', async () => {
    const csv = '이름,전화,이메일\n홍길동,010-1234-5678,test@a.com';
    const file = new File([csv], 'test.csv');
    const parsed = await parseCsv(file);
    expect(parsed.segments.length).toBeGreaterThanOrEqual(6);

    // 첫 데이터 행을 마스킹
    const masked = new Map<string, string>();
    for (const seg of parsed.segments) {
      if (seg.id === 'r1c0') masked.set(seg.id, '[NAME]');
      else if (seg.id === 'r1c1') masked.set(seg.id, '010-1234-XXXX');
    }
    const blob = await exportCsv(file, masked);
    const out = await blob.text();
    expect(out).toContain('[NAME]');
    expect(out).toContain('010-1234-XXXX');
    expect(out).toContain('이름,전화,이메일'); // 헤더 보존
  });
});

describe('XLSX parser (sample 픽스처)', () => {
  const samplePath = findSample(/\.xls$/);

  test.skipIf(!samplePath)('실 NPO 명세서 .xls 추출', async () => {
    const file = fileFromDisk(samplePath!);
    const parsed = await parseXlsx(file);
    // 양식이라 비어있을 수 있지만 헤더 텍스트는 있어야 함
    expect(parsed.segments.length).toBeGreaterThan(0);
    expect(parsed.combinedText.length).toBeGreaterThan(0);
  });

  test('합성 xlsx round trip — 셀 마스킹 후 재파싱 일치', async () => {
    // 작은 합성 xlsx 생성 (XLSX.write 사용)
    const XLSX = await import('xlsx');
    const ws = XLSX.utils.aoa_to_sheet([
      ['이름', '전화'],
      ['홍길동', '010-1234-5678'],
    ]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Sheet1');
    const buf = XLSX.write(wb, { type: 'array', bookType: 'xlsx' }) as Uint8Array;
    const file = new File([buf], 'test.xlsx');

    const parsed = await parseXlsx(file);
    const phoneSeg = parsed.segments.find((s) => s.text === '010-1234-5678');
    const nameSeg = parsed.segments.find((s) => s.text === '홍길동');
    expect(phoneSeg).toBeDefined();
    expect(nameSeg).toBeDefined();

    const masked = new Map<string, string>();
    masked.set(nameSeg!.id, '[NAME]');
    masked.set(phoneSeg!.id, '010-1234-XXXX');

    const outBlob = await exportXlsx(file, masked);
    const outBuf = await outBlob.arrayBuffer();
    const reFile = new File([outBuf], 'test.xlsx');
    const reParsed = await parseXlsx(reFile);
    const texts = reParsed.segments.map((s) => s.text);
    expect(texts).toContain('[NAME]');
    expect(texts).toContain('010-1234-XXXX');
    expect(texts).not.toContain('홍길동');
    expect(texts).not.toContain('010-1234-5678');
  });
});

describe('HWP 5.x parser (sample 픽스처)', () => {
  const samplePath = findSample(/\.hwp$/);

  test.skipIf(!samplePath)('실 NPO 결산공시 양식에서 한국어 텍스트 추출', async () => {
    const file = fileFromDisk(samplePath!);
    const parsed = await parseHwp(file);
    expect(parsed.segments.length).toBeGreaterThan(0);
    const combined = parsed.combinedText;
    expect(combined.length).toBeGreaterThan(0);
    const hasKoreanForm =
      combined.includes('공익법인') ||
      combined.includes('결산') ||
      combined.includes('서식') ||
      combined.includes('명세');
    expect(hasKoreanForm).toBe(true);
  });

  test.skipIf(!samplePath)(
    'round-trip: 표 셀 텍스트를 마스킹 후 재파싱하면 마스킹된 값이 보임',
    async () => {
      const file = fileFromDisk(samplePath!);
      const parsed = await parseHwp(file);
      // 표 셀 segment id = `s${sec}p${para}c${ctrl}cell${cell}q${cellPara}`
      const cellSeg = parsed.segments.find(
        (s) => /cell\d/.test(s.id) && s.text.trim().length > 1,
      );
      expect(cellSeg).toBeDefined();

      const sentinel = '__MASKED_SENTINEL_42__';
      const masked = new Map<string, string>();
      masked.set(cellSeg!.id, sentinel);

      const blob = await exportHwp(file, masked);
      const buf = await blob.arrayBuffer();
      const reFile = new File([buf], 'reparse.hwp');
      const reParsed = await parseHwp(reFile);
      const reSeg = reParsed.segments.find((s) => s.id === cellSeg!.id);
      expect(reSeg?.text).toBe(sentinel);
      expect(reParsed.segments.length).toBe(parsed.segments.length);
    },
    30_000,
  );

  test.skipIf(!samplePath)('빈 양식엔 PII 0건이어야 함 (FP 없음)', async () => {
    // NPO 표준 양식의 빈 hwp는 안내 텍스트만 있고 실 PII는 없어야 한다.
    // detectKoreanPII가 양식 라벨/주석을 PII로 잘못 잡으면 회귀.
    const { detectKoreanPII } = await import('@/background/pii/regex');
    const file = fileFromDisk(samplePath!);
    const parsed = await parseHwp(file);
    const spans = detectKoreanPII(parsed.combinedText);
    const sensitive = spans.filter((s) =>
      [
        'rrn',
        'foreign_registration',
        'card',
        'account',
        'credential',
        'driver_license',
        'corporate_registration',
        'business_number',
      ].includes(s.category),
    );
    expect(sensitive).toHaveLength(0);
  });
});

describe('DOCX parser', () => {
  test('합성 docx round trip — w:t 노드 마스킹 후 재파싱 일치', async () => {
    // jszip로 최소 docx 만들기
    const JSZip = (await import('jszip')).default;
    const zip = new JSZip();
    zip.file(
      '[Content_Types].xml',
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="xml" ContentType="application/xml"/><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>',
    );
    zip.folder('_rels')!.file(
      '.rels',
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>',
    );
    zip.folder('word')!.file(
      'document.xml',
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:t>홍길동 부장</w:t></w:r></w:p><w:p><w:r><w:t>010-1234-5678</w:t></w:r></w:p></w:body></w:document>',
    );
    const buf = (await zip.generateAsync({ type: 'arraybuffer' })) as ArrayBuffer;
    const file = new File([buf], 'test.docx');

    const parsed = await parseDocx(file);
    expect(parsed.segments.map((s) => s.text)).toEqual(['홍길동 부장', '010-1234-5678']);

    const masked = new Map([
      ['t0', '[NAME] 부장'],
      ['t1', '010-1234-XXXX'],
    ]);
    const outBlob = await exportDocx(file, masked);
    const outBuf = await outBlob.arrayBuffer();
    const reFile = new File([outBuf], 'test.docx');
    const reParsed = await parseDocx(reFile);
    expect(reParsed.segments.map((s) => s.text)).toEqual(['[NAME] 부장', '010-1234-XXXX']);
  });
});

describe('PPTX parser', () => {
  test('합성 pptx round trip — a:t 노드 마스킹 후 재파싱 일치 (다중 슬라이드)', async () => {
    const JSZip = (await import('jszip')).default;
    const zip = new JSZip();
    zip.file(
      '[Content_Types].xml',
      '<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="xml" ContentType="application/xml"/></Types>',
    );
    // 두 슬라이드 — 각각 인명·전화 텍스트 노드
    const slide1 =
      '<?xml version="1.0"?><p:sld xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"><p:cSld><p:spTree><p:sp><p:txBody><a:p><a:r><a:t>대표 김민수</a:t></a:r></a:p></p:txBody></p:sp></p:spTree></p:cSld></p:sld>';
    const slide2 =
      '<?xml version="1.0"?><p:sld xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"><p:cSld><p:spTree><p:sp><p:txBody><a:p><a:r><a:t>연락 010-1234-5678</a:t></a:r></a:p><a:p><a:r><a:t>이메일 lead@example.org</a:t></a:r></a:p></p:txBody></p:sp></p:spTree></p:cSld></p:sld>';
    zip.folder('ppt')!.folder('slides')!.file('slide1.xml', slide1);
    zip.folder('ppt')!.folder('slides')!.file('slide2.xml', slide2);

    const buf = (await zip.generateAsync({ type: 'arraybuffer' })) as ArrayBuffer;
    const file = new File([buf], 'test.pptx');

    const parsed = await parsePptx(file);
    const texts = parsed.segments.map((s) => s.text);
    expect(texts).toContain('대표 김민수');
    expect(texts).toContain('연락 010-1234-5678');
    expect(texts).toContain('이메일 lead@example.org');

    // 모든 텍스트 노드 마스킹
    const masked = new Map<string, string>();
    for (const seg of parsed.segments) {
      if (seg.text.includes('김민수')) masked.set(seg.id, '대표 [NAME]');
      else if (seg.text.includes('010-')) masked.set(seg.id, '연락 010-XXXX-XXXX');
      else if (seg.text.includes('@')) masked.set(seg.id, '이메일 [EMAIL]');
    }

    const outBlob = await exportPptx(file, masked);
    const reFile = new File([await outBlob.arrayBuffer()], 'test.pptx');
    const reParsed = await parsePptx(reFile);
    const reTexts = reParsed.segments.map((s) => s.text);
    expect(reTexts).toContain('대표 [NAME]');
    expect(reTexts).toContain('연락 010-XXXX-XXXX');
    expect(reTexts).toContain('이메일 [EMAIL]');
    expect(reTexts).not.toContain('대표 김민수');
    expect(reTexts).not.toContain('연락 010-1234-5678');
  });

  test('XML 특수문자(<, &) 보존 + 발표자 노트 포함', async () => {
    const JSZip = (await import('jszip')).default;
    const zip = new JSZip();
    const slide =
      '<?xml version="1.0"?><p:sld xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"><a:t>Lee &amp; Co.</a:t><a:t>&lt;신청서&gt;</a:t></p:sld>';
    const notes =
      '<?xml version="1.0"?><p:notes xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"><a:t>발표자 메모: 010-1234-5678</a:t></p:notes>';
    zip.folder('ppt')!.folder('slides')!.file('slide1.xml', slide);
    zip.folder('ppt')!.folder('notesSlides')!.file('notesSlide1.xml', notes);
    const buf = (await zip.generateAsync({ type: 'arraybuffer' })) as ArrayBuffer;
    const file = new File([buf], 'test.pptx');

    const parsed = await parsePptx(file);
    const texts = parsed.segments.map((s) => s.text);
    expect(texts).toContain('Lee & Co.'); // entity 디코딩
    expect(texts).toContain('<신청서>'); // entity 디코딩
    expect(texts).toContain('발표자 메모: 010-1234-5678'); // 노트도 추출
  });
});
