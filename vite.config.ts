import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { defineConfig, type Plugin } from 'vitest/config';

function packageRuntime(): Plugin {
  return {
    name: 'package-patched-runtime',
    generateBundle() {
      const runtime = path.resolve('.staging/runtime/Online.js');
      if (existsSync(runtime)) this.emitFile({ type: 'asset', fileName: 'runtime/Online.js', source: readFileSync(runtime) });
      const manifestPath = path.resolve('.staging/core/executable-assets.json');
      if (!existsSync(manifestPath)) return;
      const manifest = JSON.parse(readFileSync(manifestPath, 'utf8')) as { files: Array<{ path: string; kind: string }> };
      for (const file of manifest.files) {
        const source = path.resolve('.staging/core', file.path);
        if (!existsSync(source)) throw new Error(`Missing core asset: ${file.path}`);
        this.emitFile({ type: 'asset', fileName: `core/${file.path}`, source: readFileSync(source) });
        if (file.kind === 'runtime' && file.path !== 'runtime/Online.js') {
          this.emitFile({ type: 'asset', fileName: `runtime/${path.basename(file.path)}`, source: readFileSync(source) });
        }
      }
      this.emitFile({ type: 'asset', fileName: 'core/executable-assets.json', source: readFileSync(manifestPath) });
    },
  };
}

export default defineConfig({
  base: './',
  plugins: [packageRuntime()],
  build: { target: 'es2022', sourcemap: false },
  server: {
    hmr: false,
    headers: {
      'Content-Security-Policy': "script-src 'self' 'wasm-unsafe-eval'",
      'Cross-Origin-Opener-Policy': 'same-origin',
      'Cross-Origin-Embedder-Policy': 'require-corp',
      'Cross-Origin-Resource-Policy': 'same-origin',
    },
  },
  test: { include: ['test/**/*.test.ts'] },
});
