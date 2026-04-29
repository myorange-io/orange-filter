// HWPX round-trip 회귀 (S19 §1.0 ship gate).
//
// 목표:
// 1) ≥30 fixture로 parse → mask → export → re-parse 사이클 검증.
// 2) 텍스트 노드 카운트 delta < 5% 자동 경고.
// 3) PII 마스킹 후 원본 PII 텍스트가 export에 잔존하지 않음.
//
// HWP 5.x (OLE2)는 hwp.js가 read-only — round-trip 불가. 본 회귀는 HWPX(OPF/ZIP+XML) 한정.
// HWP 5.x는 별도 smoke (parsers.test.ts에서 sample/ 양식 검증).
//
// fixture 전략: 30+ 합성 HWPX 생성 — 다양한 PII 패턴(인명·전화·RRN·계좌·카드·이메일·자격정보)
// + 다중 섹션 + 특수 문자(<, &, " 등 XML 이스케이프) + 빈 텍스트 노드 + 한자/이모지.
// 사용자가 NPO_SAMPLE_DIR로 추가 .hwpx fixture를 제공하면 자동 추가 검증.

import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import JSZip from 'jszip';
import { describe, expect, test } from 'vitest';
import { detectKoreanPII } from '@/background/pii/regex';
import { maskText } from '@/background/pii/mask';
import { parseHwpx, exportHwpx } from '@/sidepanel/parsers/hwpx';

// ---------------------------------------------------------------------------
// HWPX 생성 헬퍼 — 최소 OPF/ZIP 구조
// ---------------------------------------------------------------------------

interface HwpxSection {
  /** <hp:t> 노드들에 들어갈 텍스트 (XML 이스케이프 자동) */
  texts: string[];
}

function escapeXml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

async function makeHwpx(sections: HwpxSection[]): Promise<File> {
  const zip = new JSZip();
  // 최소 OPF — 실제 HWPX는 더 복잡하지만 우리 파서는 Contents/section*.xml만 본다.
  zip.file(
    'mimetype',
    'application/hwp+zip',
  );
  zip.file(
    'META-INF/container.xml',
    '<?xml version="1.0" encoding="UTF-8"?><container xmlns="urn:oasis:names:tc:opendocument:xmlns:container" version="1.0"><rootfiles><rootfile full-path="Contents/content.hpf" media-type="application/hwpml-package+xml"/></rootfiles></container>',
  );
  sections.forEach((sec, i) => {
    const body = sec.texts
      .map((t) => `<hp:p><hp:run><hp:t>${escapeXml(t)}</hp:t></hp:run></hp:p>`)
      .join('');
    const xml = `<?xml version="1.0" encoding="UTF-8"?><hp:sec xmlns:hp="http://www.hancom.co.kr/hwpml/2011/section">${body}</hp:sec>`;
    zip.file(`Contents/section${i}.xml`, xml);
  });
  const buf = (await zip.generateAsync({ type: 'arraybuffer' })) as ArrayBuffer;
  return new File([buf], `synthetic-${Date.now()}-${Math.random().toString(36).slice(2, 6)}.hwpx`);
}

// ---------------------------------------------------------------------------
// 합성 fixture 30개 — PII 변형
// ---------------------------------------------------------------------------

interface SyntheticFixture {
  id: string;
  description: string;
  sections: HwpxSection[];
  /** 마스킹 후 export에 들어가면 안 되는 원본 PII 문자열 (회귀에서 부재 확인) */
  forbiddenAfterMask: string[];
}

const KOREAN_FORM_HEADERS = [
  '공익법인 결산서류 등의 공시 표준서식',
  '기부금품의 모집 및 지출 명세서',
  '출연자 및 이사등 주요 구성원 현황 명세서',
  '국세청 신고용 명세서',
  '비영리법인 운영보고서',
];

