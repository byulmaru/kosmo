import js from '@eslint/js';
import eslintReact from '@eslint-react/eslint-plugin';
import prettier from 'eslint-config-prettier';
import importPlugin from 'eslint-plugin-import';
import simpleImportSortPlugin from 'eslint-plugin-simple-import-sort';
import svelte from 'eslint-plugin-svelte';
import globals from 'globals';
import ts from 'typescript-eslint';
import uiContract from './scripts/eslint-ui-contract.mjs';

const appSourceFiles = ['apps/app/src/**/*.{js,jsx,ts,tsx}'];
const appFixtureFiles = [
  'apps/app/src/**/*.test.{js,jsx,ts,tsx}',
  'apps/app/src/**/*.stories.{js,jsx,ts,tsx}',
  'apps/app/src/stories/**',
];
// Existing canonical SVG geometry/asset owners keep file-level value-import access; this does not approve new geometry.
const svgOwnerFiles = [
  'apps/app/src/components/ui/StateView.tsx',
  'apps/app/src/components/ui/BottomTabBarIcon.tsx',
  'apps/app/src/components/ui/RadioGroup.tsx',
  'apps/app/src/components/ui/ColorPickerPanel.tsx',
  'apps/app/src/components/reaction/ReactionPendingSpinner.tsx',
  'apps/app/src/components/post/PostComposer.tsx',
];
const restrictedLucideCustomApi = {
  group: ['lucide-react-native', 'lucide-react-native/*'],
  importNames: ['createLucideIcon', 'Icon'],
  allowTypeImports: true,
  message:
    'Use an existing Lucide glyph; custom icon factories and Icon renderers are not allowed.',
};
const restrictedSvgImports = {
  group: ['react-native-svg', 'react-native-svg/*'],
  allowTypeImports: true,
  message:
    'Use an existing icon asset or canonical SVG owner; new react-native-svg value imports are not allowed.',
};
const iconContractRules = {
  'no-restricted-imports': [
    'error',
    {
      patterns: [restrictedSvgImports, restrictedLucideCustomApi],
    },
  ],
  'no-restricted-syntax': [
    'error',
    {
      selector: "JSXOpeningElement[name.name='svg']",
      message:
        'Use an existing icon asset or canonical component; intrinsic SVG drawing is not allowed.',
    },
  ],
};

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
      'ui-contract': uiContract,
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
      'ui-contract/no-visual-style-overrides': 'error',
    },
  },
  {
    files: appSourceFiles,
    rules: iconContractRules,
  },
  {
    files: svgOwnerFiles,
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [restrictedLucideCustomApi],
        },
      ],
    },
  },
  {
    files: appFixtureFiles,
    rules: {
      'no-restricted-imports': 'off',
      'no-restricted-syntax': 'off',
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
    files: ['**/*.svelte.{js,ts}'],
    languageOptions: {
      parser: ts.parser,
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
