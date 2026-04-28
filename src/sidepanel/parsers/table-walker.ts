// XML 기반 포맷(docx/pptx/hwpx)에서 표 구조를 식별하기 위한 단순 walker.
// nested table은 NPO 양식에서 거의 없어 첫 레벨만 처리. 복잡한 nested table은 무시한다.
//
// 입력: XML 문자열, namespace prefix(`w` for docx, `a` for pptx, `hp` for hwpx).
// 출력: 각 표의 cell들이 포함하는 텍스트 노드(<x:t>) 인덱스 → 표/행/셀 좌표 매핑.

export interface TableLocation {
  tableIdx: number;
  rowIdx: number;
  cellIdx: number;
}

export interface TableCell {
  /** 셀에 포함된 모든 텍스트 노드의 결합 텍스트 (헤더 매칭용) */
  text: string;
  /** 셀에 포함된 텍스트 노드들이 전체 nodeList의 몇 번째인지 */
  nodeIndices: number[];
}

export interface TableRow {
  cells: TableCell[];
}

export interface ParsedTable {
  tableIdx: number;
  rows: TableRow[];
}

/**
 * `<{ns}:tbl>`...`</{ns}:tbl>` 영역을 찾아 행/셀로 분해한다.
 * 텍스트 노드는 `<{textNs}:t>...</{textNs}:t>` 패턴으로 추출.
 *
 * 예: docx에서 ns='w', textNs='w'. pptx는 ns='a', textNs='a'. hwpx는 ns='hp', textNs='hp'.
 */
export function parseTables(
  xml: string,
  ns: string,
  textNs: string,
): ParsedTable[] {
  const tableOpen = new RegExp(`<${ns}:tbl(?:\\s[^>]*)?>`, 'g');
  const tableClose = `</${ns}:tbl>`;
  const tables: ParsedTable[] = [];
  let tableIdx = 0;

  let nodeIdx = 0;
  // 모든 <textNs:t> 위치를 미리 인덱싱해 nodeIdx 매핑.
  const textNodeRe = new RegExp(`<${textNs}:t(?:\\s[^>]*)?>([^<]*)</${textNs}:t>`, 'g');
  const textNodes: { start: number; end: number; text: string }[] = [];
  let m: RegExpExecArray | null;
  while ((m = textNodeRe.exec(xml)) !== null) {
    textNodes.push({ start: m.index, end: m.index + m[0].length, text: m[1] ?? '' });
  }

  // 헬퍼: 주어진 [start, end] 범위 안의 텍스트 노드 인덱스들 반환.
  function nodeIdxInRange(start: number, end: number): number[] {
    const out: number[] = [];
    for (let i = 0; i < textNodes.length; i++) {
      const n = textNodes[i]!;
      if (n.start >= start && n.end <= end) out.push(i);
    }
    return out;
  }

  // 표 매칭. nested table이 있다면 outer만 일단 처리.
  tableOpen.lastIndex = 0;
  while ((m = tableOpen.exec(xml)) !== null) {
    const tStart = m.index;
    const tCloseIdx = xml.indexOf(tableClose, tStart);
    if (tCloseIdx < 0) break;
    const tEnd = tCloseIdx + tableClose.length;

    // 행 분할: <{ns}:tr>...</{ns}:tr>
    const rowOpen = new RegExp(`<${ns}:tr(?:\\s[^>]*)?>`, 'g');
    const rowClose = `</${ns}:tr>`;
    const rows: TableRow[] = [];

    rowOpen.lastIndex = tStart;
    let r: RegExpExecArray | null;
    while ((r = rowOpen.exec(xml)) !== null) {
      const rStart = r.index;
      if (rStart >= tEnd) break;
      const rCloseIdx = xml.indexOf(rowClose, rStart);
      if (rCloseIdx < 0 || rCloseIdx >= tEnd) break;
      const rEnd = rCloseIdx + rowClose.length;

      // 셀 분할: <{ns}:tc>...</{ns}:tc>
      const cellOpen = new RegExp(`<${ns}:tc(?:\\s[^>]*)?>`, 'g');
      const cellClose = `</${ns}:tc>`;
      const cells: TableCell[] = [];
      cellOpen.lastIndex = rStart;
      let c: RegExpExecArray | null;
      while ((c = cellOpen.exec(xml)) !== null) {
        const cStart = c.index;
        if (cStart >= rEnd) break;
        const cCloseIdx = xml.indexOf(cellClose, cStart);
        if (cCloseIdx < 0 || cCloseIdx >= rEnd) break;
        const cEnd = cCloseIdx + cellClose.length;
        const indices = nodeIdxInRange(cStart, cEnd);
        const cellText = indices.map((i) => textNodes[i]!.text).join('');
        cells.push({ text: cellText, nodeIndices: indices });
        cellOpen.lastIndex = cEnd;
      }
      rows.push({ cells });
      rowOpen.lastIndex = rEnd;
    }

    tables.push({ tableIdx, rows });
    tableIdx++;
    tableOpen.lastIndex = tEnd;
  }

  // nodeIdx는 unused — return은 텍스트 노드 위치 정보만 추가.
  void nodeIdx;
  return tables;
}

