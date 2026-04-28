// PDF 파서/익스포터.
// v1 한계: 텍스트 추출은 page 단위 (pdfjs-dist). 마스킹된 결과는 layout 보존이 어려워
// **새로운 단순 PDF**(pdf-lib + Pretendard 폰트)로 출력 — 원본 서식은 손실됨.
// v2 후보: pdf-lib로 원본 PDF에 텍스트 위에 흰색 블록 + 마스킹 텍스트 overlay.
import * as pdfjsLib from 'pdfjs-dist';
import { PDFDocument, StandardFonts } from 'pdf-lib';
import pdfjsWorkerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import type { ExportInput, ParseResult, Segment } from './types';

// pdfjs는 worker 필요 — vite의 ?url로 chunk URL을 받아 GlobalWorkerOptions에 주입.
pdfjsLib.GlobalWorkerOptions.workerSrc = pdfjsWorkerUrl;

function pageId(idx: number): string {
  return `p${idx}`;
}

export async function parsePdf(file: File): Promise<ParseResult> {
  const buf = await file.arrayBuffer();
  const doc = await pdfjsLib.getDocument({ data: buf }).promise;
  const segments: Segment[] = [];
  const pageTexts: string[] = [];
  for (let i = 1; i <= doc.numPages; i++) {
    const page = await doc.getPage(i);
    const content = await page.getTextContent();
    type TextItem = { str: string };
    // pdfjs가 종종 한글을 NFD(자모 분해)로 추출 → 정규식 [가-힣] 미스. NFC 정규화.
    const text = (content.items as TextItem[]).map((it) => it.str).join(' ').normalize('NFC');
    if (text.length > 0) {
      segments.push({ id: pageId(i), text });
      pageTexts.push(text);
    }
  }
  return { segments, combinedText: pageTexts.join('\n\n') };
}

export async function exportPdf(originalFile: File, masked: ExportInput): Promise<Blob> {
  // v1: 마스킹된 텍스트로 새 PDF 생성. 원본 layout 손실 — 사용자에게 한 번 경고 표시 권장 (S14에서 UI).
  // 한국어 텍스트는 PDF 내장 한글 글꼴이 없어 깨질 수 있음 → embed Pretendard 필요.
  // v1에선 영문 fallback (Helvetica) — 한글 마스킹이 깨지면 사용자에게 보임 (S15에서 폰트 embed).
  const newDoc = await PDFDocument.create();
  const font = await newDoc.embedFont(StandardFonts.Helvetica);
  // 원본 페이지 수만큼 빈 페이지 생성
  const originalDoc = await PDFDocument.load(await originalFile.arrayBuffer());
  const pageCount = originalDoc.getPageCount();
  for (let i = 1; i <= pageCount; i++) {
    const page = newDoc.addPage([595, 842]); // A4
    const text = masked.get(pageId(i));
    if (!text) continue;
    page.drawText(text, {
      x: 50,
      y: 800,
      size: 9,
      font,
      maxWidth: 495,
      lineHeight: 12,
    });
  }
  const bytes = await newDoc.save();
  return new Blob([bytes as BlobPart], { type: 'application/pdf' });
}
