import { transformAsync } from '@babel/core';
import type { Plugin } from 'vite';

export function relayVitePlugin(): Plugin {
  return {
    enforce: 'pre',
    name: 'kosmo-relay',
    async transform(code, id) {
      const filename = id.split('?', 1)[0] ?? id;
      if (
        !filename.includes('/src/') ||
        !/\.[cm]?[jt]sx?$/.test(filename) ||
        !code.includes('graphql`')
      ) {
        return null;
      }

      const result = await transformAsync(code, {
        babelrc: false,
        configFile: false,
        filename,
        parserOpts: { plugins: ['jsx', 'typescript'] },
        plugins: ['relay'],
        sourceMaps: true,
      });

      return result?.code ? { code: result.code, map: result.map ?? null } : null;
    },
  };
}
