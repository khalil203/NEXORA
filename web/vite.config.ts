import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { viteSingleFile } from 'vite-plugin-singlefile';
import pkg from './package.json';

// Builds NEXORA into ONE self-contained HTML file (dist/index.html → ../app.html),
// so the existing loader + GitHub self-update keep working.
export default defineConfig({
  plugins: [react(), viteSingleFile()],
  define: { __APP_VERSION__: JSON.stringify(pkg.version) },
  build: { target: 'es2020', cssCodeSplit: false, assetsInlineLimit: 100_000_000, chunkSizeWarningLimit: 4000 },
});
