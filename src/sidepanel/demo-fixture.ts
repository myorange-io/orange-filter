// 합성 결산공시 데모 — 사용자가 "예시 파일로 시험해보기" 클릭 시 즉석 생성.
// JSZip으로 minimal HWPX 구조를 만들고 가짜 PII가 든 본문을 채운다.
//
// 데모 의도:
//   - 마스킹되어야 할 PII (이름·휴대폰·RRN·계좌·이메일)가 가려지는 것을 즉시 확인.
//   - 마스킹되면 안 되는 조직명·일반어("한국사회적기업진흥원"·"선착순")가 그대로 남는 것을 확인.
//   - 본문(section0.xml) + Preview/PrvText.txt 모두 포함해 미리보기 누출 차단도 시연.

import JSZip from 'jszip';

const DEMO_LINES = [
  '공익법인 결산공시 — 합성 예시',
  '한국사회적기업진흥원 공고 제2026 - 합성호',
  '',
  '본 파일은 Orange Filter 동작 확인용 합성 데이터이며 실제 개인정보가 아닙니다.',
  '',
  '□ (대표자) 조성도, 주민등록번호 900101-1234568',
  '□ (연락처) 휴대폰 010-1234-5678, 이메일 contact@example.org',
  '□ (계좌) 신한 110-123-456789',
  '',
  '후원자 명단',
  '김철수  010-1111-2222',
  '이영희  010-3333-4444',
  '박민수  010-9876-5432',
  '',
  '* 선착순 모집 마감 (참고: "선착순"·"노트북"·"하반기" 같은 일반어와',
  '  "한국사회적기업진흥원"·"조달청" 같은 조직명은 가려지지 않습니다.)',
];

function escapeXml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

export async function makeDemoHwpx(): Promise<File> {
  const zip = new JSZip();
  zip.file('mimetype', 'application/hwp+zip');
  zip.file(
    'META-INF/container.xml',
    '<?xml version="1.0" encoding="UTF-8"?><container xmlns="urn:oasis:names:tc:opendocument:xmlns:container" version="1.0"><rootfiles><rootfile full-path="Contents/content.hpf" media-type="application/hwpml-package+xml"/></rootfiles></container>',
  );
  // 본문 section0 — 각 줄을 별도 paragraph로.
  const body = DEMO_LINES
    .map((t) => `<hp:p><hp:run><hp:t>${escapeXml(t)}</hp:t></hp:run></hp:p>`)
    .join('');
  zip.file(
    'Contents/section0.xml',
    `<?xml version="1.0" encoding="UTF-8"?><hp:sec xmlns:hp="http://www.hancom.co.kr/hwpml/2011/section">${body}</hp:sec>`,
  );
  // Preview/PrvText.txt — 본문과 동일한 평문. 미리보기 누출 시연 + 마스킹 검증.
  zip.file('Preview/PrvText.txt', DEMO_LINES.join('\n'));

  const buf = (await zip.generateAsync({ type: 'arraybuffer' })) as ArrayBuffer;
  return new File([buf], '예시_결산공시.hwpx', { type: 'application/hwp+zip' });
}
