import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  base: './',
  plugins: [react()],
  worker: { format: 'es' },
  server: { port: 5173, strictPort: true },
  build: { target: 'es2022', outDir: 'dist', sourcemap: true },
});
