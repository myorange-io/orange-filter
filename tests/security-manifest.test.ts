// 보안 회귀 — manifest 정적 가드. 우발적 권한 추가/완화를 테스트로 lock.
//
// Cross-extension 노출 모델 (Threat Model §2.4 §3):
//   - 우리는 같은 origin(chrome-extension://EXT_ID) 내부 메시지만 받는다.
//   - externally_connectable 필드 부재 → 외부 확장/사이트의 sendMessage 차단.
//   - host_permissions는 LLM 도메인만 — 임의 사이트에 inject 불가.
//   - web_accessible_resources matches: <all_urls>이지만 노출 자원은 폰트/모델/
//     OCR 자원 등 정적이고 비-PII. 실제 PII 처리 코드는 isolated world.

import { describe, expect, test } from 'vitest';
import manifest from '../manifest.config';

// crxjs는 defineManifest를 ManifestV3와 호환되는 객체로 반환. 단, 타입은 약간 느슨.
const m = manifest as unknown as {
  manifest_version: number;
  permissions?: string[];
  host_permissions?: string[];
  externally_connectable?: unknown;
  content_security_policy?: { extension_pages?: string };
  web_accessible_resources?: Array<{ resources: string[]; matches: string[] }>;
  content_scripts?: Array<{ matches: string[] }>;
};

describe('manifest 보안 회귀', () => {
  test('MV3 (manifest_version: 3)', () => {
    expect(m.manifest_version).toBe(3);
  });

  test('externally_connectable 부재 — 외부 확장/사이트 메시지 차단', () => {
    expect(m.externally_connectable).toBeUndefined();
  });

  test('host_permissions: LLM 5개 + 1개(orange-impact) 한정 — 임의 사이트 차단', () => {
    const hosts = m.host_permissions ?? [];
    expect(hosts.length).toBeLessThanOrEqual(7);
    for (const h of hosts) {
      // LLM/orange-impact 도메인만 허용
      const ok =
        h.includes('chat.openai.com') ||
        h.includes('chatgpt.com') ||
        h.includes('claude.ai') ||
        h.includes('gemini.google.com') ||
        h.includes('perplexity.ai') ||
        h.includes('orangeimpact');
      expect(ok, `예상 외 host_permissions: ${h}`).toBe(true);
    }
  });

  test('permissions: 최소 권한 원칙 — storage/sidePanel/offscreen만', () => {
    const perms = new Set(m.permissions ?? []);
    expect(perms).toEqual(new Set(['storage', 'sidePanel', 'offscreen']));
    // 위험 권한 명시 차단
    for (const dangerous of ['tabs', 'webRequest', 'cookies', 'history', 'bookmarks', 'downloads', 'identity']) {
      expect(perms.has(dangerous), `${dangerous} 권한이 추가되면 안 됨`).toBe(false);
    }
  });

  test('content_scripts: LLM 호스트만 매칭 (임의 사이트에 inject 안 됨)', () => {
    for (const cs of m.content_scripts ?? []) {
      for (const match of cs.matches) {
        expect(match).toMatch(/chatgpt|openai|claude|gemini|perplexity|orangeimpact/);
      }
    }
  });

  test('web_accessible_resources: 노출 자원이 정적/비-PII만', () => {
    const allowed = new Set(['fonts/*', 'ort/*', 'tesseract/*', 'src/offscreen/*', 'src/test-page/*']);
    for (const war of m.web_accessible_resources ?? []) {
      for (const r of war.resources) {
        expect(allowed.has(r), `예상 외 web_accessible_resources: ${r}`).toBe(true);
      }
    }
  });

  test('CSP: WASM은 wasm-unsafe-eval만, unsafe-eval/외부 script-src 차단', () => {
    const csp = m.content_security_policy?.extension_pages ?? '';
    // WASM 컴파일에 필요 (ORT + Tesseract). MV3 strict CSP에서 유일하게 허용.
    expect(csp).toMatch(/'wasm-unsafe-eval'/);
    // script-src 'self' 명시
    expect(csp).toMatch(/script-src\s+'self'/);
    // 일반 unsafe-eval 차단 (보안 회귀 lock)
    expect(csp.includes("'unsafe-eval'") && !csp.includes("'wasm-unsafe-eval'")).toBe(false);
    // 외부 cdn 추가 금지
    for (const dangerous of ['https://', 'http://', 'data:', 'unsafe-inline']) {
      expect(csp.includes(dangerous), `script-src에 ${dangerous} 차단`).toBe(false);
    }
  });
});
