import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { unregisterDeniedPushInstallation } from './pushInstallationLifecycle';

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
