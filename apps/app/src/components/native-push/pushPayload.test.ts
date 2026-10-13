import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { parseNativePushTapTarget } from './pushPayload';

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
