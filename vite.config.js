import { defineConfig } from 'vite';

export default defineConfig({
  // Basic configuration for Vite
  root: './',
  build: {
    outDir: 'dist',
    emptyOutDir: true,
  },
  server: {
    port: 3000,
    open: true,
  },
});
