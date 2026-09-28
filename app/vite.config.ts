import { defineConfig } from 'vite';
import path from 'node:path';

// public/audio and public/data are symlinks to the repo-root audio/ and data/.
// OV_NO_HMR=1 disables live reload so an offline render never reloads mid-run.
export default defineConfig({
  root: '.',
  base: './',
  publicDir: 'public',
  server: {
    host: true,
    port: 5173,
    hmr: process.env.OV_NO_HMR ? false : undefined,
    fs: { allow: [path.resolve(__dirname, '..')] },
  },
  preview: { host: true, port: 4173 },
  build: { target: 'es2022', assetsInlineLimit: 0, outDir: 'dist' },
});
