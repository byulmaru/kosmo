import assert from 'node:assert/strict';
import { before, describe, it, mock } from 'node:test';
import type { PublicConfig } from './public';

type NativeChannel = 'dev' | 'prod';

let nativeChannel: NativeChannel = 'dev';

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
    const globals = globalThis as typeof globalThis & {
      __DEV__?: unknown;
      __KOSMO_CHANNEL__?: unknown;
    };
    const originalDev = globals.__DEV__;
    const originalChannel = globals.__KOSMO_CHANNEL__;
    const originalDocument = Object.getOwnPropertyDescriptor(globalThis, 'document');

    try {
      Reflect.deleteProperty(globalThis, 'document');
      globals.__KOSMO_CHANNEL__ = 'staging';

      for (const [channel, apiOrigin, webOrigin] of [
        ['dev', 'https://dev-api.kos.moe', 'https://dev.kos.moe'],
        ['prod', 'https://api.kos.moe', 'https://kos.moe'],
      ] as const) {
        nativeChannel = channel;
        globals.__DEV__ = channel === 'dev' ? false : true;

        assert.deepEqual(
          {
            apiOrigin: getPublicConfig('apiOrigin'),
            channel: getPublicConfig('channel'),
            oidcClientId: getPublicConfig('oidcClientId'),
            oidcIssuer: getPublicConfig('oidcIssuer'),
            sentryDsn: getPublicConfig('sentryDsn'),
            webOrigin: getPublicConfig('webOrigin'),
          },
          {
            apiOrigin,
            channel,
            oidcClientId: '01KQM0S7HGTVJNZA6TTTK8T5NM',
            oidcIssuer: 'https://id.byulmaru.co',
            sentryDsn:
              'https://07f92d1f243d540b91a3edb9e22eafa2@o4507210007117824.ingest.us.sentry.io/4507210010329088',
            webOrigin,
          },
        );
      }
    } finally {
      if (originalDocument) {
        Object.defineProperty(globalThis, 'document', originalDocument);
      } else {
        Reflect.deleteProperty(globalThis, 'document');
      }
      if (originalChannel === undefined) {
        delete globals.__KOSMO_CHANNEL__;
      } else {
        globals.__KOSMO_CHANNEL__ = originalChannel;
      }
      if (originalDev === undefined) {
        delete globals.__DEV__;
      } else {
        globals.__DEV__ = originalDev;
      }
    }
  });
});
