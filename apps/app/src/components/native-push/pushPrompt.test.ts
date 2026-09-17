import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { acceptNativePushPrompt } from './pushPrompt';

describe('native push permission prompt', () => {
  it('keeps completion pending when token synchronization fails', async () => {
    const calls: string[] = [];

    await assert.rejects(
      acceptNativePushPrompt({
        markPromptComplete: async () => {
          calls.push('mark-complete');
        },
        onCompleted: () => {
          calls.push('hide');
        },
        requestPermission: async () => {
          calls.push('request-permission');
        },
        syncPermissionAndToken: async () => {
          calls.push('sync-token');
          throw new Error('token sync failed');
        },
      }),
    );

    assert.deepEqual(calls, ['request-permission', 'sync-token']);
  });

  it('marks the prompt complete and hides it only after synchronization succeeds', async () => {
    const calls: string[] = [];

    await acceptNativePushPrompt({
      markPromptComplete: async () => {
        calls.push('mark-complete');
      },
      onCompleted: () => {
        calls.push('hide');
      },
      requestPermission: async () => {
        calls.push('request-permission');
      },
      syncPermissionAndToken: async () => {
        calls.push('sync-token');
      },
    });

    assert.deepEqual(calls, ['request-permission', 'sync-token', 'mark-complete', 'hide']);
  });
});
