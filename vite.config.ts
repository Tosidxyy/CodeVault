import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  build: {
    target: 'chrome120',
    rollupOptions: { input: { popup: 'popup.html', options: 'options.html' } },
  },
});
