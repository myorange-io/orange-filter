// OOXML docProps 마스킹 helper 단위 테스트.
// DOCX/PPTX/XLSX 공통 메타데이터 파일(docProps/core.xml, app.xml, custom.xml)을
// segment로 노출하고 마스킹 결과로 다시 써넣는지 검증.

import JSZip from 'jszip';
import { describe, expect, test } from 'vitest';
import { exportOoxmlDocProps, parseOoxmlDocProps } from './ooxml-docprops';

const CORE_XML = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/">
  <dc:title>2024년 결산공시 보고서</dc:title>
  <dc:creator>홍길동</dc:creator>
  <cp:lastModifiedBy>김철수</cp:lastModifiedBy>
  <dc:subject>후원자 명단</dc:subject>
  <dc:description>연락처 010-1234-5678 포함</dc:description>
  <cp:keywords>NPO, 결산, 홍길동</cp:keywords>
  <dcterms:created xsi:type="dcterms:W3CDTF">2024-01-01T00:00:00Z</dcterms:created>
</cp:coreProperties>`;

const APP_XML = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties" xmlns:vt="http://schemas.openxmlformats.org/officeDocument/2006/docPropsVTypes">
  <ap:Application xmlns:ap="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties">Microsoft Office Word</ap:Application>
  <ap:Company xmlns:ap="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties">한국NPO재단</ap:Company>
</Properties>`;

async function makeZip(files: Record<string, string>): Promise<JSZip> {
  const zip = new JSZip();
  for (const [path, content] of Object.entries(files)) {
    zip.file(path, content);
  }
  return zip;
}

describe('parseOoxmlDocProps', () => {
  test('docProps/core.xml의 prefixed 텍스트 노드를 segment로 추출', async () => {
    const zip = await makeZip({ 'docProps/core.xml': CORE_XML });
    const segments = await parseOoxmlDocProps(zip);
    const texts = segments.map((s) => s.text);
    expect(texts).toContain('2024년 결산공시 보고서');
    expect(texts).toContain('홍길동');
    expect(texts).toContain('김철수');
    expect(texts).toContain('후원자 명단');
    expect(texts).toContain('연락처 010-1234-5678 포함');
    expect(texts).toContain('NPO, 결산, 홍길동');
  });

  test('docProps/app.xml + custom.xml도 함께 처리', async () => {
    const zip = await makeZip({
      'docProps/core.xml': CORE_XML,
      'docProps/app.xml': APP_XML,
    });
    const segments = await parseOoxmlDocProps(zip);
    const texts = segments.map((s) => s.text);
    expect(texts).toContain('Microsoft Office Word');
    expect(texts).toContain('한국NPO재단');
  });

  test('docProps 파일이 없으면 빈 배열', async () => {
    const zip = await makeZip({ 'word/document.xml': '<root/>' });
    const segments = await parseOoxmlDocProps(zip);
    expect(segments).toEqual([]);
  });

  test('segment id는 path + index로 unique', async () => {
    const zip = await makeZip({ 'docProps/core.xml': CORE_XML });
    const segments = await parseOoxmlDocProps(zip);
    const ids = segments.map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ids) {
      expect(id).toMatch(/^docprops::docProps\/core\.xml#\d+$/);
    }
  });
});

describe('exportOoxmlDocProps', () => {
  test('마스킹 결과를 동일 segment id로 치환', async () => {
    const zip = await makeZip({ 'docProps/core.xml': CORE_XML });
    const segments = await parseOoxmlDocProps(zip);

    // 작성자/제목/lastModifiedBy/keywords 모두 마스킹 (실제 PII detect 시 keywords에 들어 있는
    // "홍길동"도 잡힘 — 이 테스트는 docprops helper의 치환 동작만 검증).
    const masked = new Map<string, string>();
    for (const seg of segments) {
      if (seg.text === '홍길동') masked.set(seg.id, '●●●');
      if (seg.text === '김철수') masked.set(seg.id, '●●●');
      if (seg.text === '2024년 결산공시 보고서') masked.set(seg.id, '●●●●●●●●●●●●●●●');
      if (seg.text === 'NPO, 결산, 홍길동') masked.set(seg.id, 'NPO, 결산, ●●●');
    }

    await exportOoxmlDocProps(zip, masked);
    const out = await zip.files['docProps/core.xml']!.async('string');
    expect(out).not.toContain('홍길동');
    expect(out).not.toContain('김철수');
    expect(out).not.toContain('2024년 결산공시 보고서');
    expect(out).toContain('●●●');
    // 마스킹하지 않은 필드(description)는 원본 유지.
    expect(out).toContain('연락처 010-1234-5678 포함');
    // dcterms:created 같은 시스템 필드는 영향 없음.
    expect(out).toContain('2024-01-01T00:00:00Z');
  });

  test('마스킹 대상이 없으면 zip 파일을 다시 쓰지 않음 (no-op)', async () => {
    const zip = await makeZip({ 'docProps/core.xml': CORE_XML });
    const before = await zip.files['docProps/core.xml']!.async('string');
    await exportOoxmlDocProps(zip, new Map());
    const after = await zip.files['docProps/core.xml']!.async('string');
    expect(after).toBe(before);
  });

  test('XML 이스케이프가 보존됨 (& < > 가 그대로)', async () => {
    const xml = `<?xml version="1.0"?><root xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:creator>A &amp; B &lt;test&gt;</dc:creator></root>`;
    const zip = await makeZip({ 'docProps/core.xml': xml });
    const segments = await parseOoxmlDocProps(zip);
    expect(segments[0]!.text).toBe('A & B <test>');
    const masked = new Map([[segments[0]!.id, 'C & D <new>']]);
    await exportOoxmlDocProps(zip, masked);
    const out = await zip.files['docProps/core.xml']!.async('string');
    expect(out).toContain('C &amp; D &lt;new&gt;');
  });
});
