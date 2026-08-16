import { db, Instances, Notifications, Posts, ProfileFollows, Profiles } from '@kosmo/core/db';
import {
  InstanceKind,
  InstanceState,
  NotificationKind,
  PostState,
  PostVisibility,
  ProfileState,
} from '@kosmo/core/enums';
import { and, eq, inArray, isNotNull, ne, or } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';

export { sendLocalPostCreate as sendLocalPostCreateActivity } from '@kosmo/fedify';

const ReplyParents = alias(Posts, 'worker_reply_notification_parent');
const ReplyAuthors = alias(Profiles, 'worker_reply_notification_author');
const ReplyAuthorInstances = alias(Instances, 'worker_reply_notification_author_instance');

/**
 * Materialize the notification projection for a committed Post.
 *
 * The Activity owns the query and idempotent insert because it is the only
 * production caller of this effect. Root Posts, missing Posts and unavailable
 * Replies are expected no-ops; database failures are rethrown for retry.
 */
export const createReplyNotificationActivity = async (postId: string): Promise<void> => {
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
          eq(Posts.state, PostState.ACTIVE),
          eq(Profiles.state, ProfileState.ACTIVE),
          eq(Instances.kind, InstanceKind.LOCAL),
          eq(Instances.state, InstanceState.ACTIVE),
          eq(ReplyAuthors.state, ProfileState.ACTIVE),
          ne(ReplyAuthorInstances.state, InstanceState.SUSPENDED),
          or(
            inArray(Posts.visibility, [PostVisibility.PUBLIC, PostVisibility.UNLISTED]),
            and(eq(Posts.visibility, PostVisibility.FOLLOWERS), isNotNull(ProfileFollows.id)),
          ),
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
