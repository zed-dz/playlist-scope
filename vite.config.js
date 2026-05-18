import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: { '@': path.resolve(__dirname, './src') },
  },
  build: {
    target: 'es2020',
    sourcemap: true,
    // The base64-gzipped demo payload is huge; let it be inlined as a string asset.
    assetsInlineLimit: 0,
  },
  server: {
    port: 5173,
    // Proxy to the local ingest server during dev
    proxy: {
      '/api': 'http://localhost:3000',
    },
  },
});
