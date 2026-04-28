import * as XLSX from 'xlsx';
import { detectHeaderRow } from '@/background/pii/header-hints';
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

    // 헤더 행 자동 감지 — 시트 처음 5행에서 키워드와 매치되는 셀이 가장 많은 행을 헤더로.
    // 헤더 행이 row 0이 아닐 수 있음 (예: row 0에 메모/제목, row 1이 진짜 헤더).
    const previewRows: string[][] = [];
    const previewLimit = Math.min(5, range.e.r - range.s.r + 1);
    for (let R = range.s.r; R < range.s.r + previewLimit; R++) {
      const rowCells: string[] = [];
      for (let C = range.s.c; C <= range.e.c; C++) {
        const addr = XLSX.utils.encode_cell({ r: R, c: C });
        const cell = sheet[addr];
        const raw =
          cell?.t === 's' && typeof cell.v === 'string' ? cell.v : (cell?.w ?? '');
        rowCells.push(raw.normalize('NFC'));
      }
      previewRows.push(rowCells);
    }
    const headerInfo = detectHeaderRow(previewRows);
    const headerRowIndex = headerInfo
      ? range.s.r + headerInfo.rowIndex
      : undefined;
    const categoryByCol = headerInfo?.categoryByCol;

    for (let R = range.s.r; R <= range.e.r; R++) {
      const rowCells: string[] = [];
      const isHeaderRow = R === headerRowIndex;
      for (let C = range.s.c; C <= range.e.c; C++) {
        const addr = XLSX.utils.encode_cell({ r: R, c: C });
        const cell = sheet[addr];
        if (!cell) {
          rowCells.push('');
          continue;
        }
        // 수식(`f`)이 있으면 결과(`v`)는 표시용 — 수식 자체는 마스킹하지 않음 (formula는 PII 가능성 낮음).
        if (cell.t === 's' && typeof cell.v === 'string' && cell.v.length > 0) {
          // macOS Finder가 한글 파일명을 NFD(자모 분해)로 저장 → 정규식 [가-힣]가 매치 못 함.
          // 파싱 시 NFC로 정규화. 의미 동일, OS 표시 무관.
          const text = cell.v.normalize('NFC');
          const seg: Segment = { id: cellId(name, addr), text };
          if (isHeaderRow) {
            seg.isHeader = true;
          } else if (categoryByCol?.has(C - range.s.c)) {
            seg.forcedCategory = categoryByCol.get(C - range.s.c);
          }
          segments.push(seg);
          rowCells.push(text);
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

function bookTypeForName(name: string): 'xls' | 'xlsx' | 'xlsm' | 'xlsb' | 'csv' | 'ods' {
  const lower = name.toLowerCase();
  if (lower.endsWith('.xlsx')) return 'xlsx';
  if (lower.endsWith('.xlsm')) return 'xlsm';
  if (lower.endsWith('.xlsb')) return 'xlsb';
  if (lower.endsWith('.xls')) return 'xls';
  if (lower.endsWith('.ods')) return 'ods';
  return 'xlsx';
}

const MIME_FOR_BOOKTYPE: Record<string, string> = {
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  xlsm: 'application/vnd.ms-excel.sheet.macroEnabled.12',
  xlsb: 'application/vnd.ms-excel.sheet.binary.macroEnabled.12',
  xls: 'application/vnd.ms-excel',
  ods: 'application/vnd.oasis.opendocument.spreadsheet',
};

export async function exportXlsx(originalFile: File, masked: ExportInput): Promise<Blob> {
  const buf = await originalFile.arrayBuffer();
  // cellStyles + bookFiles + bookVBA + cellNF: 가능한 한 원본 서식·수식·매크로·번호 형식 보존.
  const wb = XLSX.read(buf, {
    type: 'array',
    cellStyles: true,
    cellNF: true,
    bookFiles: true,
    bookVBA: true,
  });
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
          // 표시 캐시 갱신 — 스타일/포맷 자체는 cell.s에 보존되므로 건드리지 않음.
          if ('w' in cell) cell.w = replacement;
        }
      }
    }
  }
  // 원본 확장자를 그대로 유지 — .xls 입력은 .xls(BIFF8) 출력.
  const bookType = bookTypeForName(originalFile.name);
  const out = XLSX.write(wb, { type: 'array', bookType, cellStyles: true });
  return new Blob([out as BlobPart], {
    type: MIME_FOR_BOOKTYPE[bookType] ?? MIME_FOR_BOOKTYPE.xlsx!,
  });
}
