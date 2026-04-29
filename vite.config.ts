import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { crx } from '@crxjs/vite-plugin';
import manifest from './manifest.config';

export default defineConfig({
  plugins: [react(), crx({ manifest })],
  resolve: {
    alias: {
      '@': new URL('./src', import.meta.url).pathname,
    },
  },
  build: {
    rollupOptions: {
      input: {
        offscreen: 'src/offscreen/offscreen.html',
        testpage: 'src/test-page/test.html',
      },
    },
  },
  server: {
    // 평행 worktree에서 5173/5174가 점유됐을 때 VITE_PORT/VITE_HMR_PORT로 override.
    port: Number(process.env.VITE_PORT) || 5173,
    strictPort: true,
    hmr: {
      port: Number(process.env.VITE_HMR_PORT) || 5174,
    },
  },
});
