// OOXML 메타데이터(docProps/*.xml) 마스킹 helper.
//
// DOCX·XLSX·PPTX는 모두 zip 안에 Dublin Core 메타데이터를 다음 경로로 보존한다:
//   - docProps/core.xml    : title / creator / lastModifiedBy / subject / description / keywords
//   - docProps/app.xml     : Application / Company / Manager (Office 자동 채움)
//   - docProps/custom.xml  : 사용자 정의 속성
//
// 본문(word/document.xml, ppt/slides/*.xml 등)을 가렸어도 이 메타데이터에 작성자
// 이름·연락처·후원자 명단 같은 PII가 남으면 zip 풀어서 보면 그대로 노출된다 (HWPX의
// Preview/PrvText.txt 누출과 같은 종류 결함).
//
// 형식: 모든 docProps/*.xml은 prefixed element(<dc:creator>홍길동</dc:creator> 등)이라
// 본문 OOXML 파서와 다른 정규식이 필요. 그러나 segment id 규약은 동일하므로 동일
// mask-segments 파이프라인을 그대로 통과한다.

import type JSZip from 'jszip';
import type { Segment } from './types';

const DOCPROPS_PATHS = [
  'docProps/core.xml',
  'docProps/app.xml',
  'docProps/custom.xml',
] as const;

// prefixed element — <ns:tag attr="...">inner</ns:tag>. self-closing/빈 element는 매치 안 함.
// app.xml처럼 opening tag에 namespace 속성이 붙는 경우도 포함하기 위해 (?:\s[^>]*)? 허용.
const TEXT_NODE_RE = /<([a-zA-Z][a-zA-Z0-9]*:[a-zA-Z][a-zA-Z0-9]*)(?:\s[^>]*)?>([^<]+)<\/\1>/g;

function decodeXmlText(s: string): string {
  return s
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'");
}

function encodeXmlText(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function segId(path: string, idx: number): string {
  return `docprops::${path}#${idx}`;
}

export async function parseOoxmlDocProps(zip: JSZip): Promise<Segment[]> {
  const out: Segment[] = [];
  for (const path of DOCPROPS_PATHS) {
    const file = zip.files[path];
    if (!file) continue;
    const xml = await file.async('string');
    const re = new RegExp(TEXT_NODE_RE.source, 'g');
    let m: RegExpExecArray | null;
    let idx = -1;
    while ((m = re.exec(xml)) !== null) {
      idx++;
      const inner = m[2] ?? '';
      if (inner.length === 0) continue;
      const decoded = decodeXmlText(inner).normalize('NFC');
      out.push({ id: segId(path, idx), text: decoded });
    }
  }
  return out;
}

export async function exportOoxmlDocProps(
  zip: JSZip,
  masked: ReadonlyMap<string, string>,
): Promise<void> {
  for (const path of DOCPROPS_PATHS) {
    const file = zip.files[path];
    if (!file) continue;
    const xml = await file.async('string');
    let out = '';
    let cursor = 0;
    let idx = -1;
    const re = new RegExp(TEXT_NODE_RE.source, 'g');
    let m: RegExpExecArray | null;
    let dirty = false;
    while ((m = re.exec(xml)) !== null) {
      const inner = m[2] ?? '';
      out += xml.slice(cursor, m.index);
      if (inner.length === 0) {
        out += m[0];
      } else {
        idx++;
        const replacement = masked.get(segId(path, idx));
        if (replacement !== undefined) {
          const opening = m[0].slice(0, m[0].indexOf('>') + 1);
          const closing = m[0].slice(m[0].lastIndexOf('</'));
          out += `${opening}${encodeXmlText(replacement)}${closing}`;
          dirty = true;
        } else {
          out += m[0];
        }
      }
      cursor = m.index + m[0].length;
    }
    out += xml.slice(cursor);
    if (dirty) zip.file(path, out);
  }
}
