import { and, eq, isNotNull, ne } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';
import { db, Instances, Notifications, Posts, ProfileFollows, Profiles } from '../db';
import { InstanceKind, InstanceState, NotificationKind, ProfileState } from '../enums';
import { postVisibilityCondition } from '../visibility/post';

const ReplyParents = alias(Posts, 'reply_notification_parent');
const ReplyAuthors = alias(Profiles, 'reply_notification_author');
const ReplyAuthorInstances = alias(Instances, 'reply_notification_author_instance');

/**
 * Materialize the notification projection for a committed Post.
 *
 * Root Posts, missing Posts and unavailable Replies are expected no-ops;
 * database failures are rethrown for the caller's retry boundary.
 */
export const createReplyNotification = async (postId: string): Promise<void> => {
  await db.transaction(async (tx) => {
    const source = await tx
      .select({
        id: Posts.id,
        recipientProfileId: ReplyParents.profileId,
      })
      .from(Posts)
      .innerJoin(ReplyParents, eq(ReplyParents.id, Posts.replyParentId))
      .innerJoin(Profiles, eq(Profiles.id, ReplyParents.profileId))
      .innerJoin(Instances, eq(Instances.id, Profiles.instanceId))
      .innerJoin(ReplyAuthors, eq(ReplyAuthors.id, Posts.profileId))
      .innerJoin(ReplyAuthorInstances, eq(ReplyAuthorInstances.id, ReplyAuthors.instanceId))
      .leftJoin(
        ProfileFollows,
        and(
          eq(ProfileFollows.followerProfileId, ReplyParents.profileId),
          eq(ProfileFollows.followeeProfileId, Posts.profileId),
        ),
      )
      .where(
        and(
          eq(Posts.id, postId),
          ne(Posts.profileId, ReplyParents.profileId),
          eq(Profiles.state, ProfileState.ACTIVE),
          eq(Instances.kind, InstanceKind.LOCAL),
          eq(Instances.state, InstanceState.ACTIVE),
          postVisibilityCondition({
            columns: {
              authorProfileId: Posts.profileId,
              authorVisible: and(
                eq(ReplyAuthors.state, ProfileState.ACTIVE),
                ne(ReplyAuthorInstances.state, InstanceState.SUSPENDED),
              )!,
              postState: Posts.state,
              postVisibility: Posts.visibility,
            },
            viewerFollowsAuthor: isNotNull(ProfileFollows.id),
            viewerProfileId: ReplyParents.profileId,
          }),
        ),
      )
      .limit(1)
      .then((rows) => rows[0]);

    if (!source) {
      return;
    }

    await tx
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
  });
};
