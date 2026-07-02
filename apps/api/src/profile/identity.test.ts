import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { formatRelativeHandle, isConfiguredLocalProfile } from './identity';

const localInstance = {
  domain: 'kosmo.local',
  id: 'local-instance',
};

describe('profile identity helpers', () => {
  it('formats configured local profile handles without a host', () => {
    assert.equal(
      formatRelativeHandle(
        { handle: 'alice', instanceId: localInstance.id },
        { configuredLocalInstance: localInstance },
      ),
      '@alice',
    );
  });

  it('keeps legacy profiles without instance_id local-compatible', () => {
    assert.equal(
      formatRelativeHandle(
        { handle: 'alice', instanceId: null },
        { configuredLocalInstance: localInstance },
      ),
      '@alice',
    );
    assert.equal(isConfiguredLocalProfile({ instanceId: null }, localInstance), true);
  });

  it('formats profiles outside the configured local instance with their instance domain', () => {
    assert.equal(
      formatRelativeHandle(
        { handle: 'alice', instanceId: 'remote-instance' },
        {
          configuredLocalInstance: localInstance,
          profileInstance: { domain: 'remote.example', id: 'remote-instance' },
        },
      ),
      '@alice@remote.example',
    );
    assert.equal(isConfiguredLocalProfile({ instanceId: 'remote-instance' }, localInstance), false);
  });
});
