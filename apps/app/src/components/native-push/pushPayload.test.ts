import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  nativePushNotificationTargetHref,
  nativePushResponseKey,
  parseNativePushTapTarget,
} from './pushPayload';
import type { NotificationResponse } from 'expo-notifications';
import type { NativePushNotificationTargetQuery$data } from './__generated__/NativePushNotificationTargetQuery.graphql';

const targetNode = (value: unknown) => value as NativePushNotificationTargetQuery$data['node'];

describe('native push tap payloads', () => {
  it('accepts only the exact non-empty notification envelope', () => {
    assert.deepEqual(
      parseNativePushTapTarget({
        notificationId: ' RGVmYXVsdE5vdGlmaWNhdGlvbjox ',
        recipientProfileId: ' UHJvZmlsZTox ',
        targetHref: '/untrusted-route',
      }),
      {
        notificationId: 'RGVmYXVsdE5vdGlmaWNhdGlvbjox',
        recipientProfileId: 'UHJvZmlsZTox',
      },
    );
    assert.equal(
      parseNativePushTapTarget({ notificationId: '', recipientProfileId: 'profile' }),
      null,
    );
    assert.equal(
      parseNativePushTapTarget({ notificationId: 'notification', recipientProfileId: ' ' }),
      null,
    );
    assert.equal(
      parseNativePushTapTarget({ href: '/untrusted-route', recipientProfileId: 'profile' }),
      null,
    );
    assert.equal(
      parseNativePushTapTarget(
        JSON.stringify({ notificationId: 'notification', recipientProfileId: 'profile' }),
      ),
      null,
    );
    assert.equal(
      parseNativePushTapTarget({
        navigation: { notificationId: 'notification', recipientProfileId: 'profile' },
      }),
      null,
    );
  });

  it('maps every supported revalidated Notification Node to its existing route', () => {
    assert.equal(
      nativePushNotificationTargetHref(
        targetNode({
          __typename: 'FollowNotification',
          profile: { relativeHandle: '@follower' },
        }),
      ),
      '/@follower',
    );
    assert.equal(
      nativePushNotificationTargetHref(
        targetNode({ __typename: 'FollowRequestNotification', id: 'notification:request' }),
      ),
      '/follow-requests',
    );
    for (const typename of [
      'ReactionNotification',
      'RepostNotification',
      'ReplyNotification',
    ] as const) {
      assert.equal(
        nativePushNotificationTargetHref(
          targetNode({
            __typename: typename,
            post: { id: 'post:target', profile: { relativeHandle: '@author' } },
          }),
        ),
        '/@author/post:target',
      );
    }
  });

  it('falls back for null or unsupported revalidated targets', () => {
    assert.equal(nativePushNotificationTargetHref(null), null);
    assert.equal(nativePushNotificationTargetHref(targetNode({ __typename: '%other' })), null);
    assert.equal(
      nativePushNotificationTargetHref(
        targetNode({ __typename: 'FollowNotification', profile: { relativeHandle: '' } }),
      ),
      null,
    );
  });

  it('uses the Expo notification identifier and action for duplicate keys', () => {
    const response = {
      actionIdentifier: 'expo.modules.notifications.actions.DEFAULT',
      notification: {
        request: {
          identifier: 'notification-1',
        },
      },
    } as NotificationResponse;

    assert.equal(
      nativePushResponseKey(response),
      'notification-1:expo.modules.notifications.actions.DEFAULT',
    );
  });
});
