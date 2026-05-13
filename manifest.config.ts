import { defineManifest } from '@crxjs/vite-plugin';

// 호스트 권한 최소화 — site adapters에서 필요한 도메인만.
// optional_host_permissions로 두어 사용자가 사이트별로 명시 허가할 수 있게.
const LLM_HOSTS = [
  'https://chat.openai.com/*',
  'https://chatgpt.com/*',
  'https://claude.ai/*',
  'https://gemini.google.com/*',
  'https://www.perplexity.ai/*',
  // www 없이 직접 접근하는 경우도 매처에 포함 (사용자가 perplexity.ai 입력 시 www로 redirect되지만,
  // 일부 환경에서 redirect 전 content script가 실행되도록 root host도 등록).
  'https://perplexity.ai/*',
  'https://*.orangeimpact.kr/*',
];

export default defineManifest({
  manifest_version: 3,
  name: 'Orange Filter - AI 프라이버시 필터',
  description:
    'LLM(ChatGPT·Gemini·Claude·오렌지임팩트)에 붙여넣거나 파일을 올리기 전에, 개인정보를 이 PC 안에서 자동으로 가립니다.',
  version: '1.5.1',
  default_locale: 'ko',
  icons: {
    16: 'icons/icon-16.png',
    48: 'icons/icon-48.png',
    128: 'icons/icon-128.png',
  },
  action: {
    default_title: 'Orange Filter',
    default_icon: {
      16: 'icons/icon-16.png',
      48: 'icons/icon-48.png',
      128: 'icons/icon-128.png',
    },
  },
  side_panel: {
    default_path: 'src/sidepanel/sidepanel.html',
  },
  background: {
    service_worker: 'src/background/index.ts',
    type: 'module',
  },
  content_scripts: [
    {
      matches: LLM_HOSTS,
      js: ['src/content/index.ts'],
      run_at: 'document_idle',
      all_frames: false,
    },
  ],
  host_permissions: LLM_HOSTS,
  permissions: ['storage', 'sidePanel', 'offscreen'],
  // MV3 WASM 컴파일 허용. ORT WebAssembly(transformers.js) + Tesseract WASM이 필요.
  // 'wasm-unsafe-eval'은 MV3에서 유일하게 허용되는 WASM 컴파일 옵션 (strict CSP 호환).
  content_security_policy: {
    extension_pages:
      "script-src 'self' 'wasm-unsafe-eval'; object-src 'self'",
  },
  web_accessible_resources: [
    {
      resources: [
        'fonts/*',
        'ort/*',
        'tesseract/*',
        'src/offscreen/*',
        'src/test-page/*',
      ],
      matches: ['<all_urls>'],
    },
  ],
});
