import JSZip from 'jszip';
import { buildNodeMeta, parseTables } from './table-walker';
import type { ExportInput, ParseResult, Segment } from './types';

// DOCX는 ZIP + word/document.xml. <w:t> 텍스트 노드를 추출/치환하는 방식으로
// 서식은 보존하면서 텍스트만 마스킹. mammoth는 내부 사용 안 함 (XML walking이 round-trip에 더 적합).

const DOCUMENT_PATH = 'word/document.xml';

function textNodes(xml: string): Array<{ start: number; end: number; text: string }> {
  // <w:t ...>text</w:t> — XML 파서 없이 안전한 정규식.
  // 주의: w:t 안의 < > 같은 entity는 그대로 유지.
  const out: Array<{ start: number; end: number; text: string }> = [];
  const re = /<w:t(?:\s[^>]*)?>([^<]*)<\/w:t>/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(xml)) !== null) {
    const inner = m[1] ?? '';
    const innerStart = m.index + m[0].indexOf(inner, m[0].indexOf('>'));
    out.push({ start: innerStart, end: innerStart + inner.length, text: inner });
  }
  return out;
}

function decodeXmlText(s: string): string {
  return s
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'");
}

function encodeXmlText(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

export async function parseDocx(file: File): Promise<ParseResult> {
  const zip = await JSZip.loadAsync(await file.arrayBuffer());
  const xml = await zip.file(DOCUMENT_PATH)?.async('string');
  if (!xml) throw new Error('DOCX: word/document.xml 없음');
  const nodes = textNodes(xml);
  // 표 구조 식별 — 표 안 텍스트 노드들에 isHeader/forcedCategory/nameHintOnly 부여.
  const tables = parseTables(xml, 'w', 'w');
  const nodeMeta = buildNodeMeta(tables);
  const segments: Segment[] = [];
  nodes.forEach((n, i) => {
    const text = decodeXmlText(n.text).normalize('NFC');
    if (text.length === 0) return;
    const meta = nodeMeta.get(i);
    const seg: Segment = { id: `t${i}`, text };
    if (meta?.isHeader) seg.isHeader = true;
    else if (meta?.forcedCategory) seg.forcedCategory = meta.forcedCategory;
    else if (meta?.nameHintOnly) seg.nameHintOnly = true;
    segments.push(seg);
  });
  return {
    segments,
    combinedText: segments.map((s) => s.text).join(' '),
  };
}

export async function exportDocx(originalFile: File, masked: ExportInput): Promise<Blob> {
  const zip = await JSZip.loadAsync(await originalFile.arrayBuffer());
  const docFile = zip.file(DOCUMENT_PATH);
  if (!docFile) throw new Error('DOCX: word/document.xml 없음');
  const xml = await docFile.async('string');
  const nodes = textNodes(xml);
  // 뒤에서부터 치환해 offset 무효화 방지
  let out = xml;
  for (let i = nodes.length - 1; i >= 0; i--) {
    const node = nodes[i]!;
    const replacement = masked.get(`t${i}`);
    if (replacement === undefined) continue;
    out = out.slice(0, node.start) + encodeXmlText(replacement) + out.slice(node.end);
  }
  zip.file(DOCUMENT_PATH, out);
  const blob = await zip.generateAsync({ type: 'blob' });
  return new Blob([await blob.arrayBuffer()], {
    type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  });
}
