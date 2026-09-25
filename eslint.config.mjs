import js from '@eslint/js';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  { ignores: ['dist/**', '.staging/**', 'release/**', '.tools/**', '.superpowers/**'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
);
