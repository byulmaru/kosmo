import { db, Posts, ProfileFollowRequests, ProfileFollows, Reactions } from '@kosmo/core/db';
import { inArray } from 'drizzle-orm';
import type { UserContext } from '@/context';

// These internal ID-only projections bypass source visibility; public fields still use ordinary Node loaders and authorization.
type FollowNotificationSource = { id: string; followerProfileId: string };
type FollowRequestNotificationSource = { id: string; followerProfileId: string };
type ReactionNotificationSource = { id: string; postId: string; profileId: string };
type PostNotificationSource = { id: string; profileId: string; repostSourceId: string | null };

export const followNotificationSourceByIdLoader = (ctx: UserContext) =>
  ctx.loader<string, FollowNotificationSource, string, true>({
    name: 'notification.followSourceById',
    nullable: true,
    load: (ids) =>
      db
        .select({ id: ProfileFollows.id, followerProfileId: ProfileFollows.followerProfileId })
        .from(ProfileFollows)
        .where(inArray(ProfileFollows.id, ids)),
    key: (source) => source?.id ?? null,
  });

export const followRequestNotificationSourceByIdLoader = (ctx: UserContext) =>
  ctx.loader<string, FollowRequestNotificationSource, string, true>({
    name: 'notification.followRequestSourceById',
    nullable: true,
    load: (ids) =>
      db
        .select({
          id: ProfileFollowRequests.id,
          followerProfileId: ProfileFollowRequests.followerProfileId,
        })
        .from(ProfileFollowRequests)
        .where(inArray(ProfileFollowRequests.id, ids)),
    key: (source) => source?.id ?? null,
  });

export const reactionNotificationSourceByIdLoader = (ctx: UserContext) =>
  ctx.loader<string, ReactionNotificationSource, string, true>({
    name: 'notification.reactionSourceById',
    nullable: true,
    load: (ids) =>
      db
        .select({ id: Reactions.id, postId: Reactions.postId, profileId: Reactions.profileId })
        .from(Reactions)
        .where(inArray(Reactions.id, ids)),
    key: (source) => source?.id ?? null,
  });

export const postNotificationSourceByIdLoader = (ctx: UserContext) =>
  ctx.loader<string, PostNotificationSource, string, true>({
    name: 'notification.postSourceById',
    nullable: true,
    load: (ids) =>
      db
        .select({ id: Posts.id, profileId: Posts.profileId, repostSourceId: Posts.repostSourceId })
        .from(Posts)
        .where(inArray(Posts.id, ids)),
    key: (source) => source?.id ?? null,
  });
