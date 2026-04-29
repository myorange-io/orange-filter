// 이미지 OCR — Tesseract.js로 한국어+영어 텍스트 추출 + EXIF 텍스트 메타데이터.
//
// 출력은 .txt fallback (이미지 자체 마스킹은 v1에서 미지원). HWP와 동일 패턴:
// use-file-queue.ts의 shouldFallbackToTxt가 .png/.jpg/.jpeg를 .txt로 확장자 변환.
//
// EXIF/XMP/IPTC 텍스트 채널: 본문 OCR을 가렸어도 EXIF Artist·ImageDescription·
// UserComment·Copyright(또는 XMP dc:creator·dc:rights·dc:description)에 작성자
// 이름·연락처가 남으면 OOXML docProps와 동일한 누출 채널이 된다. 이를 segment로
// 노출해 동일 마스킹 파이프라인을 통과시키고, 출력 .txt 끝에 마스킹된 메타데이터를
// 별도 섹션으로 추가해 사용자가 원본 이미지 공유 전 알 수 있게 한다.
// GPS 좌표(위치 PII)는 v1.3 범위 밖 — 별도 카테고리 슬라이스에서 다룬다.
//
// Self-host (MV3 strict CSP 대응):
//   scripts/setup-tesseract.mjs가 worker.min.js + tesseract-core*.wasm/js +
//   kor/eng.traineddata를 public/tesseract/로 복사·다운로드. vite build 시
//   dist/tesseract/로 자동 포함되며 chrome.runtime.getURL로 접근.

import type { ExportInput, ParseResult, Segment } from './types';

let cachedWorker: unknown = null;
let cachedLang: string | null = null;

const DEFAULT_LANG = 'kor+eng';

/**
 * 자체 호스팅된 tesseract 자원의 base URL.
 * - 확장 환경: chrome-extension://EXT_ID/tesseract/
 * - vite dev: /tesseract/ (public 폴더 자동 서빙)
 */
function tesseractBaseUrl(): string {
  if (typeof chrome !== 'undefined' && chrome.runtime?.getURL) {
    return chrome.runtime.getURL('tesseract/');
  }
  return '/tesseract/';
}

async function getWorker(lang: string = DEFAULT_LANG): Promise<{
  recognize: (img: Blob | File) => Promise<{ data: { text: string } }>;
}> {
  if (cachedWorker && cachedLang === lang) {
    return cachedWorker as never;
  }
  const Tesseract = await import('tesseract.js');
  const base = tesseractBaseUrl();
  const worker = await Tesseract.createWorker(lang, 1, {
    workerPath: `${base}worker.min.js`,
    corePath: base, // 디렉터리 — Tesseract가 SIMD/LSTM 변종을 자동 선택
    langPath: base, // {lang}.traineddata 파일 동일 디렉터리
    cacheMethod: 'write', // IndexedDB에 lang 캐시 (재실행 시 fetch 생략)
    logger: (m) => {
      if (m.status === 'recognizing text' || m.status === 'loading language traineddata') {
        console.debug('[npo-privacy ocr]', m.status, Math.round((m.progress ?? 0) * 100) + '%');
      }
    },
  });
  cachedWorker = worker;
  cachedLang = lang;
  return worker as never;
}

// EXIF/XMP/IPTC에서 추출할 텍스트 키 — 작성자·설명·코멘트·저작권자 등 흔한
// PII 누출 채널. Make/Model/Software/렌즈/날짜·노출 등 카메라 자동 기입은 제외
// (PII 가능성 낮고 false positive 다수). XMP는 exifr이 dc:creator → 'creator'로
// flatten하여 반환.
//
// id 규약: `exif::<key>` — segment id에 등장하므로 이 목록은 안정적이어야 한다
// (mask-segments → exportImage 양쪽이 같은 키 셋을 본다).
const EXIF_TEXT_KEYS = [
  'Artist',           // EXIF: 촬영자
  'Copyright',        // EXIF: 저작권자 (이름)
  'ImageDescription', // EXIF: 이미지 설명
  'UserComment',      // EXIF: 사용자 코멘트
  'creator',          // XMP dc:creator → exifr이 flatten
  'rights',           // XMP dc:rights
  'description',      // XMP dc:description
  'by-line',          // IPTC by-line (촬영자)
  'caption',          // IPTC caption-abstract
  'credit',           // IPTC credit
] as const;

export function exifId(key: string): string {
  return `exif::${key}`;
}

