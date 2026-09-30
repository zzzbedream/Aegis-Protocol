import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    host: true,
    // The landing imports the published deployment file from ../vela-app (single source of truth).
    fs: { allow: ['..'] },
  },
});
