import type { ExportInput, ParseResult, Segment } from './types';

const SEG_ID = 'doc';

export async function parseTxt(file: File): Promise<ParseResult> {
  // macOS Finder/일부 OS는 한글을 NFD(자모 분해)로 저장 → 정규식 [가-힣] 미스.
  const text = (await file.text()).normalize('NFC');
  const segments: Segment[] = [{ id: SEG_ID, text }];
  return { segments, combinedText: text };
}

export async function exportTxt(_originalFile: File, masked: ExportInput): Promise<Blob> {
  const text = masked.get(SEG_ID) ?? '';
  return new Blob([text], { type: 'text/plain;charset=utf-8' });
}
