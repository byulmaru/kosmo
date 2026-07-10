import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import type { StorybookConfig } from '@storybook/react-vite';

const require = createRequire(import.meta.url);
const sourceDirectory = fileURLToPath(new URL('../src/', import.meta.url));

const config: StorybookConfig = {
  addons: ['@storybook/addon-a11y', '@storybook/addon-vitest'],
  core: { disableTelemetry: true },
  framework: { name: '@storybook/react-vite', options: {} },
  stories: ['../src/**/*.stories.@(ts|tsx)'],
  viteFinal: (viteConfig) => ({
    ...viteConfig,
    resolve: {
      ...viteConfig.resolve,
      alias: [
        { find: /^react-native$/, replacement: require.resolve('react-native-web') },
        {
          find: /^react-relay$/,
          replacement: fileURLToPath(new URL('./mocks/react-relay.tsx', import.meta.url)),
        },
        {
          find: /^expo-router$/,
          replacement: fileURLToPath(new URL('./mocks/expo-router.tsx', import.meta.url)),
        },
        {
          find: /^expo-secure-store$/,
          replacement: fileURLToPath(new URL('./mocks/expo-secure-store.ts', import.meta.url)),
        },
        {
          find: /^react-native-safe-area-context$/,
          replacement: fileURLToPath(new URL('./mocks/safe-area-context.tsx', import.meta.url)),
        },
        { find: /^@\//, replacement: sourceDirectory },
        ...(Array.isArray(viteConfig.resolve?.alias) ? viteConfig.resolve.alias : []),
      ],
      extensions: [
        '.web.mjs',
        '.web.js',
        '.web.mts',
        '.web.ts',
        '.web.jsx',
        '.web.tsx',
        '.mjs',
        '.js',
        '.mts',
        '.ts',
        '.jsx',
        '.tsx',
        '.json',
      ],
    },
  }),
};

export default config;
