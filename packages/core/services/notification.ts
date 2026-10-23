import { and, eq, inArray, isNotNull, isNull, ne } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';
import {
  db,
  getDatabaseConnection,
  Instances,
  Notifications,
  Posts,
  ProfileFollowRequests,
  ProfileFollows,
  Profiles,
  Reactions,
} from '../db';
import { InstanceKind, InstanceState, NotificationKind, PostState, ProfileState } from '../enums';
import { materializeNotification } from './notification-policy';
import {
  assignReactionNotificationGroups,
  withReactionNotificationGroupTransaction,
} from './notification-reaction-group';
import type { Database } from '../db';

const NotificationRepostAuthors = alias(Profiles, 'notification_repost_author');
const NotificationRepostAuthorInstances = alias(Instances, 'notification_repost_author_instance');
const NotificationRepostRelatedPosts = alias(Posts, 'notification_repost_related_post');
const NotificationRepostRecipients = alias(Profiles, 'notification_repost_recipient');
const NotificationRepostRecipientInstances = alias(
  Instances,
  'notification_repost_recipient_instance',
);

export const createFollowNotification = async (sourceId: string): Promise<string[]> =>
  getDatabaseConnection().transaction(async (tx) => {
    const source = await tx
      .select({
        actorAccountId: ProfileFollows.actorAccountId,
        id: ProfileFollows.id,
        recipientProfileId: ProfileFollows.followeeProfileId,
        relatedProfileId: ProfileFollows.followerProfileId,
      })
      .from(ProfileFollows)
      .innerJoin(Profiles, eq(Profiles.id, ProfileFollows.followeeProfileId))
      .innerJoin(Instances, eq(Instances.id, Profiles.instanceId))
      .where(and(eq(ProfileFollows.id, sourceId), eq(Instances.kind, InstanceKind.LOCAL)))
      .limit(1)
      .then((rows) => rows[0]);

    // The relation may be consumed by a concurrent terminal action before this
    // post-commit projection is materialized. There is no Notification to project.
    if (!source) {
      return [];
    }

    return materializeNotification(tx, {
      actorAccountId: source.actorAccountId,
      kind: NotificationKind.FOLLOW,
      recipientProfileId: source.recipientProfileId,
      relatedProfileId: source.relatedProfileId,
      sourceId: source.id,
    });
  });

export const createFollowRequestNotification = async (sourceId: string): Promise<string[]> =>
  getDatabaseConnection().transaction(async (tx) => {
    const source = await tx
      .select({
        actorAccountId: ProfileFollowRequests.actorAccountId,
        id: ProfileFollowRequests.id,
        recipientProfileId: ProfileFollowRequests.followeeProfileId,
        relatedProfileId: ProfileFollowRequests.followerProfileId,
      })
      .from(ProfileFollowRequests)
      .innerJoin(Profiles, eq(Profiles.id, ProfileFollowRequests.followeeProfileId))
      .innerJoin(Instances, eq(Instances.id, Profiles.instanceId))
      .where(
        and(
          eq(ProfileFollowRequests.id, sourceId),
          eq(Instances.kind, InstanceKind.LOCAL),
          eq(Instances.state, InstanceState.ACTIVE),
          eq(Profiles.state, ProfileState.ACTIVE),
        ),
      )
      .limit(1)
      .then((rows) => rows[0]);

    // The source may have reached a terminal state between the source commit and this
    // post-commit effect. In that case there is no Notification to project.
    if (!source) {
      return [];
    }

    return materializeNotification(tx, {
      actorAccountId: source.actorAccountId,
      kind: NotificationKind.FOLLOW_REQUEST,
      recipientProfileId: source.recipientProfileId,
      relatedProfileId: source.relatedProfileId,
      sourceId: source.id,
    });
  });

