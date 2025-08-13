import js from '@eslint/js';
import prettier from 'eslint-config-prettier';
import importPlugin from 'eslint-plugin-import';
import simpleImportSortPlugin from 'eslint-plugin-simple-import-sort';
import svelte from 'eslint-plugin-svelte';
import unicornPlugin from 'eslint-plugin-unicorn';
import globals from 'globals';
import ts from 'typescript-eslint';

// eslint-disable-next-line import/no-default-export
export default ts.config(
  js.configs.recommended,
  ...ts.configs.recommended,
  ...svelte.configs.recommended,
  prettier,
  ...svelte.configs['flat/prettier'],
  importPlugin.flatConfigs.recommended,
  {
    languageOptions: {
      globals: {
        ...globals.browser,
        ...globals.node,
      },
    },
    plugins: {
      'simple-import-sort': simpleImportSortPlugin,
      unicorn: unicornPlugin,
    },
    rules: {
      curly: ['error', 'all'],
      'import/consistent-type-specifier-style': ['error', 'prefer-top-level'],
      'import/first': 'error',
      'import/newline-after-import': ['error', { considerComments: true }],
      'import/no-default-export': 'error',
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
    files: ['**/*.config.[jt]s'],
    rules: {
      'import/no-default-export': 'off',
    },
  },

  {
    files: ['**/*.[jt]sx'],
    rules: {
      'import/no-default-export': 'off',
      'unicorn/filename-case': ['error', { cases: { kebabCase: true, pascalCase: true } }],
    },
  },

  {
    files: ['**/*.svelte', '**/*.svelte.[jt]s'],
    languageOptions: {
      parserOptions: {
        projectService: true,
        extraFileExtensions: ['.svelte'],
        parser: ts.parser,
      },
    },
    rules: {
      'unicorn/filename-case': ['error', { cases: { kebabCase: true, pascalCase: true } }],
    },
  },
  {
    ignores: ['build/', '.svelte-kit/', 'dist/'],
  },
);
