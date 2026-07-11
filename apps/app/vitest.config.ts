import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { storybookTest } from '@storybook/addon-vitest/vitest-plugin';
import { playwright } from '@vitest/browser-playwright';
import { defineConfig } from 'vitest/config';
import { relayVitePlugin } from './.storybook/relay-vite-plugin';

const currentDirectory = dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);

export default defineConfig({
  test: {
    projects: [
      {
        extends: true,
        plugins: [
          relayVitePlugin(),
          storybookTest({
            configDir: join(currentDirectory, '.storybook'),
          }),
        ],
        resolve: {
          alias: [
            { find: /^react-native$/, replacement: require.resolve('react-native-web') },
            {
              find: /^react-native-svg$/,
              replacement: require.resolve('react-native-svg/lib/module/elements.web.js'),
            },
            {
              find: /^expo-secure-store$/,
              replacement: join(currentDirectory, '.storybook/mocks/expo-secure-store.ts'),
            },
            {
              find: /^react-native-safe-area-context$/,
              replacement: join(currentDirectory, '.storybook/mocks/safe-area-context.tsx'),
            },
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
        test: {
          browser: {
            enabled: true,
            headless: true,
            instances: [{ browser: 'chromium' }],
            provider: playwright({}),
          },
          name: 'storybook',
        },
      },
    ],
  },
});
