import { and, eq, isNotNull, isNull, ne } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';
import {
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
import { captureNotificationRecipients } from './notification-recipient-snapshot';
import type { Database, DatabaseHandle } from '../db';

const getRecipientAccountIds = async (
  database: DatabaseHandle,
  kind: NotificationKind,
  sourceId: string,
  recipientProfileId: string,
  sourceCreatedAt: Temporal.Instant,
): Promise<string[]> => {
  const snapshot = await captureNotificationRecipients(database, {
    kind,
    legacyMembershipCutoff: sourceCreatedAt,
    recipientProfileIds: [recipientProfileId],
    sourceId,
  });

  return [...(snapshot.recipients[recipientProfileId] ?? [])];
};

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
        createdAt: ProfileFollows.createdAt,
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
      kind: NotificationKind.FOLLOW,
      recipientAccountIds: await getRecipientAccountIds(
        tx,
        NotificationKind.FOLLOW,
        source.id,
        source.recipientProfileId,
        source.createdAt,
      ),
      recipientProfileId: source.recipientProfileId,
      relatedProfileId: source.relatedProfileId,
      sourceId: source.id,
    });
  });

export const createFollowRequestNotification = async (sourceId: string): Promise<string[]> =>
  getDatabaseConnection().transaction(async (tx) => {
    const source = await tx
      .select({
        createdAt: ProfileFollowRequests.createdAt,
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
      kind: NotificationKind.FOLLOW_REQUEST,
      recipientAccountIds: await getRecipientAccountIds(
        tx,
        NotificationKind.FOLLOW_REQUEST,
        source.id,
        source.recipientProfileId,
        source.createdAt,
      ),
      recipientProfileId: source.recipientProfileId,
      relatedProfileId: source.relatedProfileId,
      sourceId: source.id,
    });
  });

export const createReactionNotification = async (
  sourceId: string,
  handle?: Database,
): Promise<string[]> =>
  getDatabaseConnection(handle).transaction(async (tx) => {
    const source = await tx
      .select({
        actorProfileId: Reactions.profileId,
        createdAt: Reactions.createdAt,
        id: Reactions.id,
        recipientInstanceKind: Instances.kind,
        recipientProfileId: Posts.profileId,
      })
      .from(Reactions)
      .innerJoin(Posts, eq(Posts.id, Reactions.postId))
      .innerJoin(Profiles, eq(Profiles.id, Posts.profileId))
      .innerJoin(Instances, eq(Instances.id, Profiles.instanceId))
      .where(eq(Reactions.id, sourceId))
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

    return materializeNotification(tx, {
      kind: NotificationKind.REACTION,
      recipientAccountIds: await getRecipientAccountIds(
        tx,
        NotificationKind.REACTION,
        source.id,
        source.recipientProfileId,
        source.createdAt,
      ),
      recipientProfileId: source.recipientProfileId,
      relatedProfileId: source.actorProfileId,
      sourceId: source.id,
    });
  });

export const createRepostNotification = async (
  sourceId: string,
  handle?: Database,
): Promise<string[]> => {
  const connection = getDatabaseConnection(handle);
  const source = await connection
    .select({
      actorProfileId: Posts.profileId,
      createdAt: Posts.createdAt,
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
    kind: NotificationKind.REPOST,
    recipientAccountIds: await getRecipientAccountIds(
      connection,
      NotificationKind.REPOST,
      source.id,
      source.recipientProfileId,
      source.createdAt,
    ),
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
