import js from '@eslint/js';
import tseslint from '@typescript-eslint/eslint-plugin';
import tsParser from '@typescript-eslint/parser';
import prettier from 'eslint-config-prettier';
import globals from 'globals';

export default [
  js.configs.recommended,
  prettier,
  {
    files: ["**/*.ts", "**/*.tsx", "**/*.mts"],
    languageOptions: {
      parser: tsParser,
      ecmaVersion: 'latest',
      sourceType: 'module',
      globals: {
        ...globals.node,
        ...globals.es2022,
      },
    },
    plugins: {
      '@typescript-eslint': tseslint,
    },
    rules: {
      // Keep it lean; rely on TS compiler for type issues
      'no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
    },
  },
  // Browser globals for web app
  {
    files: ["apps/web/**/*.{ts,tsx,js}"],
    languageOptions: {
      globals: {
        ...globals.browser,
      },
    },
  },
  {
    ignores: [
      'node_modules/',
      'out/',
      'coverage/',
      '*.min.js',
      '**/dist/**',
    ],
  },
];
