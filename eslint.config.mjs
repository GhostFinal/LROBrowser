import js from '@eslint/js';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  { ignores: ['dist/**', 'generated/**', 'release/**', '.tools/**', '.superpowers/**', 'vendor/**'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
);
