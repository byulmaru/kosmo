import type { Href } from 'expo-router';
import type { NativePushNotificationTargetQuery$data } from './__generated__/NativePushNotificationTargetQuery.graphql';

export type NativePushTapTarget = {
  notificationId: string;
  recipientProfileId: string;
};

type RecordValue = Record<string, unknown>;

const isRecord = (value: unknown): value is RecordValue =>
  typeof value === 'object' && value !== null;

const nonEmptyString = (value: unknown): string | null =>
  typeof value === 'string' && value.trim() ? value.trim() : null;

/**
 * Reads only the server-defined, non-sensitive tap envelope. Navigation is derived from the
 * revalidated Notification Node rather than from provider-controlled payload fields.
 */
export function parseNativePushTapTarget(value: unknown): NativePushTapTarget | null {
  if (!isRecord(value)) {
    return null;
  }

  const notificationId = nonEmptyString(value.notificationId);
  const recipientProfileId = nonEmptyString(value.recipientProfileId);
  if (!notificationId || !recipientProfileId) {
    return null;
  }

  return { notificationId, recipientProfileId };
}

function postHref(
  post: { readonly id: string; readonly profile: { readonly relativeHandle: string } } | null,
): Href | null {
  if (!post?.id || !post.profile.relativeHandle) {
    return null;
  }

  return `/${post.profile.relativeHandle}/${post.id}` as Href;
}

export function nativePushNotificationTargetHref(
  node: NativePushNotificationTargetQuery$data['node'],
): Href | null {
  if (!node) {
    return null;
  }

  switch (node.__typename) {
    case 'FollowNotification':
      return node.profile?.relativeHandle ? (`/${node.profile.relativeHandle}` as Href) : null;
    case 'FollowRequestNotification':
      return '/follow-requests';
    case 'ReactionNotification':
    case 'RepostNotification':
    case 'ReplyNotification':
      return postHref(node.post);
    default:
      return null;
  }
}

/**
 * Marks a direct route opened from a notification so route loaders can return to the
 * recipient's notification list when the target no longer exists or is inaccessible.
 */
export function markNativePushRoute(href: Href): Href {
  if (typeof href !== 'string') {
    return href;
  }

  if (/(?:[?&])fromPush=1(?:&|$)/.test(href)) {
    return href as Href;
  }

  return `${href}${href.includes('?') ? '&' : '?'}fromPush=1` as Href;
}

function notificationRequestFromResponse(response: RecordValue): RecordValue | null {
  const notification = response.notification;
  return isRecord(notification) && isRecord(notification.request) ? notification.request : null;
}

export function notificationDataFromResponse(response: unknown): unknown {
  if (!isRecord(response)) {
    return null;
  }

  const request = notificationRequestFromResponse(response);
  if (!request) {
    return null;
  }

  const content = request.content;
  if (!isRecord(content)) {
    return null;
  }

  return content.data;
}

export function nativePushResponseKey(response: unknown): string | null {
  if (!isRecord(response)) {
    return null;
  }

  const request = notificationRequestFromResponse(response);
  const identifier = nonEmptyString(request?.identifier);
  const actionIdentifier = nonEmptyString(response.actionIdentifier);
  return identifier ? `${identifier}:${actionIdentifier ?? ''}` : null;
}
