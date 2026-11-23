import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { parseNotificationHref } from './notificationHref';

describe('notification hrefs', () => {
  it('keeps app-root paths inside the app', () => {
    assert.deepEqual(parseNotificationHref('/notifications?filter=unread#latest'), {
      href: '/notifications?filter=unread#latest',
      kind: 'internal',
    });
  });

  it('keeps absolute links on the current KOSMO origin inside the app', () => {
    assert.deepEqual(
      parseNotificationHref('https://kos.moe/privacy/changes/2026-10-13?source=notice#latest'),
      {
        href: '/privacy/changes/2026-10-13?source=notice#latest',
        kind: 'internal',
      },
    );
  });

  it('opens other HTTP and HTTPS origins as external destinations', () => {
    assert.deepEqual(parseNotificationHref('https://different.example/path?q=1'), {
      href: 'https://different.example/path?q=1',
      kind: 'external',
    });
    assert.deepEqual(parseNotificationHref('http://localhost:3000/notice'), {
      href: 'http://localhost:3000/notice',
      kind: 'external',
    });
    assert.deepEqual(parseNotificationHref('https://dev.kos.moe/notifications'), {
      href: 'https://dev.kos.moe/notifications',
      kind: 'external',
    });
  });

  it('keeps absolute URLs that cannot be represented as app paths intact', () => {
    assert.deepEqual(parseNotificationHref('https://user:password@kos.moe/path'), {
      href: 'https://user:password@kos.moe/path',
      kind: 'external',
    });
    assert.deepEqual(parseNotificationHref('https://kos.moe//path'), {
      href: 'https://kos.moe//path',
      kind: 'external',
    });
  });

  it('normalizes root-relative paths and rejects protocol-relative or origin-changing paths', () => {
    assert.deepEqual(parseNotificationHref('/notifications/../settings'), {
      href: '/settings',
      kind: 'internal',
    });
    assert.deepEqual(parseNotificationHref('/%2f%2fevil.example'), {
      href: '/%2f%2fevil.example',
      kind: 'internal',
    });
    assert.deepEqual(parseNotificationHref('/profile\\settings'), {
      href: '/profile/settings',
      kind: 'internal',
    });
    assert.equal(parseNotificationHref('/\\\\evil.example/path'), null);
  });

  it('rejects executable schemes, protocol-relative URLs, ASCII controls, and malformed URLs', () => {
    for (const value of [
      'javascript:alert(1)',
      'data:text/html,hello',
      'file:///etc/passwd',
      '//different.example/path',
      'https://different.example/path\n',
      'https://',
    ]) {
      assert.equal(parseNotificationHref(value), null, value);
    }
  });
});