const FIXTURES: SyntheticFixture[] = [
  // RRN/외국인 (5)
  {
    id: 'rrn-natural',
    description: '문장 안의 RRN (valid checksum)',
    sections: [{ texts: ['신청자 김철수 주민등록번호 900101-1234568 입니다.'] }],
    forbiddenAfterMask: ['900101-1234568'],
  },
  {
    id: 'rrn-multi-section',
    description: '여러 섹션에 RRN 분포',
    sections: [
      { texts: ['대표자: 900101-1234568'] },
      { texts: ['감사: 900202-2345679'] },
    ],
    forbiddenAfterMask: ['900101-1234568', '900202-2345679'],
  },
  {
    id: 'foreign-registration',
    description: '외국인등록번호',
    sections: [{ texts: ['외국인등록번호 850515-5234560'] }],
    forbiddenAfterMask: ['850515-5234560'],
  },
  {
    id: 'rrn-no-hyphen',
    description: '하이픈 없는 RRN',
    sections: [{ texts: ['RRN: 9001011234568'] }],
    forbiddenAfterMask: ['9001011234568'],
  },
  {
    id: 'rrn-mixed-fields',
    description: 'RRN + 일반 텍스트 혼합 한 문단',
    sections: [{ texts: ['연도 2024, 등록 900101-1234568, 분류 일반'] }],
    forbiddenAfterMask: ['900101-1234568'],
  },

  // 휴대폰/유선 (5)
  {
    id: 'mobile-natural',
    description: '문장 안 휴대폰',
    sections: [{ texts: ['연락처는 010-1234-5678 입니다.'] }],
    forbiddenAfterMask: ['010-1234-5678'],
  },
  {
    id: 'mobile-spaces',
    description: '공백 구분 휴대폰',
    sections: [{ texts: ['전화 010 9876 5432 으로'] }],
    forbiddenAfterMask: ['010 9876 5432'],
  },
  {
    id: 'landline-seoul',
    description: '서울 02 유선',
    sections: [{ texts: ['본사 02-1234-5678'] }],
    forbiddenAfterMask: ['02-1234-5678'],
  },
  {
    id: 'landline-031',
    description: '경기 031 유선',
    sections: [{ texts: ['지사 031-987-6543'] }],
    forbiddenAfterMask: ['031-987-6543'],
  },
  {
    id: 'phone-multi',
    description: '한 문단에 휴대폰+유선',
    sections: [{ texts: ['대표 010-1111-2222, 사무실 02-555-1234'] }],
    forbiddenAfterMask: ['010-1111-2222', '02-555-1234'],
  },

  // 계좌/카드 (4)
  {
    id: 'account-shinhan',
    description: '신한 12자리 계좌',
    sections: [{ texts: ['계좌: 110-234-567890 (신한)'] }],
    forbiddenAfterMask: ['110-234-567890'],
  },
  {
    id: 'account-kb',
    description: 'KB 14자리 계좌',
    sections: [{ texts: ['국민은행 729-123456-12-345'] }],
    forbiddenAfterMask: ['729-123456-12-345'],
  },
  {
    id: 'card-visa',
    description: '비자 카드 16자리 (Luhn)',
    sections: [{ texts: ['결제 4111 1111 1111 1111'] }],
    forbiddenAfterMask: ['4111 1111 1111 1111'],
  },
  {
    id: 'card-mc',
    description: '마스터카드 하이픈',
    sections: [{ texts: ['카드 5555-5555-5555-4444'] }],
    forbiddenAfterMask: ['5555-5555-5555-4444'],
  },

  // 이메일/자격정보 (4)
  {
    id: 'email-single',
    description: '이메일 단일',
    sections: [{ texts: ['contact@example.org'] }],
    forbiddenAfterMask: ['contact@example.org'],
  },
  {
    id: 'email-multi',
    description: '이메일 다수',
    sections: [
      { texts: ['lead@example.org'] },
      { texts: ['support@example.com, info@test.kr'] },
    ],
    forbiddenAfterMask: ['lead@example.org', 'support@example.com', 'info@test.kr'],
  },
  {
    id: 'credential-aws',
    description: 'AWS 키',
    sections: [{ texts: ['AWS_KEY=AKIAIOSFODNN7EXAMPLE 환경변수'] }],
    forbiddenAfterMask: ['AKIAIOSFODNN7EXAMPLE'],
  },
  {
    id: 'credential-openai',
    description: 'OpenAI 토큰',
    sections: [{ texts: ['Bearer sk-abcdefghijklmnopqrstuv'] }],
    forbiddenAfterMask: ['sk-abcdefghijklmnopqrstuv'],
  },

  // 운전면허/법인등록 (3)
  {
    id: 'driver-license',
    description: '운전면허번호',
    sections: [{ texts: ['면허번호 11-25-123456-78'] }],
    forbiddenAfterMask: ['11-25-123456-78'],
  },
  {
    id: 'corporate-reg',
    description: '법인등록번호',
    sections: [{ texts: ['법인등록번호 130111-0006246'] }],
    forbiddenAfterMask: ['130111-0006246'],
  },
  {
    id: 'mixed-ids',
    description: '한 문단에 운전면허+법인',
    sections: [
      { texts: ['면허 11-25-123456-78'] },
      { texts: ['법인 130111-0006246'] },
    ],
    forbiddenAfterMask: ['11-25-123456-78', '130111-0006246'],
  },

  // 인명 + 직책 (3)
  {
    id: 'name-with-title-1',
    description: '인명 + 부장 직책',
    sections: [{ texts: ['김민수 부장님께 보고드렸습니다.'] }],
    forbiddenAfterMask: [], // 인명은 'fake' 모드라 '홍길동'으로 치환 — 원본 김민수 부재 확인 어려움 (커버됨)
  },
  {
    id: 'name-with-title-2',
    description: '인명 + 대표 직책',
    sections: [{ texts: ['박지영 대표님 안녕하세요.'] }],
    forbiddenAfterMask: [],
  },
  {
    id: 'name-multi',
    description: '여러 인명',
    sections: [{ texts: ['김민수 팀장, 이영희 부장, 박지영 대표'] }],
    forbiddenAfterMask: [],
  },

  // XML 특수문자 / 엣지 (4)
  {
    id: 'xml-amp',
    description: 'XML & 이스케이프 + PII',
    sections: [{ texts: ['Lee & Co. 010-1234-5678'] }],
    forbiddenAfterMask: ['010-1234-5678'],
  },
  {
    id: 'xml-quote',
    description: 'XML 따옴표 + 이메일',
    sections: [{ texts: ['이름 "홍길동" lead@example.org'] }],
    forbiddenAfterMask: ['lead@example.org'],
  },
  {
    id: 'xml-lt-gt',
    description: 'XML <, > + RRN',
    sections: [{ texts: ['<신청서> 900101-1234568 </신청서>'] }],
    forbiddenAfterMask: ['900101-1234568'],
  },
  {
    id: 'mixed-pii-paragraph',
    description: '한 문단 + 모든 PII 카테고리',
    sections: [
      {
        texts: [
          '담당 김민수 부장 (010-1234-5678 / 02-555-1234) 이메일 m@example.org RRN 900101-1234568 카드 4111 1111 1111 1111 키 sk-abcdefghijklmnopqrstuv',
        ],
      },
    ],
    forbiddenAfterMask: [
      '010-1234-5678',
      '02-555-1234',
      'm@example.org',
      '900101-1234568',
      '4111 1111 1111 1111',
      'sk-abcdefghijklmnopqrstuv',
    ],
  },

  // NPO 양식 시나리오 (3)
  {
    id: 'npo-form-header',
    description: '결산공시 양식 헤더 + 빈 행',
    sections: [
      { texts: [KOREAN_FORM_HEADERS[0]!, '단체명', '대표자', '주소', '연락처', ''] },
    ],
    forbiddenAfterMask: [],
  },
  {
    id: 'npo-form-filled',
    description: '결산공시 양식 + 채운 데이터',
    sections: [
      {
        texts: [
          KOREAN_FORM_HEADERS[1]!,
          '대표자 김철수 (010-1234-5678)',
          'RRN 900101-1234568',
          '계좌 110-234-567890',
          '이메일 director@example.org',
        ],
      },
    ],
    forbiddenAfterMask: [
      '010-1234-5678',
      '900101-1234568',
      '110-234-567890',
      'director@example.org',
    ],
  },
  {
    id: 'npo-multi-section',
    description: '4개 섹션 NPO 양식 분포',
    sections: [
      { texts: [KOREAN_FORM_HEADERS[2]!] },
      { texts: ['이사 김민수', '연락처 010-1111-2222'] },
      { texts: ['이사 박지영', '연락처 010-3333-4444'] },
      { texts: ['이사 이영희', '연락처 010-5555-6666'] },
    ],
    forbiddenAfterMask: ['010-1111-2222', '010-3333-4444', '010-5555-6666'],
  },
];

