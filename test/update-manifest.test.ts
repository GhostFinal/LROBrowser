import { describe, expect, it } from 'vitest';
import { buildUpdateManifest } from '../scripts/build-update-manifest.mjs';

describe('update manifest', () => {
  it('builds a stable default channel manifest in descending version order', () => {
    const result = buildUpdateManifest([
      { version: '0.1.1', src: 'https://cdn.test/releases/0.1.1/app.swbn', channels: ['default'] },
      { version: '0.1.2', src: 'https://cdn.test/releases/0.1.2/app.swbn', channels: ['default'] },
    ]);
    expect(result.versions[0]?.version).toBe('0.1.2');
    expect(result.channels.default?.name).toBe('Stable');
  });
  it('rejects duplicate versions with different sources', () => {
    expect(() => buildUpdateManifest([
      { version: '0.1.1', src: 'https://a.test/a.swbn', channels: ['default'] },
      { version: '0.1.1', src: 'https://b.test/b.swbn', channels: ['default'] },
    ])).toThrow();
  });
});
