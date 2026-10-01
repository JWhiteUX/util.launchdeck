import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const designDir = fileURLToPath(new URL('../../design', import.meta.url));
const repoRoot = fileURLToPath(new URL('../..', import.meta.url));

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: { '@design': designDir },
  },
  server: {
    port: 3000,
    strictPort: true,
    fs: { allow: [repoRoot] },
    // SSE (/api/events) streams through http-proxy unbuffered by default.
    proxy: {
      '/api': { target: 'http://127.0.0.1:4000', changeOrigin: true },
    },
  },
});