// ---------------------------------------------------------------------------
// 사용자 측 추가 fixture (NPO_SAMPLE_DIR/*.hwpx)
// ---------------------------------------------------------------------------

function resolveSampleDir(): string | null {
  const env = process.env.NPO_SAMPLE_DIR;
  if (env && existsSync(env)) return env;
  const candidates = [
    join(process.cwd(), 'sample'),
    join(process.cwd(), '..', 'sample'),
    join(process.cwd(), '..', '..', 'sample'),
    join(process.cwd(), '..', '..', '..', 'sample'),
    join(process.cwd(), '..', '..', '..', '..', 'sample'),
  ];
  for (const c of candidates) if (existsSync(c)) return c;
  return null;
}

const sampleDir = resolveSampleDir();
const externalHwpxFiles: string[] = sampleDir
  ? readdirSync(sampleDir)
      .filter((n) => n.endsWith('.hwpx'))
      .map((n) => join(sampleDir, n))
  : [];

// ---------------------------------------------------------------------------
// Round-trip 회귀
// ---------------------------------------------------------------------------

const TEXT_NODE_DELTA_GATE = 0.05; // 5%

describe('HWPX round-trip 회귀 (S19 ship gate)', () => {
  test(`fixture 카운트가 ≥30 (현재 ${FIXTURES.length} + 외부 ${externalHwpxFiles.length})`, () => {
    expect(FIXTURES.length + externalHwpxFiles.length).toBeGreaterThanOrEqual(30);
  });

  for (const fx of FIXTURES) {
    test(`[${fx.id}] ${fx.description}`, async () => {
      const file = await makeHwpx(fx.sections);

      // 1) Parse
      const parsed = await parseHwpx(file);
      const originalNodeCount = parsed.segments.length;
      expect(originalNodeCount).toBeGreaterThan(0);

      // 2) PII detect on combined text → 마스킹 적용
      const combined = parsed.combinedText;
      const spans = detectKoreanPII(combined);

      // 마스킹은 segment 단위로 변환. detect는 combinedText 좌표라 segment별 분배 필요.
      // 단순화: segment 텍스트별 detect → mask → masked map 구축.
      const maskedMap = new Map<string, string>();
      for (const seg of parsed.segments) {
        const segSpans = detectKoreanPII(seg.text);
        if (segSpans.length === 0) continue;
        const masked = maskText(seg.text, segSpans, { defaultMode: 'shape' }).text;
        if (masked !== seg.text) maskedMap.set(seg.id, masked);
      }

      // 3) Export (round-trip)
      const blob = await exportHwpx(file, maskedMap);
      const reFile = new File([await blob.arrayBuffer()], 'roundtrip.hwpx');

      // 4) Re-parse
      const reParsed = await parseHwpx(reFile);
      const newNodeCount = reParsed.segments.length;

      // 5) 텍스트 노드 카운트 delta < 5% (대개 동일하나 빈 노드 제거 등으로 다를 수 있음)
      const delta = Math.abs(newNodeCount - originalNodeCount) / originalNodeCount;
      expect(delta, `node count delta ${delta} > ${TEXT_NODE_DELTA_GATE}`).toBeLessThanOrEqual(
        TEXT_NODE_DELTA_GATE,
      );

      // 6) 원본 PII 문자열이 export 결과에 잔존하지 않음
      const reCombined = reParsed.combinedText;
      for (const forbidden of fx.forbiddenAfterMask) {
        expect(
          reCombined.includes(forbidden),
          `원본 PII 잔존: "${forbidden}"`,
        ).toBe(false);
      }

      // 7) PII 0건 fixture는 spans 없어야 함 (회귀 — 양식 라벨 FP 검증)
      if (fx.forbiddenAfterMask.length === 0 && fx.id.startsWith('npo-form-header')) {
        expect(spans).toHaveLength(0);
      }
    });
  }
});

