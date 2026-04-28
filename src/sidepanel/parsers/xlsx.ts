import * as XLSX from 'xlsx';
import type { ExportInput, ParseResult, Segment } from './types';

function cellId(sheet: string, address: string): string {
  return `${sheet}!${address}`;
}

export async function parseXlsx(file: File): Promise<ParseResult> {
  const buf = await file.arrayBuffer();
  const wb = XLSX.read(buf, { type: 'array' });
  const segments: Segment[] = [];
  const lines: string[] = [];
  for (const name of wb.SheetNames) {
    const sheet = wb.Sheets[name];
    if (!sheet) continue;
    const range = sheet['!ref'] ? XLSX.utils.decode_range(sheet['!ref']) : null;
    if (!range) continue;
    for (let R = range.s.r; R <= range.e.r; R++) {
      const rowCells: string[] = [];
      for (let C = range.s.c; C <= range.e.c; C++) {
        const addr = XLSX.utils.encode_cell({ r: R, c: C });
        const cell = sheet[addr];
        if (!cell) {
          rowCells.push('');
          continue;
        }
        // 수식(`f`)이 있으면 결과(`v`)는 표시용 — 수식 자체는 마스킹하지 않음 (formula는 PII 가능성 낮음).
        if (cell.t === 's' && typeof cell.v === 'string' && cell.v.length > 0) {
          segments.push({ id: cellId(name, addr), text: cell.v });
          rowCells.push(cell.v);
        } else if (cell.w && typeof cell.w === 'string') {
          rowCells.push(cell.w);
        } else {
          rowCells.push(String(cell.v ?? ''));
        }
      }
      lines.push(rowCells.join(' | '));
    }
  }
  return { segments, combinedText: lines.join('\n') };
}

export async function exportXlsx(originalFile: File, masked: ExportInput): Promise<Blob> {
  const buf = await originalFile.arrayBuffer();
  const wb = XLSX.read(buf, { type: 'array', cellStyles: true });
  for (const name of wb.SheetNames) {
    const sheet = wb.Sheets[name];
    if (!sheet) continue;
    const range = sheet['!ref'] ? XLSX.utils.decode_range(sheet['!ref']) : null;
    if (!range) continue;
    for (let R = range.s.r; R <= range.e.r; R++) {
      for (let C = range.s.c; C <= range.e.c; C++) {
        const addr = XLSX.utils.encode_cell({ r: R, c: C });
        const cell = sheet[addr];
        if (!cell || cell.t !== 's') continue;
        const replacement = masked.get(cellId(name, addr));
        if (replacement !== undefined) {
          cell.v = replacement;
          if (cell.w) cell.w = replacement;
        }
      }
    }
  }
  // 원본이 .xls라도 .xlsx로 출력 (현대 호환성). 사용자가 원본 형식 유지 원하면 옵션 노출 (S15+).
  const out = XLSX.write(wb, { type: 'array', bookType: 'xlsx' });
  return new Blob([out], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
}
