// 이미지 OCR — Tesseract.js로 한국어+영어 텍스트 추출.
//
// 출력은 .txt fallback (이미지 자체 마스킹은 v1에서 미지원). HWP와 동일 패턴:
// use-file-queue.ts의 shouldFallbackToTxt가 .png/.jpg/.jpeg를 .txt로 확장자 변환.
//
// 자원 (Tesseract.js v5+ 기본):
//   - tesseract-core(.wasm + .js): ~3MB
//   - kor.traineddata: ~12MB
//   - eng.traineddata: ~2MB
//   첫 실행 시 자동 다운로드 + IndexedDB 캐시 (이후 오프라인).
//
// MV3 self-host (TODO v1.1): Chrome 확장 strict CSP가 외부 cdn 차단할 가능성이
// 있어 production 빌드에서는 public/tesseract/로 worker/wasm/lang 자체 호스팅 필요.
// 현재는 dev preview에서 동작 검증 우선.

import type { ExportInput, ParseResult } from './types';

let cachedWorker: unknown = null;
let cachedLang: string | null = null;

const DEFAULT_LANG = 'kor+eng';

async function getWorker(lang: string = DEFAULT_LANG): Promise<{
  recognize: (img: Blob | File) => Promise<{ data: { text: string } }>;
}> {
  if (cachedWorker && cachedLang === lang) {
    return cachedWorker as never;
  }
  const Tesseract = await import('tesseract.js');
  // createWorker는 v5+ 시그니처: (langs, oem, options).
  // logger는 진행률 콜백 — 현재는 console로만, S15+에서 use-file-queue progress와 통합.
  const worker = await Tesseract.createWorker(lang, 1, {
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

/**
 * 이미지 → OCR 텍스트 추출. segments 1개 ('ocr')에 전체 텍스트 반환.
 */
export async function parseImage(file: File): Promise<ParseResult> {
  const worker = await getWorker();
  const result = await worker.recognize(file);
  const text = result.data.text ?? '';
  return {
    segments: [{ id: 'ocr', text }],
    combinedText: text,
  };
}

/**
 * 마스킹된 OCR 텍스트를 .txt Blob으로 반환. originalFile (이미지)는 사용 안 함.
 * use-file-queue가 확장자를 .txt로 자동 변환하여 다운로드.
 */
export async function exportImage(
  _originalFile: File,
  masked: ExportInput,
): Promise<Blob> {
  const text = masked.get('ocr') ?? '';
  return new Blob([text], { type: 'text/plain;charset=utf-8' });
}
