// PPTX 파서 — ZIP + ppt/slides/slide{N}.xml. <a:t>(DrawingML 텍스트) 노드를
// 추출/치환하는 방식으로 서식·레이아웃은 보존하면서 텍스트만 마스킹.
//
// 구조 (OOXML):
//   ppt/slides/slide1.xml, slide2.xml, ... — 각 슬라이드의 도형 + 텍스트
//   ppt/notesSlides/notesSlide{N}.xml      — 발표자 노트 (선택적, NPO 공유 자료에서 PII 위험)
//   <a:t> 텍스트 노드 = DrawingML run의 텍스트 (DOCX <w:t>와 평행 패턴)

import JSZip from 'jszip';
import type { ExportInput, ParseResult, Segment } from './types';

const SLIDE_RE = /^ppt\/slides\/slide\d+\.xml$/;
const NOTES_RE = /^ppt\/notesSlides\/notesSlide\d+\.xml$/;
const TEXT_NODE_RE = /<a:t(?:\s[^>]*)?>([^<]*)<\/a:t>/g;

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

function textNodes(xml: string): Array<{ start: number; end: number; text: string }> {
  const out: Array<{ start: number; end: number; text: string }> = [];
  TEXT_NODE_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = TEXT_NODE_RE.exec(xml)) !== null) {
    const inner = m[1] ?? '';
    // inner의 절대 위치: 매치 전체 시작 + opening tag 끝 위치
    const openEnd = m[0].indexOf('>') + 1;
    const innerStart = m.index + openEnd;
    out.push({ start: innerStart, end: innerStart + inner.length, text: inner });
  }
  return out;
}

function segId(path: string, idx: number): string {
  return `${path}#${idx}`;
}

function targetPaths(zip: JSZip): string[] {
  // 슬라이드 + 발표자 노트. 정렬해 결정적 순서.
  const paths = Object.keys(zip.files).filter(
    (p) => SLIDE_RE.test(p) || NOTES_RE.test(p),
  );
  return paths.sort();
}

export async function parsePptx(file: File): Promise<ParseResult> {
  const zip = await JSZip.loadAsync(await file.arrayBuffer());
  const segments: Segment[] = [];
  const lines: string[] = [];
  for (const path of targetPaths(zip)) {
    const xml = await zip.files[path]!.async('string');
    const nodes = textNodes(xml);
    nodes.forEach((n, i) => {
      if (n.text.length === 0) return;
      const decoded = decodeXmlText(n.text);
      segments.push({ id: segId(path, i), text: decoded });
      lines.push(decoded);
    });
  }
  return { segments, combinedText: lines.join('\n') };
}

export async function exportPptx(
  originalFile: File,
  masked: ExportInput,
): Promise<Blob> {
  const zip = await JSZip.loadAsync(await originalFile.arrayBuffer());
  for (const path of targetPaths(zip)) {
    const file = zip.files[path]!;
    const xml = await file.async('string');
    const nodes = textNodes(xml);
    if (nodes.length === 0) continue;
    // 뒤에서부터 치환해 offset 무효화 방지
    let out = xml;
    for (let i = nodes.length - 1; i >= 0; i--) {
      const node = nodes[i]!;
      const replacement = masked.get(segId(path, i));
      if (replacement === undefined) continue;
      out = out.slice(0, node.start) + encodeXmlText(replacement) + out.slice(node.end);
    }
    zip.file(path, out);
  }
  const blob = await zip.generateAsync({ type: 'blob' });
  return new Blob([await blob.arrayBuffer()], {
    type: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  });
}
