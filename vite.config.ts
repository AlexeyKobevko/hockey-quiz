import { defineConfig } from 'vite';
import { fileURLToPath } from 'node:url';
const here = (relative: string) => fileURLToPath(new URL(relative, import.meta.url));
export default defineConfig({
  root: here('./src/client/'),
  publicDir: 'public',
  server: {
    host: process.env.DEV_LAN === '1' ? (process.env.DEV_HOST ?? '0.0.0.0') : '127.0.0.1',
    port: Number(process.env.DEV_PORT ?? 5173),
    strictPort: true,
    fs: { allow: [here('./src/client/'), here('./src/shared/')] },
    proxy: {
      '/api/': {
        target: `http://127.0.0.1:${process.env.DEV_API_PORT ?? 3708}`,
        changeOrigin: false,
        timeout: 0,
        proxyTimeout: 0,
      },
    },
  },
  build: { outDir: here('./dist/client/'), emptyOutDir: true },
});
