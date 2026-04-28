import { defineConfig } from 'vite';
import { resolve } from 'node:path';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';

const pkg = JSON.parse(readFileSync(resolve(__dirname, 'package.json'), 'utf8')) as { version: string };
const buildId = `${pkg.version}-${createHash('sha1').update(`${Date.now()}-${pkg.version}`).digest('hex').slice(0, 8)}`;

export default defineConfig(({ mode }) => ({
  define: {
    __SAB_BUILD_ID__: JSON.stringify(buildId),
    __SAB_VERSION__: JSON.stringify(pkg.version),
  },
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
