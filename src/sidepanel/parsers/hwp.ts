// HWP 5.x (OLE2) parser/serializer — @rhwp/core (Rust+WASM) 기반.
// parse: 본문 단락 + 표 셀 단락을 traversal하여 segment 추출.
// export: 같은 좌표로 deleteText/insertText 후 exportHwp() → 원본 레이아웃 보존.
//
// 보수적 정책 (v1.0):
//  - 본문 단락에 inline control(표/이미지/도형 등)이 있으면 export 시 skip.
//    이유: deleteText가 control 좌표를 흔들 수 있어 안전 우선.
//    PII는 표 셀에 압도적이라 NPO 결산공시 use case는 충분히 커버됨.
//  - parse 단계에서는 모두 emit (detection은 정상). export 단계에서만 선별 mutate.

import type { ExportInput, ParseResult, Segment } from './types';

type RhwpModule = typeof import('@rhwp/core');

let rhwpPromise: Promise<RhwpModule> | null = null;

function isExtensionContext(): boolean {
  return typeof chrome !== 'undefined' && !!chrome.runtime?.getURL;
}

async function initFromBytes(mod: RhwpModule, bytes: Uint8Array | ArrayBuffer): Promise<void> {
  // initSync는 ArrayBuffer/SharedArrayBuffer 같은 BufferSource를 직접 받음.
  mod.initSync({ module: bytes as BufferSource });
}

async function loadRhwp(): Promise<RhwpModule> {
  if (rhwpPromise) return rhwpPromise;
  rhwpPromise = (async () => {
    const mod = await import('@rhwp/core');
    if (isExtensionContext()) {
      const url = chrome.runtime.getURL('rhwp/rhwp_bg.wasm');
      const res = await fetch(url);
      const bytes = await res.arrayBuffer();
      await initFromBytes(mod, bytes);
    } else {
      // node test 환경
      const fs = await import('node:fs');
      const path = await import('node:path');
      const wasmPath = path.join(process.cwd(), 'node_modules/@rhwp/core/rhwp_bg.wasm');
      const bytes = fs.readFileSync(wasmPath);
      await initFromBytes(mod, bytes);
    }
    return mod;
  })();
  return rhwpPromise;
}

interface BodyLoc {
  kind: 'body';
  section: number;
  para: number;
  hasInlineControl: boolean;
}
interface CellLoc {
  kind: 'cell';
  section: number;
  parentPara: number;
  ctrl: number;
  cell: number;
  cellPara: number;
}
type SegLoc = BodyLoc | CellLoc;

function locToId(loc: SegLoc): string {
  if (loc.kind === 'body') return `s${loc.section}p${loc.para}`;
  return `s${loc.section}p${loc.parentPara}c${loc.ctrl}cell${loc.cell}q${loc.cellPara}`;
}

interface HwpDoc {
  free(): void;
  getSectionCount(): number;
  getParagraphCount(section: number): number;
  getParagraphLength(section: number, para: number): number;
  getTextRange(section: number, para: number, charOffset: number, count: number): string;
  getControlTextPositions(section: number, para: number): string;
  getTableDimensions(section: number, parentPara: number, ctrl: number): string;
  getCellParagraphCount(section: number, parentPara: number, ctrl: number, cell: number): number;
  getCellParagraphLength(
    section: number,
    parentPara: number,
    ctrl: number,
    cell: number,
    cellPara: number,
  ): number;
  getTextInCell(
    section: number,
    parentPara: number,
    ctrl: number,
    cell: number,
    cellPara: number,
    charOffset: number,
    count: number,
  ): string;
  deleteText(section: number, para: number, charOffset: number, count: number): string;
  insertText(section: number, para: number, charOffset: number, text: string): string;
  deleteTextInCell(
    section: number,
    parentPara: number,
    ctrl: number,
    cell: number,
    cellPara: number,
    charOffset: number,
    count: number,
  ): string;
  insertTextInCell(
    section: number,
    parentPara: number,
    ctrl: number,
    cell: number,
    cellPara: number,
    charOffset: number,
    text: string,
  ): string;
  exportHwp(): Uint8Array;
}

