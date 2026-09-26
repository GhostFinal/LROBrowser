import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { defineConfig, type Plugin, type ViteDevServer } from 'vite';

export function stripViteClientInjection(html: string): string {
  return html.replace(/<script\b(?=[^>]*\bsrc=["'][^"']*\/@vite\/client["'])[^>]*>\s*<\/script>\s*/g, '');
}

function packageRuntime(): Plugin {
  function serveStagedRuntime(server: ViteDevServer) {
    server.middlewares.use((request, response, next) => {
      const pathname = decodeURIComponent((request.url ?? '').split('?')[0] ?? '');
      let source: string | undefined;
      if (pathname === '/runtime/Online.js') source = path.resolve('.staging/runtime/Online.js');
      else if (pathname === '/runtime/LastROThreadEventHandler.js') source = path.resolve('.staging/runtime/LastROThreadEventHandler.js');
      else if (pathname === '/runtime/lastro-account-login.mjs') source = path.resolve('src/runtime/lastro-account-login.mjs');
      else if (pathname.startsWith('/runtime/')) source = path.resolve('.staging/core/runtime', pathname.slice('/runtime/'.length));
      else if (pathname.startsWith('/core/')) source = path.resolve('.staging/core', pathname.slice('/core/'.length));
      if (!source || !existsSync(source)) { next(); return; }
      const extension = path.extname(source).toLowerCase();
      const contentType = extension === '.json' ? 'application/json' : extension === '.wasm' ? 'application/wasm' : 'text/javascript; charset=utf-8';
      response.statusCode = 200;
      response.setHeader('Content-Type', contentType);
      response.setHeader('Content-Security-Policy', "script-src 'self' 'wasm-unsafe-eval'");
      response.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
      response.setHeader('Cross-Origin-Embedder-Policy', 'require-corp');
      response.setHeader('Cross-Origin-Resource-Policy', 'same-origin');
      response.end(readFileSync(source));
    });
  }
  return {
    name: 'package-patched-runtime',
    configureServer: serveStagedRuntime,
    transformIndexHtml: {
      order: 'post',
      handler: stripViteClientInjection,
    },
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
