import type { NotificationResponse } from 'expo-notifications';
import type { Href } from 'expo-router';

export type NativePushTapTarget = {
  href: Href;
  notificationId: string;
  recipientProfileId: string;
};

type RecordValue = Record<string, unknown>;

const isRecord = (value: unknown): value is RecordValue =>
  typeof value === 'object' && value !== null;

const nonEmptyString = (value: unknown): string | null =>
  typeof value === 'string' && value.trim() ? value.trim() : null;

const hasControlCharacters = (value: string) =>
  [...value].some((character) => {
    const code = character.charCodeAt(0);
    return code < 0x20 || code === 0x7f;
  });

const isInternalNotificationHref = (href: string) =>
  (href === '/follow-requests' || /^\/@[^/]+(?:\/[^/]+)?$/.test(href)) &&
  !/[\\?#%]/.test(href) &&
  !hasControlCharacters(href) &&
  !href
    .slice(1)
    .split('/')
    .some((segment) => segment === '.' || segment === '..');

/** Reads the tap envelope and accepts only current in-app notification routes. */
export function parseNativePushTapTarget(value: unknown): NativePushTapTarget | null {
  if (!isRecord(value)) {
    return null;
  }

  const notificationId = nonEmptyString(value.notificationId);
  const recipientProfileId = nonEmptyString(value.recipientProfileId);
  const href = value.href;
  if (
    !notificationId ||
    !recipientProfileId ||
    typeof href !== 'string' ||
    href !== href.trim() ||
    !isInternalNotificationHref(href)
  ) {
    return null;
  }

  return { href: href as Href, notificationId, recipientProfileId };
}

export function nativePushResponseKey(response: NotificationResponse): string | null {
  const identifier = nonEmptyString(response.notification.request.identifier);
  return identifier ? `${identifier}:${response.actionIdentifier}` : null;
}
