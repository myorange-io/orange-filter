import { defineManifest } from '@crxjs/vite-plugin';

// 호스트 권한 최소화 — site adapters에서 필요한 도메인만.
// optional_host_permissions로 두어 사용자가 사이트별로 명시 허가할 수 있게.
const LLM_HOSTS = [
  'https://chat.openai.com/*',
  'https://chatgpt.com/*',
  'https://claude.ai/*',
  'https://gemini.google.com/*',
  'https://www.perplexity.ai/*',
  'https://*.orangeimpact.kr/*',
];

export default defineManifest({
  manifest_version: 3,
  name: '오렌지 필터',
  description:
    'LLM 붙여넣기·파일 업로드 전에 개인정보를 이 PC 안에서 자동 감지·마스킹합니다.',
  version: '0.0.1',
  default_locale: 'ko',
  // TODO(S5): 디자인 슬라이스에서 brand orange 아이콘 16/48/128 추가
  action: {
    default_title: '오렌지 필터',
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
  web_accessible_resources: [
    {
      resources: ['fonts/*', 'ort/*', 'rhwp/*', 'src/offscreen/*', 'src/test-page/*'],
      matches: ['<all_urls>'],
    },
  ],
});
