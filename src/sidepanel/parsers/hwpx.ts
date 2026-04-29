// HWPX 파서 — ZIP + XML (DOCX와 유사한 구조). round-trip 지원.
// HWPX 표준: Contents/section*.xml에 텍스트가 `<hp:t>...</hp:t>` 노드로 저장됨.
// 네임스페이스 prefix는 hp: 가 일반적이지만 다른 prefix 사용 가능 → `[a-z0-9]+:t` 패턴.

import JSZip from 'jszip';
import { buildNodeMeta, parseTables } from './table-walker';
import type { ExportInput, ParseResult, Segment } from './types';

const SECTION_RE = /^Contents\/section\d+\.xml$/;
// `<x:t ...>text</x:t>` — XML 파서 없이 텍스트 노드만 캡처.
const TEXT_NODE_RE = /<([a-zA-Z][a-zA-Z0-9]*:t)(?:\s[^>]*)?>([^<]*)<\/\1>/g;

// 한컴 오피스가 미리보기 표시용으로 zip 안에 함께 저장하는 평문 텍스트.
// 본문(section*.xml)을 가려도 이 파일이 남으면 파일 미리보기에 원본 PII가 그대로 노출.
const PRV_TEXT_PATH = 'Preview/PrvText.txt';

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
    // 표 구조 식별. HWPX namespace는 보통 'hp'.
    const tables = parseTables(xml, 'hp', 'hp');
    const nodeMeta = buildNodeMeta(tables);
    let m: RegExpExecArray | null;
    // i는 빈 노드 포함 인덱스 (export와 일치, table-walker와도 일치).
    let i = -1;
    TEXT_NODE_RE.lastIndex = 0;
    while ((m = TEXT_NODE_RE.exec(xml)) !== null) {
      i++;
      const inner = m[2] ?? '';
      if (inner.length === 0) continue;
      const decoded = decodeXml(inner).normalize('NFC');
      const meta = nodeMeta.get(i);
      const seg: Segment = { id: segId(path, i), text: decoded };
      if (meta?.isHeader) seg.isHeader = true;
      else if (meta?.forcedCategory) seg.forcedCategory = meta.forcedCategory;
      else if (meta?.nameHintOnly) seg.nameHintOnly = true;
      segments.push(seg);
      lines.push(decoded);
    }
  }
  // 미리보기 텍스트 (평문). 본문 마스킹과 별개로 가려야 미리보기 누출 차단.
  const prvFile = zip.files[PRV_TEXT_PATH];
  if (prvFile) {
    const raw = (await prvFile.async('string')).normalize('NFC');
    if (raw.length > 0) {
      segments.push({ id: segId(PRV_TEXT_PATH, 0), text: raw });
      lines.push(raw);
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
    // i는 빈 노드 포함 인덱스 — parseHwpx와 동일 인덱싱.
    let i = -1;
    let cursor = 0;
    let out = '';
    TEXT_NODE_RE.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = TEXT_NODE_RE.exec(xml)) !== null) {
      i++;
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
    }
    out += xml.slice(cursor);
    zip.file(path, out);
  }
  // 미리보기 텍스트 — parse 시 단일 segment로 등록했으므로 동일 id로 치환.
  const prvFile = zip.files[PRV_TEXT_PATH];
  if (prvFile) {
    const id = segId(PRV_TEXT_PATH, 0);
    const replacement = masked.get(id);
    if (replacement !== undefined) {
      zip.file(PRV_TEXT_PATH, replacement);
    }
  }
  const blob = await zip.generateAsync({ type: 'blob' });
  return new Blob([await blob.arrayBuffer()], { type: 'application/hwp+zip' });
}
