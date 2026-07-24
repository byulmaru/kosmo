import { and, eq, inArray, isNotNull, ne, or } from 'drizzle-orm';
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
import {
  InstanceKind,
  InstanceState,
  NotificationKind,
  PostState,
  PostVisibility,
  ProfileState,
} from '../enums';
import { NotFoundError } from '../error';

const ReplyParents = alias(Posts, 'reply_notification_parent');
const ReplyAuthors = alias(Profiles, 'reply_notification_author');
const ReplyAuthorInstances = alias(Instances, 'reply_notification_author_instance');

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

const selectReplyVisibleToProfile = async ({
  profileId,
  sourceId,
}: {
  profileId: string;
  sourceId: string;
}) =>
  db
    .select({ id: Posts.id })
    .from(Posts)
    .innerJoin(ReplyParents, eq(ReplyParents.id, Posts.replyParentId))
    .innerJoin(Profiles, eq(Profiles.id, ReplyParents.profileId))
    .innerJoin(Instances, eq(Instances.id, Profiles.instanceId))
    .innerJoin(ReplyAuthors, eq(ReplyAuthors.id, Posts.profileId))
    .innerJoin(ReplyAuthorInstances, eq(ReplyAuthorInstances.id, ReplyAuthors.instanceId))
    .leftJoin(
      ProfileFollows,
      and(
        eq(ProfileFollows.followerProfileId, profileId),
        eq(ProfileFollows.followeeProfileId, Posts.profileId),
      ),
    )
    .where(
      and(
        eq(Posts.id, sourceId),
        eq(Posts.state, PostState.ACTIVE),
        eq(ReplyParents.state, PostState.ACTIVE),
        eq(ReplyParents.profileId, profileId),
        eq(Profiles.state, ProfileState.ACTIVE),
        eq(Instances.kind, InstanceKind.LOCAL),
        eq(Instances.state, InstanceState.ACTIVE),
        eq(ReplyAuthors.state, ProfileState.ACTIVE),
        ne(ReplyAuthorInstances.state, InstanceState.SUSPENDED),
        or(
          inArray(Posts.visibility, [PostVisibility.PUBLIC, PostVisibility.UNLISTED]),
          eq(Posts.profileId, profileId),
          and(eq(Posts.visibility, PostVisibility.FOLLOWERS), isNotNull(ProfileFollows.id)),
        ),
      ),
    )
    .limit(1)
    .then((rows) => rows.length > 0);

export const createReplyNotification = async (sourceId: string): Promise<void> => {
  const source = await db
    .select({
      actorProfileId: Posts.profileId,
      id: Posts.id,
      recipientInstanceKind: Instances.kind,
      recipientProfileId: ReplyParents.profileId,
    })
    .from(Posts)
    .innerJoin(ReplyParents, eq(ReplyParents.id, Posts.replyParentId))
    .innerJoin(Profiles, eq(Profiles.id, ReplyParents.profileId))
    .innerJoin(Instances, eq(Instances.id, Profiles.instanceId))
    .where(eq(Posts.id, sourceId))
    .limit(1)
    .then(firstOrThrowWith(() => new NotFoundError('Reply not found')));

  if (
    source.actorProfileId === source.recipientProfileId ||
    source.recipientInstanceKind !== InstanceKind.LOCAL
  ) {
    return;
  }

  if (
    !(await selectReplyVisibleToProfile({
      profileId: source.recipientProfileId,
      sourceId: source.id,
    }))
  ) {
    return;
  }

  await db
    .insert(Notifications)
    .values({
      data: {},
      kind: NotificationKind.REPLY,
      recipientProfileId: source.recipientProfileId,
      sourceId: source.id,
    })
    .onConflictDoNothing({
      target: [Notifications.recipientProfileId, Notifications.kind, Notifications.sourceId],
    });
};

export const createReplyNotificationBestEffort = async (sourceId: string): Promise<void> => {
  try {
    await createReplyNotification(sourceId);
  } catch {
    // Notification은 Reply source 성공을 바꾸지 않는다.
  }
};

export const deleteNotificationBySource = async (
  kind: NotificationKind,
  sourceId: string,
): Promise<void> => {
  await db
    .delete(Notifications)
    .where(and(eq(Notifications.kind, kind), eq(Notifications.sourceId, sourceId)));
};
