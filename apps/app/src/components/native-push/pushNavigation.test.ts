import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { prepareNativePushNavigation } from './pushNavigation';

describe('native push target navigation', () => {
  it('returns the validated destination without switching when the recipient is already selected', async () => {
    const calls: string[] = [];

    const href = await prepareNativePushNavigation({
      href: '/follow-requests',
      recipientProfileId: 'profile-target',
      resetActor: () => calls.push('reset-actor'),
      writeSelectedProfile: async () => {
        calls.push('write-selected-profile');
      },
      selectedProfileId: 'profile-target',
    });

    assert.equal(href, '/follow-requests');
    assert.deepEqual(calls, []);
  });

  it('selects the recipient before returning the payload destination', async () => {
    const calls: string[] = [];

    const href = await prepareNativePushNavigation({
      href: '/@recipient/postId',
      recipientProfileId: 'profile-recipient',
      resetActor: (profileId) => calls.push(`reset:${profileId}`),
      writeSelectedProfile: async (profileId) => {
        calls.push(`write:${profileId}`);
      },
      selectedProfileId: 'profile-current',
    });

    assert.equal(href, '/@recipient/postId');
    assert.deepEqual(calls, ['write:profile-recipient', 'reset:profile-recipient']);
  });

  it('propagates failed profile persistence without resetting the actor', async () => {
    const calls: string[] = [];
    const switchError = new Error('Selected Profile persistence failed');

    await assert.rejects(
      prepareNativePushNavigation({
        href: '/@recipient',
        recipientProfileId: 'profile-recipient',
        resetActor: () => calls.push('reset-actor'),
        writeSelectedProfile: async () => {
          calls.push('write-selected-profile');
          throw switchError;
        },
        selectedProfileId: 'profile-current',
      }),
      switchError,
    );

    assert.deepEqual(calls, ['write-selected-profile']);
  });
});
