import { fileURLToPath, URL } from 'node:url';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/postcss';

export default defineConfig({
  // CNAME publishes this repository at the root of mhri.net.
  base: '/',
  plugins: [react()],
  server: { proxy: { '/api': 'http://127.0.0.1:8080' } },
  resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } },
  css: { postcss: { plugins: [tailwindcss()] } },
});
