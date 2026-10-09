import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  nativePushResponseKey,
  parseNativePushResponseTapTarget,
  parseNativePushTapTarget,
} from './pushPayload';
import type { NotificationResponse } from 'expo-notifications';

describe('native push tap payloads', () => {
  it('accepts supported internal routes with both notification and recipient IDs', () => {
    for (const href of [
      '/follow-requests',
      '/@follower',
      '/@author/postId',
      '/@author@example.com/postId',
      '/@author/followers',
    ]) {
      assert.deepEqual(
        parseNativePushTapTarget({
          href,
          notificationId: ' RGVmYXVsdE5vdGlmaWNhdGlvbjox ',
          recipientProfileId: ' UHJvZmlsZTox ',
        }),
        {
          href,
          kind: 'profile',
          notificationId: 'RGVmYXVsdE5vdGlmaWNhdGlvbjox',
          recipientProfileId: 'UHJvZmlsZTox',
        },
      );
    }
  });

  it('accepts Account operational destinations without a Profile recipient', () => {
    for (const href of ['/notifications', 'https://any-domain.example/path']) {
      assert.deepEqual(
        parseNativePushTapTarget({
          href,
          notificationId: 'operational-notification',
          recipientAccountId: 'account-1',
        }),
        {
          href: href.startsWith('/') ? { href, kind: 'internal' } : { href, kind: 'external' },
          kind: 'operational',
          notificationId: 'operational-notification',
          recipientAccountId: 'account-1',
        },
      );
    }
  });

  it('rejects missing IDs and missing, external, malformed, or unsupported hrefs', () => {
    assert.equal(
      parseNativePushTapTarget({ notificationId: 'notification', recipientProfileId: 'profile' }),
      null,
    );
    assert.equal(
      parseNativePushTapTarget({ href: '/@author/postId', recipientProfileId: 'profile' }),
      null,
    );
    assert.equal(
      parseNativePushTapTarget({ href: '/@author/postId', notificationId: 'notification' }),
      null,
    );
    assert.equal(
      parseNativePushTapTarget({
        href: '/@author/postId',
        notificationId: 'notification',
        recipientProfileId: ' ',
      }),
      null,
    );

    for (const href of [
      '',
      'https://example.com/@author/postId',
      '//example.com/@author/postId',
      '/settings',
      '/@',
      '/@author/',
      '/@author/../postId',
      '/@author/%2e%2e',
      '/@author/%2fpostId',
      '/@author/%252e%252e',
      '/@author?postId=target',
      '/@author#postId',
      '/@author\\postId',
      '/@author/\u0000',
      '/@author/%',
    ]) {
      assert.equal(
        parseNativePushTapTarget({
          href,
          notificationId: 'notification',
          recipientProfileId: 'profile',
        }),
        null,
        href,
      );
    }

    assert.equal(
      parseNativePushTapTarget({ notificationId: '', recipientProfileId: 'profile', href: '/@' }),
      null,
    );
    assert.equal(
      parseNativePushTapTarget(
        JSON.stringify({
          href: '/@author',
          notificationId: 'notification',
          recipientProfileId: 'profile',
        }),
      ),
      null,
    );
    assert.equal(
      parseNativePushTapTarget({
        navigation: {
          href: '/@author',
          notificationId: 'notification',
          recipientProfileId: 'profile',
        },
      }),
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

  it('recovers iOS push route fields from the raw push trigger payload', () => {
    const response = {
      notification: {
        request: {
          identifier: 'ios-push-1',
          content: {
            data: {},
          },
          trigger: {
            type: 'push',
            payload: {
              href: '/@author/postId',
              notificationId: 'notification',
              recipientProfileId: 'profile',
            },
          },
        },
      },
      actionIdentifier: 'expo.modules.notifications.actions.DEFAULT',
    } as unknown as NotificationResponse;

    assert.deepEqual(parseNativePushResponseTapTarget(response), {
      href: '/@author/postId',
      kind: 'profile',
      notificationId: 'notification',
      recipientProfileId: 'profile',
    });
  });

  it('prefers valid content data and rejects malformed non-push triggers', () => {
    const contentDataResponse = {
      notification: {
        request: {
          identifier: 'ios-push-2',
          content: {
            data: {
              href: '/@content/postId',
              notificationId: 'content-notification',
              recipientProfileId: 'content-profile',
            },
          },
          trigger: {
            type: 'push',
            payload: {
              href: '/@trigger/postId',
              notificationId: 'trigger-notification',
              recipientProfileId: 'trigger-profile',
            },
          },
        },
      },
      actionIdentifier: 'expo.modules.notifications.actions.DEFAULT',
    } as unknown as NotificationResponse;
    assert.deepEqual(parseNativePushResponseTapTarget(contentDataResponse), {
      href: '/@content/postId',
      kind: 'profile',
      notificationId: 'content-notification',
      recipientProfileId: 'content-profile',
    });

    const malformedResponse = {
      notification: {
        request: {
          identifier: 'ios-push-3',
          content: {
            data: { href: '/external', notificationId: '', recipientProfileId: '' },
          },
          trigger: { type: 'calendar' },
        },
      },
      actionIdentifier: 'expo.modules.notifications.actions.DEFAULT',
    } as unknown as NotificationResponse;
    assert.equal(parseNativePushResponseTapTarget(malformedResponse), null);
  });

  it('rejects ambiguous Profile and Account recipient envelopes', () => {
    assert.equal(
      parseNativePushTapTarget({
        href: '/@author',
        notificationId: 'notification',
        recipientAccountId: 'account',
        recipientProfileId: 'profile',
      }),
      null,
    );
  });
});
