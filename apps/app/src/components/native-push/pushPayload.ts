import { parseNotificationHref } from '@/components/notification/notificationHref';
import type { NotificationResponse } from 'expo-notifications';
import type { Href } from 'expo-router';
import type { NotificationHrefTarget } from '@/components/notification/notificationHref';

export type NativeProfilePushTapTarget = {
  href: Href;
  kind: 'profile';
  notificationId: string;
  recipientProfileId: string;
};

export type NativeOperationalPushTapTarget = {
  href: NotificationHrefTarget;
  kind: 'operational';
  notificationId: string;
  recipientAccountId: string;
};

export type NativePushTapTarget = NativeOperationalPushTapTarget | NativeProfilePushTapTarget;

type RecordValue = Record<string, unknown>;

const isRecord = (value: unknown): value is RecordValue =>
  typeof value === 'object' && value !== null;

const nonEmptyString = (value: unknown): string | null =>
  typeof value === 'string' && value.trim() ? value.trim() : null;

const isInternalProfileNotificationHref = (href: string, normalizedHref: string) =>
  href === normalizedHref &&
  (href === '/follow-requests' || /^\/@[^/]+(?:\/[^/]+)?$/.test(href)) &&
  !/[\\?#%]/.test(href);

/** Keeps the existing Profile envelope and identifies Account-only destinations by account ID. */
export function parseNativePushTapTarget(value: unknown): NativePushTapTarget | null {
  if (!isRecord(value)) {
    return null;
  }

  const notificationId = nonEmptyString(value.notificationId);
  const recipientProfileId = nonEmptyString(value.recipientProfileId);
  const recipientAccountId = nonEmptyString(value.recipientAccountId);
  const href = value.href;
  if (!notificationId || typeof href !== 'string' || href !== href.trim()) {
    return null;
  }

  const notificationHref = parseNotificationHref(href);
  if (
    recipientProfileId &&
    !recipientAccountId &&
    notificationHref?.kind === 'internal' &&
    typeof notificationHref.href === 'string' &&
    isInternalProfileNotificationHref(href, notificationHref.href)
  ) {
    return {
      href: notificationHref.href as Href,
      kind: 'profile',
      notificationId,
      recipientProfileId,
    };
  }

  if (recipientAccountId && !recipientProfileId && notificationHref) {
    return { href: notificationHref, kind: 'operational', notificationId, recipientAccountId };
  }

  return null;
}

export function nativePushResponseKey(response: NotificationResponse): string | null {
  const identifier = nonEmptyString(response.notification.request.identifier);
  return identifier ? `${identifier}:${response.actionIdentifier}` : null;
}
