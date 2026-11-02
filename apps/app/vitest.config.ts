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
        // Opt in when measuring frames; the default suite keeps RN Web's snapshot timing.
        define: {
          global: 'globalThis',
          ...(process.env.KOSMO_TEST_REAL_MOTION === '1'
            ? { 'process.env.NODE_ENV': JSON.stringify('development') }
            : {}),
        },
        plugins: [
          relayVitePlugin(),
          storybookTest({
            configDir: join(currentDirectory, '.storybook'),
            tags: process.env.KOSMO_TEST_REAL_MOTION === '1' ? {} : { exclude: ['motion'] },
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
