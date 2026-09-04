import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { getPublicConfig } from './public';

describe('공개 client 설정', () => {
  it('Web 채널이 없거나 알 수 없으면 fail closed한다', () => {
    const globals = globalThis as typeof globalThis & { __KOSMO_CHANNEL__?: unknown };
    const originalChannel = globals.__KOSMO_CHANNEL__;
    const originalDocument = Object.getOwnPropertyDescriptor(globalThis, 'document');

    try {
      Object.defineProperty(globalThis, 'document', {
        configurable: true,
        value: {},
      });
      delete globals.__KOSMO_CHANNEL__;
      assert.throws(() => getPublicConfig('apiOrigin'), /valid deployment channel/);

      globals.__KOSMO_CHANNEL__ = 'staging';
      assert.throws(() => getPublicConfig('apiOrigin'), /valid deployment channel/);

      globals.__KOSMO_CHANNEL__ = 'prod';
      assert.equal(getPublicConfig('apiOrigin'), 'https://api.kos.moe');
      assert.equal(getPublicConfig('webOrigin'), 'https://kos.moe');
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
    }
  });

  it('Native development와 release가 각각 dev와 prod의 필요한 값을 선택한다', () => {
    const globals = globalThis as typeof globalThis & {
      __DEV__?: unknown;
      __KOSMO_CHANNEL__?: unknown;
    };
    const originalDev = globals.__DEV__;
    const originalChannel = globals.__KOSMO_CHANNEL__;
    const originalWindow = Object.getOwnPropertyDescriptor(globalThis, 'window');
    const originalDocument = Object.getOwnPropertyDescriptor(globalThis, 'document');

    try {
      Object.defineProperty(globalThis, 'window', {
        configurable: true,
        value: {},
      });
      Reflect.deleteProperty(globalThis, 'document');
      globals.__KOSMO_CHANNEL__ = 'staging';

      globals.__DEV__ = true;
      assert.equal(getPublicConfig('channel'), 'dev');
      assert.equal(getPublicConfig('apiOrigin'), 'https://dev-api.kos.moe');
      assert.equal(getPublicConfig('webOrigin'), 'https://dev.kos.moe');
      assert.equal(getPublicConfig('posthogHost'), undefined);
      assert.equal(getPublicConfig('oidcIssuer'), 'https://id.byulmaru.co');

      globals.__DEV__ = false;
      assert.equal(getPublicConfig('channel'), 'prod');
      assert.equal(getPublicConfig('apiOrigin'), 'https://api.kos.moe');
      assert.equal(getPublicConfig('webOrigin'), 'https://kos.moe');
      assert.equal(getPublicConfig('posthogHost'), 'https://us.i.posthog.com');
      assert.equal(
        getPublicConfig('posthogKey'),
        'phc_vYTsfHrgz8wE6wQv5kfpQM5XPBnKKjvNQgaHabb6zdsS',
      );
      assert.equal(getPublicConfig('nativeOidcClientId'), '01KXCS695QV8DQM8KJJNWFQ94Z');
      assert.equal(
        getPublicConfig('sentryDsn'),
        'https://07f92d1f243d540b91a3edb9e22eafa2@o4507210007117824.ingest.us.sentry.io/4507210010329088',
      );
    } finally {
      if (originalWindow) {
        Object.defineProperty(globalThis, 'window', originalWindow);
      } else {
        Reflect.deleteProperty(globalThis, 'window');
      }
      if (originalDocument) {
        Object.defineProperty(globalThis, 'document', originalDocument);
      } else {
        Reflect.deleteProperty(globalThis, 'document');
      }
      if (originalDev === undefined) {
        delete globals.__DEV__;
      } else {
        globals.__DEV__ = originalDev;
      }
      if (originalChannel === undefined) {
        delete globals.__KOSMO_CHANNEL__;
      } else {
        globals.__KOSMO_CHANNEL__ = originalChannel;
      }
    }
  });
});
