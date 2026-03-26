import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [],
  // Basic configuration for Vite
  root: './',
  build: {
    outDir: 'dist',
    emptyOutDir: true,
  },
  server: {
    port: 3456,
    open: true,
  },
});
