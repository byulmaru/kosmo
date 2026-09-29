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
      selectProfile: async () => {
        calls.push('select-profile');
        return 'profile-target';
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
      selectProfile: async (profileId) => {
        calls.push(`select:${profileId}`);
        return profileId;
      },
      selectedProfileId: 'profile-current',
    });

    assert.equal(href, '/@recipient/postId');
    assert.deepEqual(calls, ['select:profile-recipient', 'reset:profile-recipient']);
  });

  it('propagates a failed profile switch without resetting the actor', async () => {
    const calls: string[] = [];
    const switchError = new Error('Profile is not available to this account');

    await assert.rejects(
      prepareNativePushNavigation({
        href: '/@recipient',
        recipientProfileId: 'profile-recipient',
        resetActor: () => calls.push('reset-actor'),
        selectProfile: async () => {
          calls.push('select-profile');
          throw switchError;
        },
        selectedProfileId: 'profile-current',
      }),
      switchError,
    );

    assert.deepEqual(calls, ['select-profile']);
  });
});