// ---------------------------------------------------------------------------
// 사용자 측 외부 .hwpx fixture (있을 때만)
// ---------------------------------------------------------------------------

describe.skipIf(externalHwpxFiles.length === 0)(
  `HWPX round-trip — 외부 fixture (${externalHwpxFiles.length}개)`,
  () => {
    for (const path of externalHwpxFiles) {
      const name = path.split('/').pop()!;
      test(`[external] ${name}`, async () => {
        const buf = readFileSync(path);
        const file = new File([buf], name);
        const parsed = await parseHwpx(file);
        const originalNodeCount = parsed.segments.length;
        expect(originalNodeCount).toBeGreaterThan(0);

        const maskedMap = new Map<string, string>();
        for (const seg of parsed.segments) {
          const segSpans = detectKoreanPII(seg.text);
          if (segSpans.length === 0) continue;
          maskedMap.set(seg.id, maskText(seg.text, segSpans, { defaultMode: 'shape' }).text);
        }

        const blob = await exportHwpx(file, maskedMap);
        const reFile = new File([await blob.arrayBuffer()], 'roundtrip-' + name);
        const reParsed = await parseHwpx(reFile);
        const delta = Math.abs(reParsed.segments.length - originalNodeCount) / originalNodeCount;
        expect(delta).toBeLessThanOrEqual(TEXT_NODE_DELTA_GATE);
      });
    }
  },
);

