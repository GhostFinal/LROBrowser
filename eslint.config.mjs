import js from '@eslint/js';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  { ignores: ['dist/**', 'generated/**', 'release/**', '.tools/**', '.superpowers/**', 'vendor/**'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  // Preserve the imported standard edition's style during the first port.
  // Undefined globals and runtime errors are still checked, as are all adapters.
  { files: ['src/assistant/lro-assistant-standard.mjs'], rules: {
    '@typescript-eslint/no-unused-vars': 'off',
    '@typescript-eslint/no-this-alias': 'off',
    'no-useless-escape': 'off',
    'no-empty': ['error', { allowEmptyCatch: true }],
  } },
);
