import js from '@eslint/js';
import eslintReact from '@eslint-react/eslint-plugin';
import prettier from 'eslint-config-prettier';
import importPlugin from 'eslint-plugin-import';
import simpleImportSortPlugin from 'eslint-plugin-simple-import-sort';
import svelte from 'eslint-plugin-svelte';
import globals from 'globals';
import ts from 'typescript-eslint';

const config = ts.config(
  js.configs.recommended,
  ...ts.configs.recommended,
  prettier,
  importPlugin.flatConfigs.recommended,
  importPlugin.flatConfigs.typescript,
  {
    languageOptions: {
      globals: {
        ...globals.browser,
        ...globals.node,
      },
    },
    plugins: {
      '@eslint-react': eslintReact,
      'simple-import-sort': simpleImportSortPlugin,
    },
    rules: {
      curly: ['error', 'all'],
      '@typescript-eslint/consistent-type-imports': 'error',
      'import/consistent-type-specifier-style': ['error', 'prefer-top-level'],
      'import/first': 'error',
      'import/named': 'off',
      'import/namespace': 'off',
      'import/newline-after-import': ['error', { considerComments: true }],
      'import/no-duplicates': 'error',
      'import/no-named-default': 'error',
      'import/no-unresolved': 'off',
      'simple-import-sort/exports': 'error',
      'simple-import-sort/imports': [
        'error',
        {
          groups: [
            [String.raw`^\u0000`],
            [
              '^node:',
              String.raw`^@?\w`,
              '^',
              String.raw`^\.`,
              String.raw`^node:.*\u0000$`,
              String.raw`^@?\w.*\u0000$`,
              String.raw`\u0000$`,
              String.raw`^\..*\u0000$`,
            ],
          ],
        },
      ],
    },
  },
  {
    files: ['**/*.{js,ts}'],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
    },
  },
  {
    files: ['**/*.{jsx,tsx}'],
    rules: {
      '@eslint-react/no-class-component': 'error',
    },
  },
  ...svelte.configs['flat/recommended'],
  {
    files: ['**/*.svelte'],
    languageOptions: {
      parserOptions: {
        parser: ts.parser,
      },
    },
  },
  {
    ignores: [
      '**/node_modules/**',
      '**/dist/**',
      '**/.mearie/**',
      '**/.pnpm-store/**',
      '**/.svelte-kit/**',
      '**/build/**',
      '**/storybook-static/**',
    ],
  },
);

export default config;
