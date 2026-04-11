import { defineConfig } from 'eslint/config';
import expoConfig from 'eslint-config-expo/flat.js';
import config from '../../eslint.config.mjs';

export default defineConfig([
  ...config,
  {
    ignores: ['.expo/**'],
  },
  expoConfig,
]);
