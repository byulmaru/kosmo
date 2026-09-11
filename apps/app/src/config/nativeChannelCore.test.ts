import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  isNativeChannel,
  NATIVE_CHANNEL_HEADER,
  switchNativeChannelWithClient,
} from './nativeChannelCore';
import type { NativeChannel, NativeUpdatesClient } from './nativeChannelCore';

function createClient({
  channel = 'prod' as NativeChannel,
  fetchUpdateAsync = async () => ({ isNew: true }),
  reloadAsync = async () => undefined,
  restoreOverrideThrows = false,
}: {
  channel?: NativeChannel;
  fetchUpdateAsync?: NativeUpdatesClient['fetchUpdateAsync'];
  reloadAsync?: NativeUpdatesClient['reloadAsync'];
  restoreOverrideThrows?: boolean;
} = {}) {
  const calls: Array<Record<string, string> | null | 'fetch' | 'reload'> = [];
  const client: NativeUpdatesClient = {
    channel,
    fetchUpdateAsync: async () => {
      calls.push('fetch');
      return fetchUpdateAsync();
    },
    reloadAsync: async () => {
      calls.push('reload');
      return reloadAsync();
    },
    setUpdateRequestHeadersOverride: (headers) => {
      calls.push(headers);
      if (restoreOverrideThrows && headers?.[NATIVE_CHANNEL_HEADER] === channel) {
        throw new Error('restore failed');
      }
    },
  };
  return { calls, client };
}

describe('native channel switching', () => {
  it('accepts only the two configured channels', () => {
    assert.equal(isNativeChannel('dev'), true);
    assert.equal(isNativeChannel('prod'), true);
    assert.equal(isNativeChannel('staging'), false);
    assert.equal(NATIVE_CHANNEL_HEADER, 'expo-channel-name');
  });

  it('does nothing when the selected channel is already active', async () => {
    const { calls, client } = createClient();
    const sessionCleared: string[] = [];

    const result = await switchNativeChannelWithClient(
      'prod',
      async () => {
        sessionCleared.push('clear');
      },
      client,
    );

    assert.equal(result, 'unchanged');
    assert.deepEqual(calls, []);
    assert.deepEqual(sessionCleared, []);
  });

  it('downloads the target channel, clears the old session, then reloads', async () => {
    const events: string[] = [];
    const { calls, client } = createClient({
      fetchUpdateAsync: async () => {
        events.push('fetch');
        return { isNew: true };
      },
      reloadAsync: async () => {
        events.push('reload');
      },
    });

    const result = await switchNativeChannelWithClient(
      'dev',
      async () => {
        events.push('clear-session');
      },
      client,
    );

    assert.equal(result, 'reloading');
    assert.deepEqual(calls, [{ [NATIVE_CHANNEL_HEADER]: 'dev' }, 'fetch', 'reload']);
    assert.deepEqual(events, ['fetch', 'clear-session', 'reload']);
  });

  it('restores the original channel when no compatible update is downloaded', async () => {
    const { calls, client } = createClient({ fetchUpdateAsync: async () => ({ isNew: false }) });
    let cleared = false;

    const result = await switchNativeChannelWithClient(
      'dev',
      async () => {
        cleared = true;
      },
      client,
    );

    assert.equal(result, 'failed');
    assert.deepEqual(calls, [
      { [NATIVE_CHANNEL_HEADER]: 'dev' },
      'fetch',
      { [NATIVE_CHANNEL_HEADER]: 'prod' },
    ]);
    assert.equal(cleared, false);
  });

  it('restores the original channel when fetching, clearing, or reloading fails', async () => {
    for (const failure of ['fetch', 'clear', 'reload'] as const) {
      const { calls, client } = createClient({
        fetchUpdateAsync:
          failure === 'fetch'
            ? async () => {
                throw new Error('fetch failed');
              }
            : undefined,
        reloadAsync:
          failure === 'reload'
            ? async () => {
                throw new Error('reload failed');
              }
            : undefined,
      });

      const result = await switchNativeChannelWithClient(
        'dev',
        async () => {
          if (failure === 'clear') {
            throw new Error('clear failed');
          }
        },
        client,
      );

      assert.equal(result, 'failed', failure);
      assert.deepEqual(calls.at(-1), { [NATIVE_CHANNEL_HEADER]: 'prod' }, failure);
    }
  });

  it('keeps the switch failed without clearing or reloading when restoring the channel fails', async () => {
    let clearCalls = 0;
    let reloadCalls = 0;
    const { calls, client } = createClient({
      fetchUpdateAsync: async () => ({ isNew: false }),
      reloadAsync: async () => {
        reloadCalls += 1;
      },
      restoreOverrideThrows: true,
    });

    const result = await switchNativeChannelWithClient(
      'dev',
      async () => {
        clearCalls += 1;
      },
      client,
    );

    assert.equal(result, 'failed');
    assert.deepEqual(calls, [
      { [NATIVE_CHANNEL_HEADER]: 'dev' },
      'fetch',
      { [NATIVE_CHANNEL_HEADER]: 'prod' },
    ]);
    assert.equal(clearCalls, 0);
    assert.equal(reloadCalls, 0);
  });
});
