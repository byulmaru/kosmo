import { describe, expect, test } from 'vitest';
import { getViewerFromHeaders } from './viewer';

describe('Admin Console viewer metadata', () => {
  test('normalizes single B/Q display names and ignores profile pictures', () => {
    const headers = new Headers({
      'Tailscale-User-Login': 'viewer@example.com',
      'Tailscale-User-Name': '=?UTF-8?B?7Jq07JiB7J6Q?=',
      'Tailscale-User-Profile-Pic': 'https://example.com/profile.png',
    });
    const viewer = getViewerFromHeaders(headers);

    expect(viewer).toEqual({ label: '운영자', login: 'viewer@example.com' });

    headers.set('Tailscale-User-Name', '=?UTF-8?Q?=EC=9A=B4=EC=98=81=EC=9E=90?=');
    expect(getViewerFromHeaders(headers).label).toBe('운영자');
  });

  test('falls back to login when display name is missing or malformed', () => {
    const headers = new Headers({ 'Tailscale-User-Login': 'viewer@example.com' });

    expect(getViewerFromHeaders(headers)).toEqual({
      label: 'viewer@example.com',
      login: 'viewer@example.com',
    });

    headers.set('Tailscale-User-Name', '=?UTF-8?Q?=FF?=');
    const viewer = getViewerFromHeaders(headers);

    expect(viewer).toEqual({ label: 'viewer@example.com', login: 'viewer@example.com' });
  });
});
