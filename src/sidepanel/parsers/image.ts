// 이미지 OCR — Tesseract.js로 한국어+영어 텍스트 추출.
//
// 출력은 .txt fallback (이미지 자체 마스킹은 v1에서 미지원). HWP와 동일 패턴:
// use-file-queue.ts의 shouldFallbackToTxt가 .png/.jpg/.jpeg를 .txt로 확장자 변환.
//
// Self-host (MV3 strict CSP 대응):
//   scripts/setup-tesseract.mjs가 worker.min.js + tesseract-core*.wasm/js +
//   kor/eng.traineddata를 public/tesseract/로 복사·다운로드. vite build 시
//   dist/tesseract/로 자동 포함되며 chrome.runtime.getURL로 접근.

import type { ExportInput, ParseResult } from './types';

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
