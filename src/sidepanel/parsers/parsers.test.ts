// 통합 테스트 — sample/ 폴더의 실 NPO 양식 파일로 round-trip 검증.
// node 20+ File API 사용. 사용자가 sample/을 옮기면 이 테스트는 skip 처리됨.

import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, test } from 'vitest';
import { parseTxt, exportTxt } from './txt';
import { parseCsv, exportCsv } from './csv';
import { parseXlsx, exportXlsx } from './xlsx';
import { parseDocx, exportDocx } from './docx';
import { parseHwp } from './hwp';

const SAMPLE_DIR = join(process.cwd(), 'sample');

function fileFromDisk(path: string): File {
  const buf = readFileSync(path);
  const name = path.split('/').pop() ?? 'file';
  return new File([buf], name);
}

function findSample(pattern: RegExp): string | null {
  if (!existsSync(SAMPLE_DIR)) return null;
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
    // 결산공시 양식이라 "공익법인" 또는 "결산서류" 등의 단어가 들어있어야 함
    const combined = parsed.combinedText;
    expect(combined.length).toBeGreaterThan(0);
    const hasKoreanForm =
      combined.includes('공익법인') ||
      combined.includes('결산') ||
      combined.includes('서식') ||
      combined.includes('명세');
    expect(hasKoreanForm).toBe(true);
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
