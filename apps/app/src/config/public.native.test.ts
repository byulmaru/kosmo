import assert from 'node:assert/strict';
import { before, describe, it, mock } from 'node:test';
import type { PublicConfig } from './public';

let nativeChannel: 'dev' | 'prod' = 'dev';

mock.module('./nativeChannel', {
  exports: {
    getNativeDeploymentChannel: () => nativeChannel,
  },
} as unknown as Parameters<typeof mock.module>[1]);

let getPublicConfig: <Key extends keyof PublicConfig>(key: Key) => PublicConfig[Key];

before(async () => {
  ({ getPublicConfig } = await import('./public'));
});

describe('Native 공개 client 설정', () => {
  it('native channel override가 fallback보다 우선해 환경 설정을 함께 선택한다', () => {
    const globals = globalThis as typeof globalThis & { __DEV__?: unknown };
    const originalDev = globals.__DEV__;

    try {
      globals.__DEV__ = true;

      for (const [channel, apiOrigin] of [
        ['dev', 'https://dev-api.kos.moe'],
        ['prod', 'https://api.kos.moe'],
      ] as const) {
        nativeChannel = channel;
        assert.equal(getPublicConfig('channel'), channel);
        assert.equal(getPublicConfig('apiOrigin'), apiOrigin);
      }
    } finally {
      if (originalDev === undefined) {
        delete globals.__DEV__;
      } else {
        globals.__DEV__ = originalDev;
      }
    }
  });
});
