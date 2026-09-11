import assert from 'node:assert/strict';
import { before, beforeEach, describe, it, mock } from 'node:test';
import type * as NativeChannelModule from './nativeChannel.native';

type UpdatesMock = {
  channel: string | null;
  fetchUpdateAsync: () => Promise<{ isNew: boolean }>;
  reloadAsync: () => Promise<void>;
  setUpdateRequestHeadersOverride: (headers: Record<string, string> | null) => void;
};

let channel: string | null = 'prod';
let fetchUpdate!: UpdatesMock['fetchUpdateAsync'];
let reload!: UpdatesMock['reloadAsync'];
let setOverride!: UpdatesMock['setUpdateRequestHeadersOverride'];
const updates: UpdatesMock = {
  get channel() {
    return channel;
  },
  fetchUpdateAsync: () => fetchUpdate(),
  reloadAsync: () => reload(),
  setUpdateRequestHeadersOverride: (headers) => setOverride(headers),
};

mock.module('expo-updates', {
  exports: updates,
} as unknown as Parameters<typeof mock.module>[1]);

let getNativeDeploymentChannel: typeof NativeChannelModule.getNativeDeploymentChannel;
let switchNativeChannel: typeof NativeChannelModule.switchNativeChannel;

before(async () => {
  ({ getNativeDeploymentChannel, switchNativeChannel } = await import('./nativeChannel.native'));
});

beforeEach(() => {
  channel = 'prod';
});

describe('native channel', () => {
  it('reads configured channels and keeps development fallback', () => {
    const globals = globalThis as typeof globalThis & { __DEV__?: unknown };
    const originalDev = globals.__DEV__;

    try {
      channel = 'dev';
      assert.equal(getNativeDeploymentChannel(), 'dev');
      channel = 'prod';
      assert.equal(getNativeDeploymentChannel(), 'prod');
      channel = null;
      globals.__DEV__ = true;
      assert.equal(getNativeDeploymentChannel(), 'dev');
      globals.__DEV__ = false;
      assert.equal(getNativeDeploymentChannel(), 'prod');
      channel = 'staging';
      assert.throws(() => getNativeDeploymentChannel(), /valid native update channel/);
    } finally {
      if (originalDev === undefined) {
        delete globals.__DEV__;
      } else {
        globals.__DEV__ = originalDev;
      }
    }
  });

  it('does nothing for the current channel', async () => {
    fetchUpdate = async () => assert.fail('fetch should not run');
    reload = async () => assert.fail('reload should not run');
    setOverride = () => assert.fail('override should not run');
    const clearSession = async () => assert.fail('session should not clear');

    assert.equal(await switchNativeChannel('prod', clearSession), 'unchanged');
  });

  it('downloads before clearing the session and reloading', async () => {
    const events: string[] = [];
    const fetchGate = Promise.withResolvers<void>();
    const clearGate = Promise.withResolvers<void>();
    const clearStarted = Promise.withResolvers<void>();
    setOverride = (headers) => {
      events.push(`header:${headers?.['expo-channel-name']}`);
    };
    fetchUpdate = async () => {
      events.push('fetch-start');
      await fetchGate.promise;
      events.push('fetch-done');
      return { isNew: true };
    };
    reload = async () => {
      events.push('reload');
    };

    const switchPromise = switchNativeChannel('dev', async () => {
      events.push('clear-start');
      clearStarted.resolve();
      await clearGate.promise;
      events.push('clear-done');
    });

    assert.deepEqual(events, ['header:dev', 'fetch-start']);
    fetchGate.resolve();
    await clearStarted.promise;
    assert.deepEqual(events, ['header:dev', 'fetch-start', 'fetch-done', 'clear-start']);

    clearGate.resolve();
    assert.equal(await switchPromise, 'reloading');
    assert.deepEqual(events, [
      'header:dev',
      'fetch-start',
      'fetch-done',
      'clear-start',
      'clear-done',
      'reload',
    ]);
  });

  it('restores the original channel when switching fails', async () => {
    for (const failure of ['no-update', 'fetch', 'clear', 'reload'] as const) {
      const events: string[] = [];
      setOverride = (headers) => {
        events.push(`header:${headers?.['expo-channel-name']}`);
      };
      fetchUpdate = async () => {
        events.push('fetch');
        if (failure === 'no-update') {
          return { isNew: false };
        }
        if (failure === 'fetch') {
          throw new Error('fetch failed');
        }
        return { isNew: true };
      };
      reload = async () => {
        events.push('reload');
        if (failure === 'reload') {
          throw new Error('reload failed');
        }
      };

      const result = await switchNativeChannel('dev', async () => {
        events.push('clear-session');
        if (failure === 'clear') {
          throw new Error('clear failed');
        }
      });

      assert.equal(result, 'failed', failure);
      const expectedEvents = {
        'no-update': ['header:dev', 'fetch', 'header:prod'],
        fetch: ['header:dev', 'fetch', 'header:prod'],
        clear: ['header:dev', 'fetch', 'clear-session', 'header:prod'],
        reload: ['header:dev', 'fetch', 'clear-session', 'reload', 'header:prod'],
      }[failure];
      assert.deepEqual(events, expectedEvents, failure);
    }
  });
});
