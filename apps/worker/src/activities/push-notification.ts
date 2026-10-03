import {
  db,
  first,
  Instances,
  Notifications,
  PostContents,
  Posts,
  ProfileFollowRequests,
  ProfileFollows,
  Profiles,
  Reactions,
} from '@kosmo/core/db';
import { InstanceKind, NotificationKind } from '@kosmo/core/enums';
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
import type { Message } from 'firebase-admin/messaging';

const DAY_IN_MILLISECONDS = 24 * 60 * 60 * 1000;
const PREVIEW_MAX_CODE_POINTS = 160;
const DISPLAY_NAME_MAX_CODE_POINTS = 40;

const notificationTypes: Record<NotificationKind, string> = {
  FOLLOW: 'FollowNotification',
  FOLLOW_REQUEST: 'FollowRequestNotification',
  QUOTE: 'QuoteNotification',
  REACTION: 'ReactionNotification',
  REPLY: 'ReplyNotification',
  REPOST: 'RepostNotification',
};

const notificationMessages: Record<NotificationKind, string> = {
  FOLLOW: '팔로우했습니다',
  FOLLOW_REQUEST: '팔로우를 요청했습니다',
  QUOTE: '회원님의 게시글을 인용했습니다',
  REACTION: '이 게시글에 반응했습니다',
  REPLY: '회원님의 게시글에 답글을 달았습니다',
  REPOST: '이 게시글을 재게시했습니다',
};

type NotificationSource = {
  readonly actorProfileId: string;
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
          return source ? { ...source, targetPostId: null } : null;
        });
    case NotificationKind.FOLLOW_REQUEST:
      return db
        .select({ actorProfileId: ProfileFollowRequests.followerProfileId })
        .from(ProfileFollowRequests)
        .where(eq(ProfileFollowRequests.id, sourceId))
        .limit(1)
        .then((rows) => {
          const source = rows[0];
          return source ? { ...source, targetPostId: null } : null;
        });
    case NotificationKind.REACTION:
      return db
        .select({ actorProfileId: Reactions.profileId, targetPostId: Reactions.postId })
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
        .then((rows) => rows[0] ?? null);
    case NotificationKind.REPLY:
    case NotificationKind.QUOTE:
      return db
        .select({ actorProfileId: Posts.profileId, targetPostId: Posts.id })
        .from(Posts)
        .where(eq(Posts.id, sourceId))
        .limit(1)
        .then((rows) => rows[0] ?? null);
  }
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
      kind: Notifications.kind,
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

  const source = await loadNotificationSource(notification.kind, notification.sourceId);
  if (
    !source ||
    (await isNotificationSuppressed(db, notification.recipientProfileId, source.actorProfileId))
  ) {
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
  let href =
    notification.kind === NotificationKind.FOLLOW_REQUEST
      ? '/follow-requests'
      : `/${relativeHandle(actor.handle, actor.instanceKind, actor.instanceDomain)}`;
  let preview: string | null = null;

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
          preview = truncateCodePoints(
            postContentDocumentToText(document),
            PREVIEW_MAX_CODE_POINTS,
          );
        }
      }
    }
  }

  const now = Temporal.Now.instant();
  const expiresAt = notification.createdAt.add({ hours: 24 });
  const ttl = Math.min(expiresAt.epochMilliseconds - now.epochMilliseconds, DAY_IN_MILLISECONDS);
  if (ttl <= 0) {
    return;
  }

  const body = `${notificationMessages[notification.kind]}${preview ? `: ${preview}` : ''}`;
  const payload = {
    android: { ttl },
    apns: {
      headers: { 'apns-expiration': String(Math.floor(expiresAt.epochMilliseconds / 1000)) },
    },
    data: {
      href,
      notificationId: encodeGlobalId(notificationTypes[notification.kind], notificationId),
      recipientProfileId: encodeGlobalId('Profile', notification.recipientProfileId),
    },
    notification: { body, title: actorName },
    token: installation.token,
  } satisfies Message;

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
