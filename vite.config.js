import { defineConfig } from 'vite';
import { viteSingleFile } from 'vite-plugin-singlefile';

// The game ships as a single self-contained HTML file: no external assets.
// Textures and sounds are generated procedurally at runtime; the creature
// models (built with tools/blender) are inlined as data URLs.
export default defineConfig({
  base: './',
  assetsInclude: ['**/*.glb'],
  plugins: [viteSingleFile()],
  build: {
    target: 'es2022',
    chunkSizeWarningLimit: 4096,
  },
  worker: {
    format: 'es',
  },
});
