import { defineConfig } from 'vite';
import { resolve } from 'node:path';

export default defineConfig(({ mode }) => ({
  build: {
    lib: {
      entry: resolve(__dirname, 'src/main.ts'),
      formats: ['es'],
      fileName: () => 'smart-assistant-builder.js',
    },
    rollupOptions: {
      output: {
        inlineDynamicImports: true,
      },
    },
    target: 'es2022',
    sourcemap: mode !== 'production',
    minify: 'esbuild',
    emptyOutDir: true,
  },
  server: {
    port: 5173,
    open: '/dev.html',
  },
}));
