import Papa from 'papaparse';
import type { ExportInput, ParseResult, Segment } from './types';

function cellId(row: number, col: number): string {
  return `r${row}c${col}`;
}

export async function parseCsv(file: File): Promise<ParseResult> {
  const text = await file.text();
  const result = Papa.parse<string[]>(text, { skipEmptyLines: false });
  const segments: Segment[] = [];
  result.data.forEach((row, ri) => {
    row.forEach((cell, ci) => {
      if (cell == null) return;
      const cellText = String(cell);
      if (cellText.length === 0) return;
      segments.push({ id: cellId(ri, ci), text: cellText });
    });
  });
  const combinedText = result.data.map((r) => r.join(' | ')).join('\n');
  return { segments, combinedText };
}

export async function exportCsv(originalFile: File, masked: ExportInput): Promise<Blob> {
  const text = await originalFile.text();
  const result = Papa.parse<string[]>(text, { skipEmptyLines: false });
  const replaced: string[][] = result.data.map((row, ri) =>
    row.map((cell, ci) => masked.get(cellId(ri, ci)) ?? cell ?? ''),
  );
  const out = Papa.unparse(replaced);
  return new Blob([out], { type: 'text/csv;charset=utf-8' });
}
