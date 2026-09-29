import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  syncPushInstallationToken,
  unregisterDeniedPushInstallation,
} from './pushInstallationLifecycle';

describe('native push installation token sync', () => {
  it('updates an existing installation without registering again', async () => {
    const calls: string[] = [];

    const installationId = await syncPushInstallationToken({
      installationId: 'installation-id',
      registerInstallation: async (token) => {
        calls.push(`register:${token}`);
        return 'registered-id';
      },
      token: 'token-refresh',
      updateInstallation: async (id, token) => {
        calls.push(`update:${id}:${token}`);
      },
    });

    assert.equal(installationId, 'installation-id');
    assert.deepEqual(calls, ['update:installation-id:token-refresh']);
  });

  it('registers a replacement when updating the stored ID fails', async () => {
    const calls: string[] = [];

    const installationId = await syncPushInstallationToken({
      installationId: 'stale-id',
      registerInstallation: async (token) => {
        calls.push(`register:${token}`);
        return 'replacement-id';
      },
      token: 'token-refresh',
      updateInstallation: async (id, token) => {
        calls.push(`update:${id}:${token}`);
        throw new Error('installation unavailable');
      },
    });

    assert.equal(installationId, 'replacement-id');
    assert.deepEqual(calls, ['update:stale-id:token-refresh', 'register:token-refresh']);
  });
});

describe('denied native push installation lifecycle', () => {
  it('unregisters and deletes the local ID when permission is denied', async () => {
    const calls: string[] = [];

    const unregistered = await unregisterDeniedPushInstallation({
      deleteInstallationId: async () => {
        calls.push('delete');
      },
      installationId: 'UGVyc2lzdGVudEluc3RhbGxhdGlvbjox',
      unregisterInstallation: async (id) => {
        calls.push(`unregister:${id}`);
      },
    });

    assert.equal(unregistered, true);
    assert.deepEqual(calls, ['unregister:UGVyc2lzdGVudEluc3RhbGxhdGlvbjox', 'delete']);
  });

  it('does nothing without a stored installation ID', async () => {
    let calls = 0;

    const unregistered = await unregisterDeniedPushInstallation({
      deleteInstallationId: async () => {
        calls += 1;
      },
      installationId: null,
      unregisterInstallation: async () => {
        calls += 1;
      },
    });

    assert.equal(unregistered, false);
    assert.equal(calls, 0);
  });

  it('retains the local ID when unregister is retryable', async () => {
    let deleted = false;

    await assert.rejects(
      unregisterDeniedPushInstallation({
        deleteInstallationId: async () => {
          deleted = true;
        },
        installationId: 'installation-id',
        unregisterInstallation: async () => {
          throw new Error('network unavailable');
        },
      }),
    );

    assert.equal(deleted, false);
  });
});