/**
 * EXIF/XMP/IPTC 메타 객체에서 텍스트 segment 배열 생성. exifr.parse 결과를 받지만
 * 순수 함수라 단위 테스트에서 fake meta로 직접 검증 가능.
 */
export function exifMetaToSegments(meta: Record<string, unknown> | null | undefined): Segment[] {
  if (!meta) return [];
  const out: Segment[] = [];
  for (const key of EXIF_TEXT_KEYS) {
    const val = meta[key];
    if (typeof val !== 'string') continue;
    const text = val.normalize('NFC').trim();
    if (text.length === 0) continue;
    out.push({ id: exifId(key), text });
  }
  return out;
}

interface ExifrLib {
  parse: (input: Blob | File | ArrayBuffer, options?: unknown) => Promise<Record<string, unknown> | null>;
}

let cachedExifr: ExifrLib | null = null;

async function getExifr(): Promise<ExifrLib> {
  if (cachedExifr) return cachedExifr;
  const mod = (await import('exifr')) as unknown as { default?: ExifrLib } & ExifrLib;
  cachedExifr = (mod.default ?? mod) as ExifrLib;
  return cachedExifr;
}

/**
 * 이미지에서 EXIF/XMP/IPTC 텍스트 메타데이터를 segment로 추출.
 * exifr이 메타 미존재 시 null 반환 → 빈 배열.
 */
async function parseImageExif(file: File): Promise<Segment[]> {
  try {
    const exifr = await getExifr();
    // exifr 옵션: ifd0(EXIF Artist/Copyright/ImageDescription) + exif(UserComment) +
    // xmp(dc:creator/rights/description) + iptc(by-line/caption/credit). gps/icc/등은 비활성.
    const meta = await exifr.parse(file, {
      ifd0: true,
      exif: true,
      xmp: true,
      iptc: true,
      gps: false,
      icc: false,
      jfif: false,
      ihdr: false,
      mergeOutput: true,
      sanitize: true,
      reviveValues: false,
    });
    return exifMetaToSegments(meta);
  } catch {
    // 손상된 EXIF / 비표준 chunk는 무시 — OCR은 그대로 반환.
    return [];
  }
}

/**
 * 이미지 → OCR 텍스트 + EXIF 텍스트 메타데이터.
 *   segments[0]: OCR 텍스트 ('ocr')
 *   segments[1..]: EXIF/XMP/IPTC 텍스트 필드 ('exif::Artist' 등)
 */
export async function parseImage(file: File): Promise<ParseResult> {
  const worker = await getWorker();
  const [result, exifSegments] = await Promise.all([
    worker.recognize(file),
    parseImageExif(file),
  ]);
  // Tesseract 한국어 결과가 종종 NFD(자모 분해)로 추출 → 정규식 [가-힣] 미스. NFC 정규화.
  const text = (result.data.text ?? '').normalize('NFC');
  const segments: Segment[] = [{ id: 'ocr', text }, ...exifSegments];
  return { segments, combinedText: text };
}

/**
 * 마스킹된 OCR 텍스트 + EXIF 메타데이터를 .txt Blob으로 반환.
 * use-file-queue가 확장자를 .txt로 자동 변환하여 다운로드.
 *
 * 형식:
 *   <OCR 본문 (마스킹됨)>
 *
 *   ---
 *   [이미지 메타데이터] 원본 이미지를 공유하기 전 EXIF를 제거하세요.
 *   - Artist: [NAME]
 *   - ImageDescription: ...
 *
 * 메타 segment가 없으면 footer 자체를 생략 (불필요한 안내 노이즈 방지).
 */
export async function exportImage(
  _originalFile: File,
  masked: ExportInput,
): Promise<Blob> {
  const ocrText = masked.get('ocr') ?? '';
  const metaLines: string[] = [];
  for (const key of EXIF_TEXT_KEYS) {
    const v = masked.get(exifId(key));
    if (v !== undefined && v.length > 0) {
      metaLines.push(`- ${key}: ${v}`);
    }
  }
  if (metaLines.length === 0) {
    return new Blob([ocrText], { type: 'text/plain;charset=utf-8' });
  }
  const footer = [
    '',
    '---',
    '[이미지 메타데이터] 원본 이미지를 공유하기 전 EXIF를 제거하세요.',
    ...metaLines,
    '',
  ].join('\n');
  return new Blob([ocrText + footer], { type: 'text/plain;charset=utf-8' });
}
