// 파서/익스포터 라우터 — 확장자별 dynamic import로 코드 분할.
// HWP/HWPX는 S13에서 추가됨.

import { fileExtension } from '../file-queue';
import type { ExportInput, ParseResult } from './types';

export type ParseFn = (file: File) => Promise<ParseResult>;
export type ExportFn = (originalFile: File, masked: ExportInput) => Promise<Blob>;

interface FormatModule {
  parse: ParseFn;
  exportMasked: ExportFn;
}

async function load(ext: string): Promise<FormatModule> {
  switch (ext) {
    case '.txt': {
      const m = await import('./txt');
      return { parse: m.parseTxt, exportMasked: m.exportTxt };
    }
    case '.csv': {
      const m = await import('./csv');
      return { parse: m.parseCsv, exportMasked: m.exportCsv };
    }
    case '.xlsx':
    case '.xls': {
      const m = await import('./xlsx');
      return { parse: m.parseXlsx, exportMasked: m.exportXlsx };
    }
    case '.docx': {
      const m = await import('./docx');
      return { parse: m.parseDocx, exportMasked: m.exportDocx };
    }
    case '.pptx': {
      const m = await import('./pptx');
      return { parse: m.parsePptx, exportMasked: m.exportPptx };
    }
    case '.pdf': {
      const m = await import('./pdf');
      return { parse: m.parsePdf, exportMasked: m.exportPdf };
    }
    case '.hwp': {
      const m = await import('./hwp');
      return { parse: m.parseHwp, exportMasked: m.exportHwp };
    }
    case '.hwpx': {
      const m = await import('./hwpx');
      return { parse: m.parseHwpx, exportMasked: m.exportHwpx };
    }
    default:
      throw new Error(`지원하지 않는 확장자: ${ext}`);
  }
}

export async function parseFile(file: File): Promise<ParseResult> {
  const mod = await load(fileExtension(file));
  return mod.parse(file);
}

export async function exportFile(originalFile: File, masked: ExportInput): Promise<Blob> {
  const mod = await load(fileExtension(originalFile));
  return mod.exportMasked(originalFile, masked);
}

export type { ParseResult, Segment, ExportInput } from './types';
