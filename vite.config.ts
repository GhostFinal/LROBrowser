import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { defineConfig, type Plugin } from 'vitest/config';

function packageRuntime(): Plugin {
  return {
    name: 'package-patched-runtime',
    generateBundle() {
      const runtime = path.resolve('.staging/runtime/Online.js');
      if (existsSync(runtime)) this.emitFile({ type: 'asset', fileName: 'runtime/Online.js', source: readFileSync(runtime) });
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
      'Cross-Origin-Opener-Policy': 'same-origin',
      'Cross-Origin-Embedder-Policy': 'require-corp',
      'Cross-Origin-Resource-Policy': 'same-origin',
    },
  },
  test: { include: ['test/**/*.test.ts'] },
});
