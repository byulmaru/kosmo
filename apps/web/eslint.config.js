import config from '@kosmo/eslint-config';
import svelteConfig from './svelte.config';

export default [
  ...config,

  {
    files: ['**/*.svelte'],
    languageOptions: {
      parserOptions: {
        svelteConfig,
      },
    },
    rules: {
      'svelte/sort-attributes': 'error',
      'svelte/block-lang': ['error', { script: 'ts' }],
      'svelte/require-each-key': 'error',
      'svelte/valid-each-key': 'error',
      'svelte/shorthand-directive': 'error',
      'svelte/shorthand-attribute': 'error',
    },
  },
  {
    ignores: ['.svelte-kit/*'],
  },
];