function controlPositions(doc: HwpDoc, section: number, para: number): number[] {
  let json: string;
  try {
    json = doc.getControlTextPositions(section, para);
  } catch {
    return [];
  }
  try {
    const parsed = JSON.parse(json);
    return Array.isArray(parsed) ? (parsed as number[]) : [];
  } catch {
    return [];
  }
}

function tableCellCount(doc: HwpDoc, section: number, parentPara: number, ctrl: number): number {
  try {
    const json = doc.getTableDimensions(section, parentPara, ctrl);
    const dims = JSON.parse(json) as { cellCount?: number };
    return typeof dims.cellCount === 'number' ? dims.cellCount : 0;
  } catch {
    return 0; // 표가 아닌 control (그림, 도형 등)
  }
}

type Visitor = (loc: SegLoc, text: string, charLength: number) => void;

function walkSection(doc: HwpDoc, section: number, visit: Visitor): void {
  const paraCount = doc.getParagraphCount(section);
  for (let p = 0; p < paraCount; p++) {
    const positions = controlPositions(doc, section, p);
    const hasInlineControl = positions.length > 0;

    const len = doc.getParagraphLength(section, p);
    const text = len > 0 ? doc.getTextRange(section, p, 0, len) : '';
    visit({ kind: 'body', section, para: p, hasInlineControl }, text, len);

    for (let ctrl = 0; ctrl < positions.length; ctrl++) {
      const cellCount = tableCellCount(doc, section, p, ctrl);
      for (let cell = 0; cell < cellCount; cell++) {
        let cellParaCount: number;
        try {
          cellParaCount = doc.getCellParagraphCount(section, p, ctrl, cell);
        } catch {
          continue;
        }
        for (let cp = 0; cp < cellParaCount; cp++) {
          const cellLen = doc.getCellParagraphLength(section, p, ctrl, cell, cp);
          const cellText =
            cellLen > 0 ? doc.getTextInCell(section, p, ctrl, cell, cp, 0, cellLen) : '';
          visit(
            { kind: 'cell', section, parentPara: p, ctrl, cell, cellPara: cp },
            cellText,
            cellLen,
          );
        }
      }
    }
  }
}

export async function parseHwp(file: File): Promise<ParseResult> {
  const mod = await loadRhwp();
  const bytes = new Uint8Array(await file.arrayBuffer());
  const doc = new mod.HwpDocument(bytes) as unknown as HwpDoc;
  const segments: Segment[] = [];
  const lines: string[] = [];
  try {
    const sectionCount = doc.getSectionCount();
    for (let s = 0; s < sectionCount; s++) {
      walkSection(doc, s, (loc, text) => {
        if (text.trim().length === 0) return;
        segments.push({ id: locToId(loc), text });
        lines.push(text);
      });
    }
  } finally {
    doc.free();
  }
  return { segments, combinedText: lines.join('\n') };
}

export async function exportHwp(originalFile: File, masked: ExportInput): Promise<Blob> {
  const mod = await loadRhwp();
  const bytes = new Uint8Array(await originalFile.arrayBuffer());
  const doc = new mod.HwpDocument(bytes) as unknown as HwpDoc;
  try {
    const sectionCount = doc.getSectionCount();
    for (let s = 0; s < sectionCount; s++) {
      walkSection(doc, s, (loc, _text, len) => {
        const replacement = masked.get(locToId(loc));
        if (replacement === undefined) return;
        if (loc.kind === 'body') {
          // 단락에 inline control이 있으면 보수적으로 skip — control 좌표 흔들림 방지.
          if (loc.hasInlineControl) return;
          if (len > 0) doc.deleteText(loc.section, loc.para, 0, len);
          if (replacement.length > 0) doc.insertText(loc.section, loc.para, 0, replacement);
        } else {
          if (len > 0) {
            doc.deleteTextInCell(
              loc.section,
              loc.parentPara,
              loc.ctrl,
              loc.cell,
              loc.cellPara,
              0,
              len,
            );
          }
          if (replacement.length > 0) {
            doc.insertTextInCell(
              loc.section,
              loc.parentPara,
              loc.ctrl,
              loc.cell,
              loc.cellPara,
              0,
              replacement,
            );
          }
        }
      });
    }
    const out = doc.exportHwp();
    return new Blob([out], { type: 'application/x-hwp' });
  } finally {
    doc.free();
  }
}
