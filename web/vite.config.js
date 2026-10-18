import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const dir = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  root: dir,
  plugins: [vue()],
  resolve: {
    alias: {
      '@': path.join(dir, 'src'),
      '@shared': path.resolve(dir, '../shared'),
    },
  },
  server: {
    host: '0.0.0.0',
    port: 5173,
    strictPort: true,
    proxy: {
      '/api': {
        target: process.env.DEV_API_TARGET || 'http://127.0.0.1:8080',
        changeOrigin: false,
      },
    },
    fs: {
      allow: [path.resolve(dir, '..')],
    },
  },
  build: {
    outDir: path.resolve(dir, '../dist'),
    emptyOutDir: true,
    target: 'es2020',
    sourcemap: false,
  },
});
