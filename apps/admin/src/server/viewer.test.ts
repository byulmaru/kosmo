import { describe, expect, test } from 'vitest';
import { ANONYMOUS_VIEWER, getViewerFromHeaders } from './viewer';

describe('Admin Console viewer metadata', () => {
  test('uses an anonymous fallback when identity headers are missing', () => {
    expect(getViewerFromHeaders(new Headers())).toEqual({ label: ANONYMOUS_VIEWER });
  });

  test('prefers display name while retaining normalized login metadata', () => {
    const viewer = getViewerFromHeaders(
      new Headers({
        'Tailscale-User-Login': 'viewer@example.com',
        'Tailscale-User-Name': '=?UTF-8?B?7Jq07JiB7J6Q?=',
        'Tailscale-User-Profile-Pic': 'https://example.com/profile.png',
      }),
    );

    expect(viewer).toEqual({ label: '운영자', login: 'viewer@example.com' });
    expect(JSON.stringify(viewer)).not.toContain('profile.png');
  });

  test('decodes a quoted-printable UTF-8 display name', () => {
    expect(
      getViewerFromHeaders(
        new Headers({
          'Tailscale-User-Name': '=?UTF-8?Q?=EC=9A=B4=EC=98=81=EC=9E=90?=',
        }),
      ),
    ).toEqual({ label: '운영자' });
  });

  test('rejects an encoded word with invalid UTF-8 bytes', () => {
    const viewer = getViewerFromHeaders(
      new Headers({
        'Tailscale-User-Login': 'viewer@example.com',
        'Tailscale-User-Name': '=?UTF-8?B?/w==?=',
      }),
    );

    expect(viewer).toEqual({ label: 'viewer@example.com', login: 'viewer@example.com' });
  });

  test.each([
    '=?UTF-8?B?not base64?=',
    '=?UTF-8?Q?bad=XX?=',
    '=?ISO-8859-1?Q?viewer?=',
    '=?UTF-8?Q?unterminated',
  ])('treats malformed display name %s as absent without changing access', (displayName) => {
    const viewer = getViewerFromHeaders(
      new Headers({
        'Tailscale-User-Login': 'viewer@example.com',
        'Tailscale-User-Name': displayName,
      }),
    );

    expect(viewer).toEqual({ label: 'viewer@example.com', login: 'viewer@example.com' });
  });

  test('falls back to normalized login when display name is missing', () => {
    expect(
      getViewerFromHeaders(new Headers({ 'Tailscale-User-Login': 'viewer@example.com' })),
    ).toEqual({ label: 'viewer@example.com', login: 'viewer@example.com' });
  });
});
