import { db, Posts, ProfileFollows } from '@kosmo/core/db';
import { and, eq, exists, isNull, or } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';

const ReplyParents = alias(Posts, 'post_list_reply_parent');

export const homePostListCandidateWhere = (viewerProfileId: string) => {
  const followeeWhere = exists(
    db
      .select({ id: ProfileFollows.id })
      .from(ProfileFollows)
      .where(
        and(
          eq(ProfileFollows.followerProfileId, viewerProfileId),
          eq(ProfileFollows.followeeProfileId, Posts.profileId),
        ),
      ),
  );
  const replyParentIsViewerPost = exists(
    db
      .select({ id: ReplyParents.id })
      .from(ReplyParents)
      .where(
        and(eq(ReplyParents.id, Posts.replyParentId), eq(ReplyParents.profileId, viewerProfileId)),
      ),
  );
  const replyParentAuthorIsFollowee = exists(
    db
      .select({ id: ReplyParents.id })
      .from(ReplyParents)
      .innerJoin(ProfileFollows, eq(ProfileFollows.followeeProfileId, ReplyParents.profileId))
      .where(
        and(
          eq(ReplyParents.id, Posts.replyParentId),
          eq(ProfileFollows.followerProfileId, viewerProfileId),
        ),
      ),
  );

  return or(
    eq(Posts.profileId, viewerProfileId),
    and(isNull(Posts.replyParentId), followeeWhere),
    replyParentIsViewerPost,
    and(followeeWhere, replyParentAuthorIsFollowee),
  )!;
};

export const profilePostListCandidateWhere = (profileId: string) =>
  and(eq(Posts.profileId, profileId), isNull(Posts.replyParentId))!;
