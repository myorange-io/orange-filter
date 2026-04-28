// HWPX 파서 — ZIP + XML (DOCX와 유사한 구조). round-trip 지원.
// HWPX 표준: Contents/section*.xml에 텍스트가 `<hp:t>...</hp:t>` 노드로 저장됨.
// 네임스페이스 prefix는 hp: 가 일반적이지만 다른 prefix 사용 가능 → `[a-z0-9]+:t` 패턴.

import JSZip from 'jszip';
import type { ExportInput, ParseResult, Segment } from './types';

const SECTION_RE = /^Contents\/section\d+\.xml$/;
// `<x:t ...>text</x:t>` — XML 파서 없이 텍스트 노드만 캡처.
const TEXT_NODE_RE = /<([a-zA-Z][a-zA-Z0-9]*:t)(?:\s[^>]*)?>([^<]*)<\/\1>/g;

function decodeXml(s: string): string {
  return s
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'");
}

function encodeXml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function segId(section: string, idx: number): string {
  return `${section}#${idx}`;
}

export async function parseHwpx(file: File): Promise<ParseResult> {
  const zip = await JSZip.loadAsync(await file.arrayBuffer());
  const segments: Segment[] = [];
  const lines: string[] = [];
  for (const path of Object.keys(zip.files)) {
    if (!SECTION_RE.test(path)) continue;
    const xml = await zip.files[path]!.async('string');
    let m: RegExpExecArray | null;
    let i = 0;
    TEXT_NODE_RE.lastIndex = 0;
    while ((m = TEXT_NODE_RE.exec(xml)) !== null) {
      const inner = m[2] ?? '';
      if (inner.length === 0) continue;
      const decoded = decodeXml(inner);
      segments.push({ id: segId(path, i), text: decoded });
      lines.push(decoded);
      i++;
    }
  }
  return { segments, combinedText: lines.join('\n') };
}

export async function exportHwpx(originalFile: File, masked: ExportInput): Promise<Blob> {
  const zip = await JSZip.loadAsync(await originalFile.arrayBuffer());
  for (const path of Object.keys(zip.files)) {
    if (!SECTION_RE.test(path)) continue;
    const file = zip.files[path]!;
    const xml = await file.async('string');
    let i = 0;
    let cursor = 0;
    let out = '';
    TEXT_NODE_RE.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = TEXT_NODE_RE.exec(xml)) !== null) {
      const fullMatch = m[0];
      const inner = m[2] ?? '';
      if (inner.length === 0) continue;
      const id = segId(path, i);
      const replacement = masked.get(id);
      const matchStart = m.index;
      const matchEnd = matchStart + fullMatch.length;
      out += xml.slice(cursor, matchStart);
      if (replacement !== undefined) {
        // 원본 매치를 텍스트만 치환해 재구성
        const opening = fullMatch.slice(0, fullMatch.indexOf('>') + 1);
        const closing = fullMatch.slice(fullMatch.lastIndexOf('</'));
        out += `${opening}${encodeXml(replacement)}${closing}`;
      } else {
        out += fullMatch;
      }
      cursor = matchEnd;
      i++;
    }
    out += xml.slice(cursor);
    zip.file(path, out);
  }
  const blob = await zip.generateAsync({ type: 'blob' });
  return new Blob([await blob.arrayBuffer()], { type: 'application/hwp+zip' });
}
