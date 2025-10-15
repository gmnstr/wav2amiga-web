import js from '@eslint/js';
import prettier from 'eslint-config-prettier';
import globals from 'globals';

export default [
  js.configs.recommended,
  prettier,
  {
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      globals: {
        ...globals.node,
        ...globals.es2022,
      },
    },
  },
  {
    ignores: [
      'node_modules/',
      'dist/',
      'out/',
      'coverage/',
      '*.min.js',
      '**/dist/**',
    ],
  },
];
