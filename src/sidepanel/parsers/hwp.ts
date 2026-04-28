// HWP 5.x (OLE2) 파서 — hwp.js로 텍스트 추출 (read-only).
// 한국 NPO 결산공시 양식 등은 텍스트가 대부분 표(TableControl) 안에 있어 재귀 walker 필요.
//
// v1 한계: hwp.js는 viewer/parser. 마스킹 후 같은 .hwp로 round-trip은 미지원.
// → exportHwp는 TXT fallback. v2에서 rhwp WASM 통합.

import { parse } from 'hwp.js';
import type { ExportInput, ParseResult, Segment } from './types';

interface HWPCharLike {
  type: number; // 0=Char, 1=Inline, 2=Extened
  value: number | string;
}
interface HWPParagraphLike {
  content: HWPCharLike[];
  controls?: HWPControlLike[];
}
interface HWPCellLike {
  items?: HWPParagraphLike[];
}
interface HWPControlLike {
  content?: HWPCellLike[][] | HWPParagraphLike[];
}
interface HWPSectionLike {
  content: HWPParagraphLike[];
}
interface HWPDocumentLike {
  sections: HWPSectionLike[];
}

function extractParaText(p: HWPParagraphLike): string {
  let out = '';
  for (const c of p.content) {
    if (c.type !== 0) continue; // Inline/Extened 컨트롤 코드 skip
    const v = c.value;
    if (typeof v === 'string') {
      out += v;
    } else if (typeof v === 'number') {
      // \x0B(11)는 컨트롤 마커 — skip. \r(13)/space(32) 이상만.
      if (v === 9 || v === 10 || v === 13 || v >= 32) out += String.fromCharCode(v);
    }
  }
  return out;
}

function walk(
  para: HWPParagraphLike,
  prefix: string,
  segments: Segment[],
  lines: string[],
): void {
  const text = extractParaText(para).trim();
  if (text.length > 0) {
    segments.push({ id: prefix, text });
    lines.push(text);
  }
  if (!para.controls) return;
  para.controls.forEach((ctrl, ci) => {
    const content = ctrl.content;
    if (!Array.isArray(content)) return;
    // TableControl: content는 rows[]; 각 row는 cells[]; 각 cell.items가 paragraphs.
    if (content.length > 0 && Array.isArray(content[0])) {
      (content as HWPCellLike[][]).forEach((row, ri) => {
        row.forEach((cell, cellIdx) => {
          (cell.items ?? []).forEach((item, ii) => {
            walk(item, `${prefix}-c${ci}r${ri}c${cellIdx}i${ii}`, segments, lines);
          });
        });
      });
    } else {
      // 그 외 컨트롤(텍스트 박스 등) — content가 paragraph[]
      (content as HWPParagraphLike[]).forEach((p, ii) => {
        if (p && Array.isArray(p.content)) {
          walk(p, `${prefix}-c${ci}p${ii}`, segments, lines);
        }
      });
    }
  });
}

export async function parseHwp(file: File): Promise<ParseResult> {
  const buf = new Uint8Array(await file.arrayBuffer());
  const doc = parse(buf, { type: 'array' }) as unknown as HWPDocumentLike;
  const segments: Segment[] = [];
  const lines: string[] = [];
  doc.sections.forEach((section, si) => {
    section.content.forEach((para, pi) => {
      walk(para, `s${si}p${pi}`, segments, lines);
    });
  });
  return { segments, combinedText: lines.join('\n') };
}

export async function exportHwp(_originalFile: File, masked: ExportInput): Promise<Blob> {
  // v1 한계: 원본 .hwp round-trip 미지원. 마스킹된 텍스트만 .txt로 출력.
  // 호출자는 결과 파일명을 .txt로 변경해야 함.
  const lines: string[] = [];
  for (const text of masked.values()) lines.push(text);
  return new Blob([lines.join('\n')], { type: 'text/plain;charset=utf-8' });
}

/** HWP 익스포트는 TXT fallback이라 호출자가 파일명 확장자를 바꿔야 함 */
export const HWP_EXPORT_IS_TXT = true;
