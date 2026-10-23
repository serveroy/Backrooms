import { defineConfig } from 'vite';
import { viteSingleFile } from 'vite-plugin-singlefile';

// The game ships as a single self-contained HTML file: no external assets,
// every texture and sound is generated procedurally at runtime.
export default defineConfig({
  base: './',
  plugins: [viteSingleFile()],
  build: {
    target: 'es2022',
    chunkSizeWarningLimit: 4096,
  },
  worker: {
    format: 'es',
  },
});
