import {
  db,
  first,
  Instances,
  Media,
  Notifications,
  PostContents,
  Posts,
  ProfileFollowRequests,
  ProfileFollows,
  ProfileMedia,
  Profiles,
  Reactions,
} from '@kosmo/core/db';
import {
  InstanceKind,
  MediaState,
  NotificationKind,
  ProfileMediaKind,
  PushInstallationPlatform,
} from '@kosmo/core/enums';
import { encodeGlobalId } from '@kosmo/core/global-id';
import { postContentDocumentToText } from '@kosmo/core/post-content/server';
import {
  findEligiblePushInstallations,
  invalidatePushInstallation,
  isNotificationSuppressed,
} from '@kosmo/core/services';
import { notificationSourceAvailabilityWhere } from '@kosmo/core/visibility';
import { ApplicationFailure } from '@temporalio/activity';
import { and, eq } from 'drizzle-orm';
import { applicationDefault, FirebaseError, getApps, initializeApp } from 'firebase-admin/app';
import { getMessaging } from 'firebase-admin/messaging';
import type { OperationalNotificationData } from '@kosmo/core/db';
import type { Message } from 'firebase-admin/messaging';

const DAY_IN_MILLISECONDS = 24 * 60 * 60 * 1000;
const PREVIEW_MAX_CODE_POINTS = 160;
const DISPLAY_NAME_MAX_CODE_POINTS = 40;
const FCM_MESSAGE_MAX_BYTES = 4096;
const IOS_PUSH_CATEGORY_IDENTIFIER = 'KOSMO_PUSH_PRESENTATION_V1';

type FcmMessageWithoutToken = Pick<Message, 'android' | 'apns' | 'data' | 'notification'>;

const getFcmMessageByteLength = (message: FcmMessageWithoutToken) =>
  new TextEncoder().encode(JSON.stringify(message)).byteLength;

const notificationTypes: Record<NotificationKind, string> = {
  FOLLOW: 'FollowNotification',
  FOLLOW_REQUEST: 'FollowRequestNotification',
  MENTION: 'MentionNotification',
  OPERATIONAL: 'OperationalNotification',
  QUOTE: 'QuoteNotification',
  REACTION: 'ReactionNotification',
  REPLY: 'ReplyNotification',
  REPOST: 'RepostNotification',
};

type NotificationSource = {
  readonly actorProfileId: string;
  readonly reaction: string | null;
  readonly targetPostId: string | null;
};

const truncateCodePoints = (value: string, maximum: number) => {
  const codePoints = [...value];
  return codePoints.length > maximum ? `${codePoints.slice(0, maximum - 1).join('')}…` : value;
};

const relativeHandle = (handle: string, kind: InstanceKind, domain: string) =>
  kind === InstanceKind.LOCAL ? `@${handle}` : `@${handle}@${domain}`;

const loadNotificationSource = async (
  kind: NotificationKind,
  sourceId: string,
): Promise<NotificationSource | null> => {
  switch (kind) {
    case NotificationKind.FOLLOW:
      return db
        .select({ actorProfileId: ProfileFollows.followerProfileId })
        .from(ProfileFollows)
        .where(eq(ProfileFollows.id, sourceId))
        .limit(1)
        .then((rows) => {
          const source = rows[0];
          return source ? { ...source, reaction: null, targetPostId: null } : null;
        });
    case NotificationKind.FOLLOW_REQUEST:
      return db
        .select({ actorProfileId: ProfileFollowRequests.followerProfileId })
        .from(ProfileFollowRequests)
        .where(eq(ProfileFollowRequests.id, sourceId))
        .limit(1)
        .then((rows) => {
          const source = rows[0];
          return source ? { ...source, reaction: null, targetPostId: null } : null;
        });
    case NotificationKind.REACTION:
      return db
        .select({
          actorProfileId: Reactions.profileId,
          reaction: Reactions.type,
          targetPostId: Reactions.postId,
        })
        .from(Reactions)
        .where(eq(Reactions.id, sourceId))
        .limit(1)
        .then((rows) => rows[0] ?? null);
    case NotificationKind.REPOST:
      return db
        .select({ actorProfileId: Posts.profileId, targetPostId: Posts.repostSourceId })
        .from(Posts)
        .where(eq(Posts.id, sourceId))
        .limit(1)
        .then((rows) => {
          const source = rows[0];
          return source ? { ...source, reaction: null } : null;
        });
    case NotificationKind.MENTION:
    case NotificationKind.REPLY:
    case NotificationKind.QUOTE:
      return db
        .select({ actorProfileId: Posts.profileId, targetPostId: Posts.id })
        .from(Posts)
        .where(eq(Posts.id, sourceId))
        .limit(1)
        .then((rows) => {
          const source = rows[0];
          return source ? { ...source, reaction: null } : null;
        });
    case NotificationKind.OPERATIONAL:
      return null;
  }
};

