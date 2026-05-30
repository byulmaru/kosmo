import { fileURLToPath } from 'node:url';
import type { StorybookConfig } from '@storybook/sveltekit';

process.env.STORYBOOK = 'true';

type NamedPlugin = { name?: string };
type AliasEntry = { find: string; replacement: string };

const mearieMockPath = fileURLToPath(new URL('./mocks/mearie.ts', import.meta.url));

const withoutMeariePlugin = <T>(plugins: T): T => {
  if (!Array.isArray(plugins)) {
    return plugins;
  }

  return plugins.flatMap((plugin) => {
    if (Array.isArray(plugin)) {
      return withoutMeariePlugin(plugin);
    }

    if (plugin && typeof plugin === 'object' && (plugin as NamedPlugin).name === 'mearie') {
      return [];
    }

    return [plugin];
  }) as T;
};

const withMearieAlias = <T>(alias: T): T | Record<string, string> | AliasEntry[] => {
  if (Array.isArray(alias)) {
    return [{ find: '$mearie', replacement: mearieMockPath }, ...alias];
  }

  return {
    ...(alias ?? {}),
    $mearie: mearieMockPath,
  };
};

const config: StorybookConfig = {
  stories: ['../src/**/*.stories.@(js|jsx|mjs|ts|tsx|svelte)'],
  addons: [
    '@storybook/addon-svelte-csf',
    '@storybook/addon-docs',
    '@storybook/addon-a11y',
    '@storybook/addon-vitest',
  ],
  framework: {
    name: '@storybook/sveltekit',
    options: {},
  },
  core: {
    disableTelemetry: true,
  },
  staticDirs: ['../static'],
  viteFinal: (config) => ({
    ...config,
    plugins: withoutMeariePlugin(config.plugins),
    resolve: {
      ...config.resolve,
      alias: withMearieAlias(config.resolve?.alias),
    },
  }),
};

export default config;
