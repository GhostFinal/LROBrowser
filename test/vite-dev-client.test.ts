import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';
import { stripViteClientInjection } from '../vite.config';

describe('IWA development entry', () => {
  it('removes Vite HMR client injection while preserving the app module', () => {
    const html = [
      '<head>',
      '<script type="module" src="/@vite/client"></script>',
      '<script type="module" src="/src/main.ts"></script>',
      '</head>',
    ].join('\n');

    const transformed = stripViteClientInjection(html);

    expect(transformed).not.toContain('/@vite/client');
    expect(transformed).toContain('/src/main.ts');
  });

  it('loads the stylesheet without a CSS-module HMR client import', async () => {
    const html = await readFile('index.html', 'utf8');
    const main = await readFile('src/main.ts', 'utf8');

    expect(html).toContain('href="/src/styles.css"');
    expect(main).not.toContain("import './styles.css'");
  });
});
