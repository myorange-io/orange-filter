import type { ExportInput, ParseResult, Segment } from './types';

const SEG_ID = 'doc';

export async function parseTxt(file: File): Promise<ParseResult> {
  const text = await file.text();
  const segments: Segment[] = [{ id: SEG_ID, text }];
  return { segments, combinedText: text };
}

export async function exportTxt(_originalFile: File, masked: ExportInput): Promise<Blob> {
  const text = masked.get(SEG_ID) ?? '';
  return new Blob([text], { type: 'text/plain;charset=utf-8' });
}
