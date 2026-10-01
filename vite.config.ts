import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { type Plugin, type ViteDevServer } from 'vite';
import { defineConfig } from 'vitest/config';
import { REQUIRED_HEADERS } from './scripts/iwa-security.mjs';
import { isLocalRequest, resolveStagedResource } from './scripts/dev-resource-security.mjs';

export function stripViteClientInjection(html: string): string {
  return html.replace(/<script\b(?=[^>]*\bsrc=["'][^"']*\/@vite\/client["'])[^>]*>\s*<\/script>\s*/g, '');
}

function packageRuntime(): Plugin {
  function serveStagedRuntime(server: ViteDevServer) {
    server.middlewares.use((request, response, next) => {
      for (const [name, value] of Object.entries(REQUIRED_HEADERS)) response.setHeader(name, value);
      if (!isLocalRequest(request.headers.host, request.headers.origin)) {
        response.statusCode = 403; response.end('Forbidden request origin'); return;
      }
      let resource;
      try { resource = resolveStagedResource(server.config.root, request.url); }
      catch { response.statusCode = 403; response.end('Invalid resource path'); return; }
      if (!resource) { next(); return; }
      if (!resource.exists) { response.statusCode = 404; response.end('Resource not found'); return; }
      const source = resource.file;
      const extension = path.extname(source).toLowerCase();
      const contentType = extension === '.json' ? 'application/json' : extension === '.wasm' ? 'application/wasm' : 'text/javascript; charset=utf-8';
      response.statusCode = 200;
      response.setHeader('Content-Type', contentType);
      response.setHeader('Cache-Control', 'no-store');
      response.end(readFileSync(source));
    });
  }
  return {
    name: 'package-patched-runtime',
    resolveId(source) {
      // This URL is served verbatim by the staged-resource middleware. Keep it
      // resolvable during Vite's dev import analysis without rewriting/bundling it.
      if (source === '/runtime/Online.js') return { id: source, external: true };
    },
    configureServer: serveStagedRuntime,
    transformIndexHtml: {
      order: 'post',
      handler: stripViteClientInjection,
    },
    generateBundle() {
      const runtime = path.resolve('generated/runtime/Online.js');
      if (existsSync(runtime)) this.emitFile({ type: 'asset', fileName: 'runtime/Online.js', source: readFileSync(runtime) });
      const manifestPath = path.resolve('generated/core/executable-assets.json');
      if (!existsSync(manifestPath)) return;
      const manifest = JSON.parse(readFileSync(manifestPath, 'utf8')) as { files: Array<{ path: string; kind: string }> };
      for (const file of manifest.files) {
        const source = path.resolve('generated/core', file.path);
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
  optimizeDeps: { entries: ['index.html'], exclude: ['/runtime/Online.js'] },
  build: { target: 'es2022', sourcemap: false, rollupOptions: { external: ['/runtime/Online.js'] } },
  server: {
    host: '127.0.0.1',
    hmr: false,
    fs: { strict: true, allow: [path.resolve('.')], deny: ['**/.env', '**/.env.*', '**/*.{crt,pem,key}', '**/.git/**', '**/.local/**', '**/.codex/**', '**/.agents/**', '**/.npmrc', '**/.netrc'] },
    headers: REQUIRED_HEADERS,
  },
  test: { include: ['test/**/*.test.ts'] },
});
