import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import path from 'path';
import { execSync } from 'child_process';
import { readFileSync } from 'fs';

let gitHash = 'dev';
try {
  // Try reading pre-generated hash first (set by deploy.sh for Docker builds)
  gitHash = readFileSync(new URL('../.git-hash', import.meta.url), 'utf-8').trim();
} catch {
  try {
    gitHash = execSync('git rev-parse --short HEAD').toString().trim();
  } catch {}
}
const buildTime = new Date().toISOString();

export default defineConfig({
  plugins: [react(), tailwindcss()],
  define: {
    __APP_VERSION__: JSON.stringify(`1.0.0-${gitHash}`),
    __BUILD_TIME__: JSON.stringify(buildTime),
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    port: 5173,
    host: '0.0.0.0',
    allowedHosts: true,
    proxy: {
      '/api': {
        target: 'http://localhost:3001',
        changeOrigin: true,
      },
    },
  },
});
