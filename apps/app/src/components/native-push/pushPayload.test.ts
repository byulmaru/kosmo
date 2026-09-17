import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  markNativePushRoute,
  nativePushNotificationTargetHref,
  nativePushResponseKey,
  notificationDataFromResponse,
  parseNativePushTapTarget,
} from './pushPayload';
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

  it('marks a derived direct route for deleted or inaccessible target fallback', () => {
    assert.equal(markNativePushRoute('/@author/post:target'), '/@author/post:target?fromPush=1');
    assert.equal(
      markNativePushRoute('/@author/post:target?tab=thread'),
      '/@author/post:target?tab=thread&fromPush=1',
    );
  });

  it('preserves fromPush across pure repost and canonical handle redirects', () => {
    const pureRepostRedirect = markNativePushRoute('/@source/post:source');
    const canonicalHandleRedirect = markNativePushRoute('/@canonical/post:source');

    assert.equal(pureRepostRedirect, '/@source/post:source?fromPush=1');
    assert.equal(canonicalHandleRedirect, '/@canonical/post:source?fromPush=1');
    assert.equal(markNativePushRoute(pureRepostRedirect), pureRepostRedirect);
    assert.equal(markNativePushRoute(canonicalHandleRedirect), canonicalHandleRedirect);
  });

  it('reads Expo response data and provides a stable duplicate key', () => {
    const response = {
      actionIdentifier: 'expo.modules.notifications.actions.DEFAULT',
      notification: {
        request: {
          content: {
            data: {
              notificationId: 'notification-1',
              recipientProfileId: 'profile-global-id',
            },
          },
          identifier: 'notification-1',
        },
      },
    };

    assert.deepEqual(notificationDataFromResponse(response), {
      notificationId: 'notification-1',
      recipientProfileId: 'profile-global-id',
    });
    assert.equal(
      nativePushResponseKey(response),
      'notification-1:expo.modules.notifications.actions.DEFAULT',
    );
  });
});