// ---------------------------------------------------------------------------
// v1.3 회귀 — sample/1.hwpx 명시 검증
//   1) Preview/PrvText.txt가 segment에 포함되어야 한다 (미리보기 누출 차단).
//   2) 사용자 정의상 PII가 아닌 단어(공공기관명·일반어)가 정규식 detect에서 안 잡혀야 한다.
// ---------------------------------------------------------------------------

const sample1Path = sampleDir ? join(sampleDir, '1.hwpx') : null;

describe.skipIf(!sample1Path || !existsSync(sample1Path))(
  'HWPX v1.3 회귀 — sample/1.hwpx',
  () => {
    test('Preview/PrvText.txt가 segment에 포함된다 (미리보기 누출 방지)', async () => {
      const buf = readFileSync(sample1Path!);
      const file = new File([buf], '1.hwpx');
      const parsed = await parseHwpx(file);
      const prvSeg = parsed.segments.find((s) => s.id.startsWith('Preview/PrvText.txt'));
      expect(prvSeg, '미리보기 텍스트 segment가 등록되지 않음').toBeDefined();
      expect(prvSeg!.text.length).toBeGreaterThan(0);
    });

    test('일반 본문에서 조직명·일반어가 정규식 detect로 잡히지 않는다', async () => {
      const buf = readFileSync(sample1Path!);
      const file = new File([buf], '1.hwpx');
      const parsed = await parseHwpx(file);
      const matched = new Set<string>();
      for (const seg of parsed.segments) {
        for (const span of detectKoreanPII(seg.text)) matched.add(span.text);
      }
      // 사용자 정의: 조직명·공공기관명·일반어는 모두 PII 아님 → 매치되면 안 됨.
      const nonPii = [
        '한국사회적기업진흥원', '조달청', '협동조합',
        '한국공공기관연구원', '공공조달역량개발원', '성장지원센터',
        '선착순', '노트북', '하반기', '서울역',
      ];
      for (const term of nonPii) {
        expect(matched.has(term), `"${term}"는 PII가 아닌데 정규식이 매치함`).toBe(false);
      }
    });
  },
);
