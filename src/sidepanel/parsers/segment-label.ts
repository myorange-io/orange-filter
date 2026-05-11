// segment id → 사람이 읽을 수 있는 위치 라벨.
// 각 parser의 id 명명 규약을 한 곳에 캡슐화. 검토 UI에서 그룹 헤더로 사용.

/**
 * @param segmentId  parseFile이 부여한 id (parser별 형식 다름)
 * @param sourceExt  파일 확장자 (.xlsx, .pdf 등). 모호한 id 분기에 사용.
 * @returns          예: "Sheet1!A2", "5페이지", "본문", "OCR 텍스트", "이미지 메타: Artist"
 */
export function formatSegmentLabel(segmentId: string, sourceExt: string): string {
  // 메타데이터 prefix는 모든 포맷 공통 패턴 — 먼저 처리.
  if (segmentId.startsWith('xlsxprops::')) {
    return `워크북 속성: ${segmentId.slice('xlsxprops::'.length)}`;
  }
  if (segmentId.startsWith('xlsxcustprops::')) {
    return `워크북 사용자 속성: ${segmentId.slice('xlsxcustprops::'.length)}`;
  }
  if (segmentId.startsWith('xlsxcomment::')) {
    // xlsxcomment::Sheet1!A2#0::t — 셀 + 코멘트 인덱스 + t/a
    const rest = segmentId.slice('xlsxcomment::'.length);
    const m = /^(.+?)#\d+::(t|a)$/.exec(rest);
    if (m) {
      return `${m[1]} 코멘트 ${m[2] === 't' ? '본문' : '작성자'}`;
    }
    return `셀 코멘트: ${rest}`;
  }
  if (segmentId.startsWith('pdfmeta::')) {
    return `PDF 속성: ${segmentId.slice('pdfmeta::'.length)}`;
  }
  if (segmentId.startsWith('exif::')) {
    return `이미지 메타: ${segmentId.slice('exif::'.length)}`;
  }
  if (segmentId.startsWith('docprops::') || segmentId.startsWith('customprops::')) {
    // pptx/docx OOXML 메타 (parseOoxmlDocProps가 부여하는 prefix 추정)
    const idx = segmentId.indexOf('::');
    return `문서 속성: ${segmentId.slice(idx + 2)}`;
  }

  // PDF 본문: p1, p2, ...
  if (sourceExt === '.pdf' && /^p\d+$/.test(segmentId)) {
    return `${segmentId.slice(1)}페이지`;
  }

  // CSV: r{row}c{col}
  if (sourceExt === '.csv') {
    const m = /^r(\d+)c(\d+)$/.exec(segmentId);
    if (m) {
      const row = Number(m[1]) + 1; // 0-based → 1-based
      const col = colIndexToLetter(Number(m[2]));
      return `${row}행 ${col}열`;
    }
  }

  // XLSX/XLS: Sheet1!A2 형식 그대로 노출.
  if ((sourceExt === '.xlsx' || sourceExt === '.xls' || sourceExt === '.xlsm') && segmentId.includes('!')) {
    return segmentId;
  }

  // PPTX: ppt/slides/slide3.xml#5 → "슬라이드 3 (5번째 텍스트)"
  if (sourceExt === '.pptx') {
    const slide = /ppt\/slides\/slide(\d+)\.xml#(\d+)/.exec(segmentId);
    if (slide) return `슬라이드 ${slide[1]} (${Number(slide[2]) + 1}번째 텍스트)`;
    const notes = /ppt\/notesSlides\/notesSlide(\d+)\.xml#(\d+)/.exec(segmentId);
    if (notes) return `슬라이드 ${notes[1]} 발표자 노트`;
  }

  // DOCX: t12 (단순 텍스트 노드 인덱스)
  if (sourceExt === '.docx' && /^t\d+$/.test(segmentId)) {
    return `본문 ${Number(segmentId.slice(1)) + 1}번째 텍스트`;
  }

  // HWPX: Contents/section0.xml#5
  if (sourceExt === '.hwpx') {
    const sec = /Contents\/section(\d+)\.xml#(\d+)/.exec(segmentId);
    if (sec) return `섹션 ${Number(sec[1]) + 1} (${Number(sec[2]) + 1}번째 텍스트)`;
    if (segmentId.startsWith('Preview/PrvText.txt')) return '미리보기 텍스트';
  }

  // HWP: s0p0-c1r2c3i0 같은 재귀 id — 사람에게 의미 없음. "본문"으로 통합.
  if (sourceExt === '.hwp' && /^s\d+p\d+/.test(segmentId)) {
    return '본문';
  }

  // 이미지 OCR
  if (segmentId === 'ocr') return 'OCR 텍스트';

  // TXT 단일 segment
  if (segmentId === 'doc') return '문서 본문';

  // 미상 — id 그대로 노출
  return segmentId;
}

function colIndexToLetter(col: number): string {
  let n = col;
  let s = '';
  do {
    s = String.fromCharCode(65 + (n % 26)) + s;
    n = Math.floor(n / 26) - 1;
  } while (n >= 0);
  return s;
}
