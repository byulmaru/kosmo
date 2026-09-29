import type { NotificationResponse } from 'expo-notifications';
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
  post:
    | { readonly id: string; readonly profile: { readonly relativeHandle: string } }
    | null
    | undefined,
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

export function nativePushResponseKey(response: NotificationResponse): string | null {
  const identifier = nonEmptyString(response.notification.request.identifier);
  return identifier ? `${identifier}:${response.actionIdentifier}` : null;
}
