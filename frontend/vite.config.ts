import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

declare const process: { env: Record<string, string | undefined> };

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    host: process.env.VITE_DEV_HOST === '0.0.0.0' ? '0.0.0.0' : '127.0.0.1',
  },
});

