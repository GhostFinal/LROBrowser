import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';

describe('GitHub workflow policy', () => {
  it('keeps CI secret-free and release protected', async () => {
    const [ci, release] = await Promise.all([readFile('.github/workflows/iwa-ci.yml', 'utf8'), readFile('.github/workflows/iwa-release.yml', 'utf8')]);
    expect(ci).not.toContain('secrets.IWA_SIGNING_KEY');
    expect(ci).toContain('contents: read');
    expect(release).toContain('environment:');
    expect(release).toContain('name: iwa-production');
    expect(release).toContain('if: always()');
    expect(release).toContain('rm -f');
    expect(release).toContain('concurrency:');
    expect(release).toContain('https://client.ltsd.ro/updates.json');
    expect(release).toContain('pnpm minify:release');
  });
});
