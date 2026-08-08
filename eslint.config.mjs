import js from '@eslint/js';
import eslintReact from '@eslint-react/eslint-plugin';
import prettier from 'eslint-config-prettier';
import importPlugin from 'eslint-plugin-import';
import simpleImportSortPlugin from 'eslint-plugin-simple-import-sort';
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
      '@eslint-react/no-class-component': 'error',
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
    files: [
      'apps/api/src/graphql/resolvers/post/**/*.ts',
      'apps/api/src/graphql/resolvers/bookmark/**/*.ts',
      'apps/api/src/graphql/resolvers/reaction/**/*.ts',
      'apps/api/src/graphql/resolvers/notification/access/visibility.ts',
      'apps/api/src/graphql/resolvers/notification/field/profile.ts',
      'apps/api/src/graphql/resolvers/notification/mutation/mark-read.ts',
      'apps/api/src/graphql/resolvers/notification/ref.ts',
    ],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          paths: [
            {
              name: '@kosmo/core/db',
              importNames: ['db'],
              message: 'Use the GraphQL operation database handle from ctx.db.',
            },
          ],
        },
      ],
      'no-restricted-syntax': [
        'error',
        ...[
          'addReaction',
          'createBookmark',
          'createPost',
          'deleteBookmark',
          'deletePost',
          'deleteReaction',
          'repostPost',
        ].map((name) => ({
          selector: `CallExpression[callee.name='${name}'][arguments.length=1]`,
          message: `${name} must receive the GraphQL operation database handle.`,
        })),
        {
          selector: "CallExpression[callee.property.name='postCommit'][arguments.length=0]",
          message: 'PostCommit must receive the GraphQL operation database handle.',
        },
      ],
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
