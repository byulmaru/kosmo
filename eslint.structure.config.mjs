import importPlugin from 'eslint-plugin-import';
import ts from 'typescript-eslint';

export default [
  {
    ignores: [
      '**/__generated__/**',
      '**/.svelte-kit/**',
      '**/dist/**',
      '**/fixtures/**',
      '**/stories/**',
      '**/test-fixtures/**',
      '**/tests/**',
      '**/*.{integration,spec,stories,test}.{ts,tsx}',
      '**/test-*.ts',
    ],
  },
  {
    files: ['apps/*/src/**/*.{ts,tsx}', 'packages/*/**/*.{ts,tsx}'],
    languageOptions: { parser: ts.parser },
    plugins: { import: importPlugin },
    settings: {
      ...importPlugin.flatConfigs.typescript.settings,
      'import/internal-regex': '^@kosmo/',
      'import/resolver': {
        typescript: {
          project: ['tsconfig.json', 'apps/api/tsconfig.json', 'apps/app/tsconfig.json'],
        },
      },
    },
    rules: {
      'import/no-cycle': ['error', { ignoreExternal: true }],
      'import/no-relative-packages': 'error',
    },
  },
  {
    files: ['apps/api/src/graphql/resolvers/**/*.ts'],
    ignores: ['apps/api/src/graphql/resolvers/index.ts'],
    rules: {
      'import/no-restricted-paths': [
        'error',
        {
          zones: [
            {
              target: './apps/api/src/graphql/resolvers',
              from: './apps/api/src/graphql/resolvers/*/index.ts',
              message: 'Import the GraphQL type reference from ref.ts.',
            },
          ],
        },
      ],
    },
  },
];
