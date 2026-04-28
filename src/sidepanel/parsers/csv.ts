import Papa from 'papaparse';
import { detectHeaderRow } from '@/background/pii/header-hints';
import type { ExportInput, ParseResult, Segment } from './types';

function cellId(row: number, col: number): string {
  return `r${row}c${col}`;
}

export async function parseCsv(file: File): Promise<ParseResult> {
  const text = await file.text();
  const result = Papa.parse<string[]>(text, { skipEmptyLines: false });
  const rows = result.data;

  // 헤더 행 자동 감지 — CSV 표준이지만 첫 행이 메모/제목인 경우도 대비해 처음 5행 스캔.
  // NFC 정규화 후 매칭 (NFD 자모 분해 셀 대응).
  const previewRows = rows
    .slice(0, 5)
    .map((row) => row.map((c) => (c ?? '').normalize('NFC')));
  const headerInfo = detectHeaderRow(previewRows);
  const headerRowIndex = headerInfo?.rowIndex;
  const categoryByCol = headerInfo?.categoryByCol;
  const nameHintCols = headerInfo?.nameHintCols;

  const segments: Segment[] = [];
  rows.forEach((row, ri) => {
    const isHeaderRow = ri === headerRowIndex;
    row.forEach((cell, ci) => {
      if (cell == null) return;
      // macOS Finder가 NFD로 저장한 한글 파일명을 NFC로 정규화 (정규식 [가-힣] 매치).
      const cellText = String(cell).normalize('NFC');
      if (cellText.length === 0) return;
      const seg: Segment = { id: cellId(ri, ci), text: cellText };
      if (isHeaderRow) {
        seg.isHeader = true;
      } else if (categoryByCol?.has(ci)) {
        seg.forcedCategory = categoryByCol.get(ci);
      } else if (nameHintCols?.has(ci)) {
        seg.nameHintOnly = true;
      }
      segments.push(seg);
    });
  });
  const combinedText = rows.map((r) => r.join(' | ')).join('\n');
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
