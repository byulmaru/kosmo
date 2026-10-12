import type { Href } from 'expo-router';

export type NotificationHrefTarget =
  | { kind: 'internal'; href: Href }
  | { kind: 'external'; href: string };

const internalUrlBase = 'https://app.invalid';

function hasControlCharacters(value: string) {
  for (const character of value) {
    const code = character.charCodeAt(0);
    if (code < 0x20 || code === 0x7f) {
      return true;
    }
  }
  return false;
}

/** Accepts app-root paths and HTTP(S) destinations from server-owned notifications. */
export function parseNotificationHref(value: unknown): NotificationHrefTarget | null {
  if (typeof value !== 'string' || !value || hasControlCharacters(value)) {
    return null;
  }

  if (value.startsWith('/')) {
    if (value.startsWith('//')) {
      return null;
    }

    try {
      const url = new URL(value, internalUrlBase);
      if (url.origin !== internalUrlBase) {
        return null;
      }

      return { href: `${url.pathname}${url.search}${url.hash}` as Href, kind: 'internal' };
    } catch {
      return null;
    }
  }

  try {
    const url = new URL(value);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') {
      return null;
    }

    return { href: url.href, kind: 'external' };
  } catch {
    return null;
  }
}
