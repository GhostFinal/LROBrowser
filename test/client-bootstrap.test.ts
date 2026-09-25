import { describe, expect, it } from 'vitest';
import { parseExecutableAssetManifest } from '../src/runtime/client-bootstrap';

describe('executable asset manifest loading', () => {
  it('reports an HTML fallback instead of attempting JSON parsing', async () => {
    const response = new Response('<!doctype html><html></html>', {
      status: 200,
      headers: { 'content-type': 'text/html' },
    });
    await expect(parseExecutableAssetManifest(response)).rejects.toThrow('请重启 Vite 开发服务器');
  });

  it('accepts a JSON manifest with a files array', async () => {
    const response = new Response(JSON.stringify({ files: [{ path: 'runtime/Online.js', kind: 'runtime' }] }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });
    await expect(parseExecutableAssetManifest(response)).resolves.toEqual({
      files: [{ path: 'runtime/Online.js', kind: 'runtime' }],
    });
  });
});