export const createReactionNotification = async (
  sourceId: string,
  handle?: Database,
): Promise<string[]> =>
  withReactionNotificationGroupTransaction(handle ?? db, async (tx) => {
    const source = await tx
      .select({
        actorAccountId: Reactions.actorAccountId,
        actorProfileId: Reactions.profileId,
        id: Reactions.id,
        recipientInstanceKind: Instances.kind,
        recipientProfileId: Posts.profileId,
      })
      .from(Reactions)
      .innerJoin(Posts, eq(Posts.id, Reactions.postId))
      .innerJoin(Profiles, eq(Profiles.id, Posts.profileId))
      .innerJoin(Instances, eq(Instances.id, Profiles.instanceId))
      .where(and(eq(Reactions.id, sourceId), eq(Posts.state, PostState.ACTIVE)))
      .limit(1)
      .then((rows) => rows[0]);

    // An inbound Undo may remove the source before notification materialization.
    // The committed reaction lifecycle remains authoritative, so this is an expected no-op.
    if (!source) {
      return [];
    }

    if (
      source.actorProfileId === source.recipientProfileId ||
      source.recipientInstanceKind !== InstanceKind.LOCAL
    ) {
      return [];
    }

    const notificationIds = await materializeNotification(tx, {
      actorAccountId: source.actorAccountId,
      kind: NotificationKind.REACTION,
      recipientProfileId: source.recipientProfileId,
      relatedProfileId: source.actorProfileId,
      sourceId: source.id,
    });

    if (notificationIds.length > 0) {
      const recipientScopes = await tx
        .select({
          recipientAccountId: Notifications.recipientAccountId,
          recipientProfileId: Notifications.recipientProfileId,
        })
        .from(Notifications)
        .where(inArray(Notifications.id, notificationIds));

      for (const scope of recipientScopes) {
        if (scope.recipientProfileId !== null) {
          await assignReactionNotificationGroups(tx, {
            recipientAccountId: scope.recipientAccountId,
            recipientProfileId: scope.recipientProfileId,
          });
        }
      }
    }

    return notificationIds;
  });

export const createRepostNotification = async (
  sourceId: string,
  handle?: Database,
): Promise<string[]> => {
  const connection = getDatabaseConnection(handle);
  const source = await connection
    .select({
      actorAccountId: Posts.actorAccountId,
      actorProfileId: Posts.profileId,
      id: Posts.id,
      recipientInstanceKind: NotificationRepostRecipientInstances.kind,
      recipientProfileId: NotificationRepostRelatedPosts.profileId,
    })
    .from(Posts)
    .innerJoin(NotificationRepostAuthors, eq(NotificationRepostAuthors.id, Posts.profileId))
    .innerJoin(
      NotificationRepostAuthorInstances,
      eq(NotificationRepostAuthorInstances.id, NotificationRepostAuthors.instanceId),
    )
    .innerJoin(
      NotificationRepostRelatedPosts,
      eq(NotificationRepostRelatedPosts.id, Posts.repostSourceId),
    )
    .innerJoin(
      NotificationRepostRecipients,
      eq(NotificationRepostRecipients.id, NotificationRepostRelatedPosts.profileId),
    )
    .innerJoin(
      NotificationRepostRecipientInstances,
      eq(NotificationRepostRecipientInstances.id, NotificationRepostRecipients.instanceId),
    )
    .where(
      and(
        eq(Posts.id, sourceId),
        eq(Posts.state, PostState.ACTIVE),
        isNull(Posts.currentContentId),
        isNull(Posts.replyParentId),
        isNotNull(Posts.repostSourceId),
        eq(NotificationRepostAuthors.state, ProfileState.ACTIVE),
        ne(NotificationRepostAuthorInstances.state, InstanceState.SUSPENDED),
        eq(NotificationRepostRelatedPosts.state, PostState.ACTIVE),
        isNotNull(NotificationRepostRelatedPosts.currentContentId),
        eq(NotificationRepostRecipients.state, ProfileState.ACTIVE),
        ne(NotificationRepostRecipientInstances.state, InstanceState.SUSPENDED),
      ),
    )
    .limit(1)
    .then((rows) => rows[0]);

  // A delete or visibility transition may win before this retried effect runs.
  // The committed lifecycle is authoritative, so there is no Notification to project.
  if (!source) {
    return [];
  }

  if (
    source.actorProfileId === source.recipientProfileId ||
    source.recipientInstanceKind !== InstanceKind.LOCAL
  ) {
    return [];
  }

  return materializeNotification(connection, {
    actorAccountId: source.actorAccountId,
    kind: NotificationKind.REPOST,
    recipientProfileId: source.recipientProfileId,
    relatedProfileId: source.actorProfileId,
    sourceId: source.id,
  });
};

export const deleteNotificationBySource = async (
  kind: NotificationKind,
  sourceId: string,
  handle?: Database,
): Promise<void> => {
  await getDatabaseConnection(handle)
    .delete(Notifications)
    .where(and(eq(Notifications.kind, kind), eq(Notifications.sourceId, sourceId)));
};

export const deleteFollowNotification = (sourceId: string): Promise<void> =>
  deleteNotificationBySource(NotificationKind.FOLLOW, sourceId);

export const deleteFollowRequestNotification = (sourceId: string): Promise<void> =>
  deleteNotificationBySource(NotificationKind.FOLLOW_REQUEST, sourceId);

export const deleteRepostNotification = async (
  sourceId: string,
  handle?: Database,
): Promise<void> => deleteNotificationBySource(NotificationKind.REPOST, sourceId, handle);

export const deleteReactionNotification = async (
  sourceId: string,
  handle?: Database,
): Promise<void> => deleteNotificationBySource(NotificationKind.REACTION, sourceId, handle);