const isOperationalNotificationData = (value: unknown): value is OperationalNotificationData => {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return false;
  }

  const data = value as Record<string, unknown>;
  return (
    typeof data.title === 'string' &&
    data.title.trim().length > 0 &&
    typeof data.href === 'string' &&
    data.href.length > 0 &&
    (data.body === undefined || typeof data.body === 'string')
  );
};

const isInvalidRegistrationToken = (code: string) =>
  code === 'messaging/invalid-registration-token' ||
  code === 'messaging/registration-token-not-registered';

const retryableProviderCodes = new Set([
  'messaging/device-message-rate-exceeded',
  'messaging/internal-error',
  'messaging/message-rate-exceeded',
  'messaging/server-unavailable',
  'messaging/topics-message-rate-exceeded',
  'messaging/unknown-error',
]);

const sendPushMessage = async (
  payload: Message,
  projectId: string,
  installation: { readonly accountId: string; readonly id: string; readonly token: string },
) => {
  const app =
    getApps().find(({ name }) => name === '[DEFAULT]') ??
    initializeApp({ credential: applicationDefault(), projectId });

  try {
    await getMessaging(app).send(payload);
  } catch (error) {
    if (error instanceof FirebaseError) {
      if (isInvalidRegistrationToken(error.code)) {
        await invalidatePushInstallation({
          accountId: installation.accountId,
          id: installation.id,
          token: installation.token,
        });
        return;
      }

      if (error.code.startsWith('messaging/') && !retryableProviderCodes.has(error.code)) {
        throw ApplicationFailure.create({
          cause: error,
          message: error.message,
          nonRetryable: true,
          type: error.code,
        });
      }
    }

    throw error;
  }
};

/** Returns only eligible installation IDs so device tokens stay out of Workflow history. */
export const listPushNotificationInstallations = async (
  notificationId: string,
): Promise<string[]> => {
  if (!process.env.FIREBASE_PROJECT_ID) {
    return [];
  }

  const installations = await findEligiblePushInstallations({ notificationId });
  return installations.map(({ id }) => id);
};

