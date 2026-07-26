import { and, eq, isNotNull, isNull, ne } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';
import {
  db,
  firstOrThrowWith,
  Instances,
  Notifications,
  Posts,
  ProfileFollows,
  Profiles,
  Reactions,
} from '../db';
import { InstanceKind, InstanceState, NotificationKind, PostState, ProfileState } from '../enums';
import { NotFoundError } from '../error';

const NotificationRepostAuthors = alias(Profiles, 'notification_repost_author');
const NotificationRepostAuthorInstances = alias(Instances, 'notification_repost_author_instance');
const NotificationRepostRelatedPosts = alias(Posts, 'notification_repost_related_post');
const NotificationRepostRecipients = alias(Profiles, 'notification_repost_recipient');
const NotificationRepostRecipientInstances = alias(
  Instances,
  'notification_repost_recipient_instance',
);

export const createFollowNotification = async (sourceId: string): Promise<void> => {
  const source = await db
    .select({ id: ProfileFollows.id, recipientProfileId: ProfileFollows.followeeProfileId })
    .from(ProfileFollows)
    .innerJoin(Profiles, eq(Profiles.id, ProfileFollows.followeeProfileId))
    .innerJoin(Instances, eq(Instances.id, Profiles.instanceId))
    .where(and(eq(ProfileFollows.id, sourceId), eq(Instances.kind, InstanceKind.LOCAL)))
    .limit(1)
    .then(firstOrThrowWith(() => new NotFoundError('Profile follow not found')));

  await db
    .insert(Notifications)
    .values({
      data: {},
      kind: NotificationKind.FOLLOW,
      recipientProfileId: source.recipientProfileId,
      sourceId: source.id,
    })
    .onConflictDoNothing({
      target: [Notifications.recipientProfileId, Notifications.kind, Notifications.sourceId],
    });
};

export const createReactionNotification = async (sourceId: string): Promise<void> => {
  const source = await db
    .select({
      actorProfileId: Reactions.profileId,
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
    .then(firstOrThrowWith(() => new NotFoundError('Reaction not found')));

  if (
    source.actorProfileId === source.recipientProfileId ||
    source.recipientInstanceKind !== InstanceKind.LOCAL
  ) {
    return;
  }

  await db
    .insert(Notifications)
    .values({
      data: {},
      kind: NotificationKind.REACTION,
      recipientProfileId: source.recipientProfileId,
      sourceId: source.id,
    })
    .onConflictDoNothing({
      target: [Notifications.recipientProfileId, Notifications.kind, Notifications.sourceId],
    });
};

export const createRepostNotification = async (sourceId: string): Promise<void> => {
  const source = await db
    .select({
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
    .then(firstOrThrowWith(() => new NotFoundError('Repost not found')));

  if (
    source.actorProfileId === source.recipientProfileId ||
    source.recipientInstanceKind !== InstanceKind.LOCAL
  ) {
    return;
  }

  await db
    .insert(Notifications)
    .values({
      data: {},
      kind: NotificationKind.REPOST,
      recipientProfileId: source.recipientProfileId,
      sourceId: source.id,
    })
    .onConflictDoNothing({
      target: [Notifications.recipientProfileId, Notifications.kind, Notifications.sourceId],
    });
};

export const deleteNotificationBySource = async (
  kind: NotificationKind,
  sourceId: string,
): Promise<void> => {
  await db
    .delete(Notifications)
    .where(and(eq(Notifications.kind, kind), eq(Notifications.sourceId, sourceId)));
};
