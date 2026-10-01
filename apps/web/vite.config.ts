import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const designDir = fileURLToPath(new URL('../../design', import.meta.url));
const repoRoot = fileURLToPath(new URL('../..', import.meta.url));
// frappe-gantt only exposes its stylesheet via a "style" export condition that its "import" key shadows,
// so resolve the file from wherever npm installed the package.
const ganttCss = join(dirname(createRequire(import.meta.url).resolve('frappe-gantt')), 'frappe-gantt.css');

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: { '@design': designDir, 'frappe-gantt/style.css': ganttCss },
  },
  server: {
    port: Number(process.env.WEB_PORT ?? 3001),
    strictPort: true,
    fs: { allow: [repoRoot] },
    // SSE (/api/stream) streams through http-proxy unbuffered by default.
    proxy: {
      '/api': { target: 'http://127.0.0.1:4000', changeOrigin: true },
    },
  },
});
