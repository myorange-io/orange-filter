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

// PDF 정보 dictionary에서 추출할 텍스트 키 — 작성자·제목·키워드 등 흔한 PII 누출 채널.
// CreationDate/ModDate 같은 timestamp는 형식이라 제외.
const PDF_META_KEYS = ['Title', 'Author', 'Subject', 'Keywords', 'Creator', 'Producer'] as const;

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
  // PDF 정보 dictionary(Author/Title/Subject/Keywords)도 마스킹 대상.
  // 본문(page text)을 가렸어도 메타데이터에 PII가 남으면 PDF reader가 "Properties" 탭에 노출.
  try {
    const meta = await doc.getMetadata();
    const info = meta?.info as Record<string, unknown> | undefined;
    if (info) {
      for (const key of PDF_META_KEYS) {
        const val = info[key];
        if (typeof val === 'string' && val.length > 0) {
          segments.push({ id: `pdfmeta::${key}`, text: val.normalize('NFC') });
        }
      }
    }
  } catch {
    /* PDF에 metadata 없으면 무시 */
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
  // PDF 정보 dictionary 마스킹 적용 — parsePdf와 대칭. parsePdf가 등록하지 않은 키는
  // mask-segments도 통과시키지 않으므로 새 doc에 추가 안 됨 (안전 기본값).
  const title = masked.get('pdfmeta::Title');
  if (title !== undefined) newDoc.setTitle(title);
  const author = masked.get('pdfmeta::Author');
  if (author !== undefined) newDoc.setAuthor(author);
  const subject = masked.get('pdfmeta::Subject');
  if (subject !== undefined) newDoc.setSubject(subject);
  const keywords = masked.get('pdfmeta::Keywords');
  if (keywords !== undefined) {
    // PDF Keywords는 string array — 공백/쉼표로 분리.
    newDoc.setKeywords(keywords.split(/[,\s]+/).filter((k) => k.length > 0));
  }
  const creator = masked.get('pdfmeta::Creator');
  if (creator !== undefined) newDoc.setCreator(creator);
  const producer = masked.get('pdfmeta::Producer');
  if (producer !== undefined) newDoc.setProducer(producer);
  const bytes = await newDoc.save();
  return new Blob([bytes as BlobPart], { type: 'application/pdf' });
}