// =============================================================================
// 표 → 텍스트 노드별 메타 매핑
// =============================================================================

import { categoryForHeader, isNameHintHeader } from '@/background/pii/header-hints';
import type { PIICategory } from '@/shared/types';

export interface NodeMeta {
  isHeader?: boolean;
  forcedCategory?: PIICategory;
  nameHintOnly?: boolean;
}

/**
 * 파싱된 표들에서 각 텍스트 노드 인덱스 → meta 정보 매핑을 생성한다.
 * - 첫 row의 셀들 → isHeader=true (단, 사전 매칭이 있는 경우만; 매칭 없으면 헤더 아님)
 * - 데이터 row의 셀들 → 컬럼 헤더 카테고리에 따라 forcedCategory / nameHintOnly
 */
export function buildNodeMeta(tables: ParsedTable[]): Map<number, NodeMeta> {
  const meta = new Map<number, NodeMeta>();
  for (const tbl of tables) {
    if (tbl.rows.length < 2) continue;

    // 첫 row를 헤더 후보로 검사. 셀 텍스트 → 카테고리 또는 nameHint 매핑.
    const headerRow = tbl.rows[0]!;
    const categoryByCol = new Map<number, PIICategory>();
    const nameHintCols = new Set<number>();
    for (let c = 0; c < headerRow.cells.length; c++) {
      const cellText = headerRow.cells[c]!.text.normalize('NFC');
      const cat = categoryForHeader(cellText);
      if (cat) categoryByCol.set(c, cat);
      else if (isNameHintHeader(cellText)) nameHintCols.add(c);
    }
    if (categoryByCol.size === 0 && nameHintCols.size === 0) continue;

    // 첫 row의 텍스트 노드 → isHeader
    for (const cell of headerRow.cells) {
      for (const idx of cell.nodeIndices) {
        meta.set(idx, { ...meta.get(idx), isHeader: true });
      }
    }
    // 데이터 row의 텍스트 노드 → forcedCategory / nameHintOnly
    for (let r = 1; r < tbl.rows.length; r++) {
      const row = tbl.rows[r]!;
      for (let c = 0; c < row.cells.length; c++) {
        const cell = row.cells[c]!;
        const cat = categoryByCol.get(c);
        const hint = nameHintCols.has(c);
        if (!cat && !hint) continue;
        for (const idx of cell.nodeIndices) {
          const cur = meta.get(idx) ?? {};
          if (cat) meta.set(idx, { ...cur, forcedCategory: cat });
          else if (hint) meta.set(idx, { ...cur, nameHintOnly: true });
        }
      }
    }
  }
  return meta;
}
