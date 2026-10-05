import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: { port: 5190, strictPort: true },
  // Source maps stay off until Sentry upload lands (CD-08): they must never be served publicly.
  build: { target: 'es2022', sourcemap: false },
});
