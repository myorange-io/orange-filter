// 이미지 EXIF/XMP/IPTC 메타데이터 마스킹 단위 테스트.
//
// parseImage 자체는 Tesseract.js worker가 vitest 'node' 환경에서 동작하지 않아
// 단위 테스트하지 않는다. 대신 EXIF→Segment 변환(`exifMetaToSegments`)과
// `exportImage`의 마스킹된 메타데이터 footer 작성을 순수 함수 단위로 검증.
// EXIF 회귀는 e2e 또는 sample 픽스처에서 다룬다.

import { describe, expect, test } from 'vitest';
import { exifId, exifMetaToSegments, exportImage } from './image';

describe('exifMetaToSegments', () => {
  test('알려진 텍스트 키만 segment로 노출 (Make/Model/Software 등 카메라 자동 기입은 제외)', () => {
    const segments = exifMetaToSegments({
      Artist: '홍길동',
      Copyright: '© 2024 홍길동',
      ImageDescription: '가족 사진 — 010-1234-5678',
      UserComment: '메모: kim@example.com',
      Make: 'Apple',          // 제외
      Model: 'iPhone 15',     // 제외
      Software: 'iOS 17.4',   // 제외
      ExposureTime: 0.001,    // 비-string 제외
    });
    const ids = segments.map((s) => s.id).sort();
    expect(ids).toEqual([
      exifId('Artist'),
      exifId('Copyright'),
      exifId('ImageDescription'),
      exifId('UserComment'),
    ].sort());
    const byId = new Map(segments.map((s) => [s.id, s.text]));
    expect(byId.get(exifId('Artist'))).toBe('홍길동');
    expect(byId.get(exifId('ImageDescription'))).toBe('가족 사진 — 010-1234-5678');
  });

  test('XMP dc:* + IPTC by-line/caption/credit도 처리', () => {
    const segments = exifMetaToSegments({
      creator: '김철수',
      rights: 'NPO재단',
      description: 'XMP 설명',
      'by-line': '촬영자',
      caption: 'IPTC 캡션',
      credit: 'IPTC 크레딧',
    });
    const texts = segments.map((s) => s.text).sort();
    expect(texts).toContain('김철수');
    expect(texts).toContain('NPO재단');
    expect(texts).toContain('XMP 설명');
    expect(texts).toContain('IPTC 캡션');
  });

  test('빈 문자열·공백·null·undefined·non-string은 제외', () => {
    const segments = exifMetaToSegments({
      Artist: '',
      Copyright: '   ',
      ImageDescription: '실제값',
      UserComment: null as unknown as string,
      creator: undefined as unknown as string,
      rights: 42 as unknown as string,
    });
    expect(segments).toHaveLength(1);
    expect(segments[0]!.text).toBe('실제값');
    expect(segments[0]!.id).toBe(exifId('ImageDescription'));
  });

  test('NFC 정규화 — Tesseract/macOS NFD 자모 분해 → 정규식 [가-힣] 매치 가능 형태', () => {
    // NFD: 'ㅎ' + 'ㅗ' + 'ㅇ' (3 codepoints) — String.normalize('NFD')로 강제.
    const nfd = '홍길동'.normalize('NFD');
    expect(nfd).not.toBe('홍길동'); // pre-condition: NFD가 NFC와 다름
    const segments = exifMetaToSegments({ Artist: nfd });
    expect(segments).toHaveLength(1);
    expect(segments[0]!.text).toBe('홍길동'); // NFC로 변환됨
  });

  test('null/undefined meta는 빈 배열', () => {
    expect(exifMetaToSegments(null)).toEqual([]);
    expect(exifMetaToSegments(undefined)).toEqual([]);
    expect(exifMetaToSegments({})).toEqual([]);
  });
});

describe('exportImage — EXIF footer', () => {
  test('마스킹된 EXIF가 있으면 footer 섹션에 추가', async () => {
    const masked = new Map<string, string>();
    masked.set('ocr', '본문 텍스트');
    masked.set(exifId('Artist'), '[NAME]');
    masked.set(exifId('Copyright'), '© 2024 [NAME]');
    masked.set(exifId('ImageDescription'), '가족 사진 — 010-1234-XXXX');

    const blob = await exportImage(new File([], 'photo.jpg'), masked);
    const out = await blob.text();
    expect(out).toContain('본문 텍스트');
    expect(out).toContain('[이미지 메타데이터]');
    expect(out).toContain('- Artist: [NAME]');
    expect(out).toContain('- Copyright: © 2024 [NAME]');
    expect(out).toContain('- ImageDescription: 가족 사진 — 010-1234-XXXX');
  });

  test('EXIF segment가 없으면 footer 자체를 생략 (기존 동작 보존)', async () => {
    const masked = new Map<string, string>([['ocr', '본문만']]);
    const blob = await exportImage(new File([], 'photo.jpg'), masked);
    const out = await blob.text();
    expect(out).toBe('본문만');
    expect(out).not.toContain('---');
    expect(out).not.toContain('[이미지 메타데이터]');
  });

  test('OCR 본문이 없고 EXIF만 마스킹된 경우에도 footer 출력', async () => {
    const masked = new Map<string, string>([
      ['ocr', ''],
      [exifId('Artist'), '[NAME]'],
    ]);
    const blob = await exportImage(new File([], 'photo.jpg'), masked);
    const out = await blob.text();
    expect(out).toContain('[이미지 메타데이터]');
    expect(out).toContain('- Artist: [NAME]');
  });

  test('빈 마스킹 값은 footer에서 제외 (마스킹 안 된 EXIF는 footer에 안 보임)', async () => {
    const masked = new Map<string, string>([
      ['ocr', '본문'],
      [exifId('Artist'), '[NAME]'],
      [exifId('Copyright'), ''], // 빈 값 — footer에서 제외
    ]);
    const blob = await exportImage(new File([], 'photo.jpg'), masked);
    const out = await blob.text();
    expect(out).toContain('- Artist: [NAME]');
    expect(out).not.toContain('- Copyright:');
  });
});
