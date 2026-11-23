import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { resolveAppLink } from './appLink';

describe('app links', () => {
  it('keeps app-root paths inside the app', () => {
    assert.deepEqual(resolveAppLink('/notifications?filter=unread#latest'), {
      href: '/notifications?filter=unread#latest',
      kind: 'internal',
    });
  });

  it('keeps absolute links on the current KOSMO origin inside the app', () => {
    assert.deepEqual(
      resolveAppLink('https://kos.moe/privacy/changes/2026-10-13?source=notice#latest'),
      {
        href: '/privacy/changes/2026-10-13?source=notice#latest',
        kind: 'internal',
      },
    );
  });

  it('opens other HTTP and HTTPS origins as external destinations', () => {
    assert.deepEqual(resolveAppLink('https://different.example/path?q=1'), {
      href: 'https://different.example/path?q=1',
      kind: 'external',
    });
    assert.deepEqual(resolveAppLink('http://localhost:3000/notice'), {
      href: 'http://localhost:3000/notice',
      kind: 'external',
    });
    assert.deepEqual(resolveAppLink('https://dev.kos.moe/notifications'), {
      href: 'https://dev.kos.moe/notifications',
      kind: 'external',
    });
  });

  it('keeps absolute URLs that cannot be represented as app paths intact', () => {
    assert.deepEqual(resolveAppLink('https://user:password@kos.moe/path'), {
      href: 'https://user:password@kos.moe/path',
      kind: 'external',
    });
    assert.deepEqual(resolveAppLink('https://kos.moe//path'), {
      href: 'https://kos.moe//path',
      kind: 'external',
    });
  });

  it('normalizes root-relative paths and rejects protocol-relative or origin-changing paths', () => {
    assert.deepEqual(resolveAppLink('/notifications/../settings'), {
      href: '/settings',
      kind: 'internal',
    });
    assert.deepEqual(resolveAppLink('/%2f%2fevil.example'), {
      href: '/%2f%2fevil.example',
      kind: 'internal',
    });
    assert.deepEqual(resolveAppLink('/profile\\settings'), {
      href: '/profile/settings',
      kind: 'internal',
    });
    assert.equal(resolveAppLink('/\\\\evil.example/path'), null);
    assert.equal(resolveAppLink('/.//path'), null);
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
      assert.equal(resolveAppLink(value), null, value);
    }
  });
});
