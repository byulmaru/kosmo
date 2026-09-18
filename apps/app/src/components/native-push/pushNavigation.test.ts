import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { prepareNativePushNavigation } from './pushNavigation';
import type { NativePushNotificationTargetQuery$data } from './__generated__/NativePushNotificationTargetQuery.graphql';

const targetNode = (value: unknown) => value as NativePushNotificationTargetQuery$data['node'];

describe('native push target navigation', () => {
  it('falls back without selecting or resetting a Profile when the target is unavailable', async () => {
    const calls: string[] = [];

    const href = await prepareNativePushNavigation({
      node: null,
      recipientProfileId: 'profile-target',
      resetActor: () => calls.push('reset-actor'),
      selectProfile: async () => {
        calls.push('select-profile');
        return 'profile-target';
      },
      selectedProfileId: 'profile-current',
    });

    assert.equal(href, null);
    assert.deepEqual(calls, []);
  });

  it('selects the recipient only after deriving a valid target route', async () => {
    const calls: string[] = [];

    const href = await prepareNativePushNavigation({
      node: targetNode({
        __typename: 'FollowNotification',
        profile: { relativeHandle: '@recipient' },
      }),
      recipientProfileId: 'profile-recipient',
      resetActor: (profileId) => calls.push(`reset:${profileId}`),
      selectProfile: async (profileId) => {
        calls.push(`select:${profileId}`);
        return profileId;
      },
      selectedProfileId: 'profile-current',
    });

    assert.equal(href, '/@recipient?fromPush=1');
    assert.deepEqual(calls, ['select:profile-recipient', 'reset:profile-recipient']);
  });
});
