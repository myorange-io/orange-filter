import { describe, expect, it } from 'vitest';
import { formatSegmentLabel } from './segment-label';

describe('formatSegmentLabel', () => {
  it('XLSX 셀 id는 그대로 노출', () => {
    expect(formatSegmentLabel('Sheet1!A2', '.xlsx')).toBe('Sheet1!A2');
    expect(formatSegmentLabel('전체!B10', '.xls')).toBe('전체!B10');
  });

  it('XLSX 메타데이터 prefix → 한국어 라벨', () => {
    expect(formatSegmentLabel('xlsxprops::Author', '.xlsx')).toBe('워크북 속성: Author');
    expect(formatSegmentLabel('xlsxcustprops::FOO', '.xlsx')).toBe(
      '워크북 사용자 속성: FOO',
    );
  });

  it('XLSX 셀 코멘트 → 셀 + 본문/작성자', () => {
    expect(formatSegmentLabel('xlsxcomment::Sheet1!A2#0::t', '.xlsx')).toBe(
      'Sheet1!A2 코멘트 본문',
    );
    expect(formatSegmentLabel('xlsxcomment::Sheet1!B3#1::a', '.xlsx')).toBe(
      'Sheet1!B3 코멘트 작성자',
    );
  });

  it('PDF 페이지 id', () => {
    expect(formatSegmentLabel('p1', '.pdf')).toBe('1페이지');
    expect(formatSegmentLabel('p42', '.pdf')).toBe('42페이지');
  });

  it('PDF 메타데이터 prefix', () => {
    expect(formatSegmentLabel('pdfmeta::Author', '.pdf')).toBe('PDF 속성: Author');
  });

  it('CSV row/col id → 1-based 라벨', () => {
    expect(formatSegmentLabel('r0c0', '.csv')).toBe('1행 A열');
    expect(formatSegmentLabel('r4c2', '.csv')).toBe('5행 C열');
    expect(formatSegmentLabel('r0c26', '.csv')).toBe('1행 AA열');
  });

  it('PPTX 슬라이드/노트', () => {
    expect(formatSegmentLabel('ppt/slides/slide3.xml#5', '.pptx')).toBe(
      '슬라이드 3 (6번째 텍스트)',
    );
    expect(formatSegmentLabel('ppt/notesSlides/notesSlide3.xml#0', '.pptx')).toBe(
      '슬라이드 3 발표자 노트',
    );
  });

  it('DOCX 본문 인덱스', () => {
    expect(formatSegmentLabel('t12', '.docx')).toBe('본문 13번째 텍스트');
  });

  it('HWPX 섹션 + 미리보기', () => {
    expect(formatSegmentLabel('Contents/section0.xml#5', '.hwpx')).toBe(
      '섹션 1 (6번째 텍스트)',
    );
    expect(formatSegmentLabel('Preview/PrvText.txt#0', '.hwpx')).toBe(
      '미리보기 텍스트',
    );
  });

  it('HWP 재귀 id는 "본문"으로 통합', () => {
    expect(formatSegmentLabel('s0p1-c0r0c0i0', '.hwp')).toBe('본문');
  });

  it('이미지 OCR/EXIF', () => {
    expect(formatSegmentLabel('ocr', '.png')).toBe('OCR 텍스트');
    expect(formatSegmentLabel('exif::Artist', '.jpg')).toBe('이미지 메타: Artist');
  });

  it('TXT 단일 segment', () => {
    expect(formatSegmentLabel('doc', '.txt')).toBe('문서 본문');
  });

  it('미상 id는 그대로 반환 (degrade gracefully)', () => {
    expect(formatSegmentLabel('unknown::weird::id', '.foo')).toBe('unknown::weird::id');
  });
});