/** Revalidates current eligibility and privacy before sending one installation's push. */
export const sendPushNotification = async (
  notificationId: string,
  installationId: string,
): Promise<void> => {
  const projectId = process.env.FIREBASE_PROJECT_ID;
  if (!projectId) {
    return;
  }

  const installation = (await findEligiblePushInstallations({ notificationId })).find(
    ({ id }) => id === installationId,
  );
  if (!installation) {
    return;
  }

  const notification = await db
    .select({
      createdAt: Notifications.createdAt,
      data: Notifications.data,
      kind: Notifications.kind,
      recipientAccountId: Notifications.recipientAccountId,
      recipientProfileId: Notifications.recipientProfileId,
      sourceId: Notifications.sourceId,
    })
    .from(Notifications)
    .where(
      and(
        eq(Notifications.id, notificationId),
        notificationSourceAvailabilityWhere(db, { includeRecipientAvailability: true }),
      ),
    )
    .limit(1)
    .then(first);
  if (!notification) {
    return;
  }

  const now = Temporal.Now.instant();
  const expiresAt = notification.createdAt.add({ hours: 24 });
  const ttl = Math.min(expiresAt.epochMilliseconds - now.epochMilliseconds, DAY_IN_MILLISECONDS);
  if (ttl <= 0) {
    return;
  }

  if (notification.kind === NotificationKind.OPERATIONAL) {
    if (
      notification.recipientAccountId === null ||
      !isOperationalNotificationData(notification.data)
    ) {
      return;
    }

    await sendPushMessage(
      {
        android: { ttl },
        apns: {
          headers: { 'apns-expiration': String(Math.floor(expiresAt.epochMilliseconds / 1000)) },
        },
        data: {
          href: notification.data.href,
          notificationId: encodeGlobalId('OperationalNotification', notificationId),
          recipientAccountId: encodeGlobalId('Account', notification.recipientAccountId),
        },
        notification: { body: notification.data.body ?? '', title: notification.data.title },
        token: installation.token,
      },
      projectId,
      installation,
    );
    return;
  }

  if (notification.recipientProfileId === null) {
    return;
  }

  const source = await loadNotificationSource(notification.kind, notification.sourceId);
  if (
    !source ||
    (await isNotificationSuppressed(db, notification.recipientProfileId, source.actorProfileId))
  ) {
    return;
  }
  if (notification.kind === NotificationKind.REACTION && !source.reaction) {
    return;
  }

  const actor = await db
    .select({
      displayName: Profiles.displayName,
      handle: Profiles.handle,
      instanceKind: Instances.kind,
      instanceDomain: Instances.domain,
    })
    .from(Profiles)
    .innerJoin(Instances, eq(Instances.id, Profiles.instanceId))
    .where(eq(Profiles.id, source.actorProfileId))
    .limit(1)
    .then(first);
  if (!actor) {
    return;
  }

  const actorName = truncateCodePoints(
    actor.displayName || actor.handle,
    DISPLAY_NAME_MAX_CODE_POINTS,
  );
  const recipient = await db
    .select({
      displayName: Profiles.displayName,
      handle: Profiles.handle,
      instanceDomain: Instances.domain,
      instanceKind: Instances.kind,
    })
    .from(Profiles)
    .innerJoin(Instances, eq(Instances.id, Profiles.instanceId))
    .where(eq(Profiles.id, notification.recipientProfileId))
    .limit(1)
    .then(first);
  if (!recipient) {
    return;
  }

  const recipientName = truncateCodePoints(
    recipient.displayName || recipient.handle,
    DISPLAY_NAME_MAX_CODE_POINTS,
  );
  const actorHandle = relativeHandle(actor.handle, actor.instanceKind, actor.instanceDomain);
  const recipientHandle = relativeHandle(
    recipient.handle,
    recipient.instanceKind,
    recipient.instanceDomain,
  );
  const actorAvatarUrl = await db
    .select({ url: Media.url })
    .from(ProfileMedia)
    .innerJoin(Media, eq(Media.id, ProfileMedia.mediaId))
    .where(
      and(
        eq(ProfileMedia.profileId, source.actorProfileId),
        eq(ProfileMedia.kind, ProfileMediaKind.AVATAR),
        eq(Media.state, MediaState.READY),
      ),
    )
    .limit(1)
    .then(first);
  let href =
    notification.kind === NotificationKind.FOLLOW_REQUEST
      ? '/follow-requests'
      : `/${relativeHandle(actor.handle, actor.instanceKind, actor.instanceDomain)}`;
  let postText: string | null = null;

  if (source.targetPostId) {
    const targetPost = await db
      .select({
        currentContentId: Posts.currentContentId,
        id: Posts.id,
        profileHandle: Profiles.handle,
        profileInstanceDomain: Instances.domain,
        profileInstanceKind: Instances.kind,
      })
      .from(Posts)
      .innerJoin(Profiles, eq(Profiles.id, Posts.profileId))
      .innerJoin(Instances, eq(Instances.id, Profiles.instanceId))
      .where(eq(Posts.id, source.targetPostId))
      .limit(1)
      .then(first);
    if (!targetPost) {
      return;
    }
    href = `/${relativeHandle(
      targetPost.profileHandle,
      targetPost.profileInstanceKind,
      targetPost.profileInstanceDomain,
    )}/${encodeGlobalId('Post', targetPost.id)}`;

    if (targetPost.currentContentId) {
      const content = await db
        .select({ document: PostContents.document })
        .from(PostContents)
        .where(eq(PostContents.id, targetPost.currentContentId))
        .limit(1)
        .then(first);
      if (content) {
        const document = content.document;
        const isSensitive = document.body.attrs?.sensitiveMedia === true;
        if (!document.summary && !isSensitive) {
          const text = postContentDocumentToText(document);
          if (text.trim()) {
            postText = truncateCodePoints(text, PREVIEW_MAX_CODE_POINTS);
          }
        }
      }
    }
  }

  const recipientLabel = `${recipientName}(${recipientHandle})`;
  const body =
    notification.kind === NotificationKind.REACTION
      ? `${actorName} 님이 ${recipientLabel} 님에게 ${source.reaction}를 남겼습니다.`
      : notification.kind === NotificationKind.FOLLOW
        ? `${actorName} 님이 ${recipientLabel} 님을 팔로우했습니다.`
        : notification.kind === NotificationKind.FOLLOW_REQUEST
          ? `${actorName} 님이 ${recipientLabel} 님에게 팔로우를 요청했습니다.`
          : notification.kind === NotificationKind.REPOST
            ? `${actorName} 님이 ${recipientLabel} 님의 게시글을 재게시했습니다.`
            : notification.kind === NotificationKind.REPLY
              ? `${actorName} 님이 ${recipientLabel} 님의 게시글에 답글을 달았습니다.`
              : notification.kind === NotificationKind.QUOTE
                ? `${actorName} 님이 ${recipientLabel} 님의 게시글을 인용했습니다.`
                : `${actorName} 님이 ${recipientLabel} 님을 언급했습니다.`;
  const baseData = {
    actorHandle,
    actorName,
    href,
    kind: notification.kind,
    notificationId: encodeGlobalId(notificationTypes[notification.kind], notificationId),
    presentationVersion: '1',
    recipientHandle,
    recipientName,
    recipientProfileId: encodeGlobalId('Profile', notification.recipientProfileId),
    ...(source.reaction ? { reaction: source.reaction } : {}),
    ...(postText ? { postText } : {}),
  };
  const isNativeAndroid =
    installation.platform === PushInstallationPlatform.ANDROID &&
    installation.presentationVersion === 1;
  const nativeData = {
    ...baseData,
    message: body,
    title: actorName,
  };
  const apns = {
    headers: { 'apns-expiration': String(Math.floor(expiresAt.epochMilliseconds / 1000)) },
    ...(installation.platform === PushInstallationPlatform.IOS
      ? { payload: { aps: { category: IOS_PUSH_CATEGORY_IDENTIFIER } } }
      : {}),
  };
  const basePayload = (
    isNativeAndroid
      ? {
          android: { priority: 'high' as const, ttl },
          apns,
          data: nativeData,
        }
      : {
          android: { ttl },
          apns,
          data: baseData,
          notification: { body, title: actorName },
        }
  ) satisfies FcmMessageWithoutToken;
  const avatarData = actorAvatarUrl?.url
    ? { ...baseData, actorAvatarUrl: actorAvatarUrl.url }
    : null;
  const nativeAvatarData = actorAvatarUrl?.url
    ? { ...nativeData, actorAvatarUrl: actorAvatarUrl.url }
    : null;
  const candidateAvatarData = isNativeAndroid ? nativeAvatarData : avatarData;
  const data =
    candidateAvatarData &&
    getFcmMessageByteLength({ ...basePayload, data: candidateAvatarData }) <= FCM_MESSAGE_MAX_BYTES
      ? candidateAvatarData
      : basePayload.data;
  const payload = {
    ...basePayload,
    data,
    token: installation.token,
  } satisfies Message;

  await sendPushMessage(payload, projectId, installation);
};
