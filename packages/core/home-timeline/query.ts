import {
  and,
  asc,
  desc,
  eq,
  getColumns,
  gt,
  gte,
  inArray,
  isNotNull,
  isNull,
  lt,
  lte,
  ne,
  or,
  sql,
} from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';
import { db, Instances, PostMentions, Posts, Profiles } from '../db';
import { homePostListWhere } from '../visibility/home-post-list';
import { getCachedHomeTimelinePostIds } from './membership';
import { filterHomeTimelinePosts } from './natural-language-mute';

type PostRow = typeof Posts.$inferSelect;
const HomeFollowReplyParents = alias(Posts, 'home_timeline_follow_reply_parent');
const HomeFollowRepostSources = alias(Posts, 'home_timeline_follow_repost_source');

const homeTimelineFollowCandidateWhere = (
  profileId: string,
  followeeProfileIds: readonly string[],
) => {
  const replyParentAuthorIsFollowee = sql<boolean>`exists (${db
    .select({ id: HomeFollowReplyParents.id })
    .from(HomeFollowReplyParents)
    .where(
      and(
        eq(HomeFollowReplyParents.id, Posts.replyParentId),
        inArray(HomeFollowReplyParents.profileId, followeeProfileIds),
        ne(Posts.profileId, profileId),
      ),
    )} offset 0)`;
  const currentContentMentionsFollowee = sql<boolean>`exists (${db
    .select({ postContentId: PostMentions.postContentId })
    .from(PostMentions)
    .where(
      and(
        eq(PostMentions.postContentId, Posts.currentContentId),
        inArray(PostMentions.profileId, followeeProfileIds),
        isNotNull(Posts.replyParentId),
        ne(Posts.profileId, profileId),
      ),
    )} offset 0)`;
  const pureRepostSourceAuthorIsFollowee = sql<boolean>`exists (${db
    .select({ id: HomeFollowRepostSources.id })
    .from(HomeFollowRepostSources)
    .where(
      and(
        eq(HomeFollowRepostSources.id, Posts.repostSourceId),
        inArray(HomeFollowRepostSources.profileId, followeeProfileIds),
        isNull(Posts.currentContentId),
        isNull(Posts.replyParentId),
      ),
    )} offset 0)`;

  return or(
    inArray(Posts.profileId, followeeProfileIds),
    replyParentAuthorIsFollowee,
    currentContentMentionsFollowee,
    pureRepostSourceAuthorIsFollowee,
  );
};

export const queryHomeTimeline = async ({
  profileId,
  after,
  before,
  limit,
  inverted = false,
  postIds,
}: {
  readonly profileId: string;
  readonly after?: string;
  readonly before?: string;
  readonly limit: number;
  readonly inverted?: boolean;
  readonly postIds?: readonly string[];
}): Promise<PostRow[]> => {
  if (postIds?.length === 0) {
    return [];
  }

  return db
    .select(getColumns(Posts))
    .from(Posts)
    .innerJoin(Profiles, eq(Profiles.id, Posts.profileId))
    .innerJoin(Instances, eq(Instances.id, Profiles.instanceId))
    .where(
      and(
        homePostListWhere({ db, viewerProfileId: profileId }),
        postIds === undefined ? undefined : inArray(Posts.id, postIds),
        before ? gt(Posts.id, before) : undefined,
        after ? lt(Posts.id, after) : undefined,
      ),
    )
    .orderBy(inverted ? asc(Posts.id) : desc(Posts.id))
    .limit(limit);
};

export const selectHomeTimelineFollowAffectedPostIds = async ({
  profileId,
  followeeProfileIds,
  postIds,
}: {
  readonly profileId: string;
  readonly followeeProfileIds: readonly string[];
  readonly postIds: readonly string[];
}): Promise<string[]> => {
  if (followeeProfileIds.length === 0 || postIds.length === 0) {
    return [];
  }

  const rows = await db
    .select({ id: Posts.id })
    .from(Posts)
    .where(
      and(
        inArray(Posts.id, postIds),
        homeTimelineFollowCandidateWhere(profileId, followeeProfileIds),
      ),
    )
    .limit(postIds.length);
  return rows.map(({ id }) => id);
};

export const queryHomeTimelineForFollowChanges = async ({
  profileId,
  followeeProfileIds,
  minimumPostId,
  maximumPostId,
  limit,
}: {
  readonly profileId: string;
  readonly followeeProfileIds: readonly string[];
  readonly minimumPostId: string;
  readonly maximumPostId: string;
  readonly limit: number;
}): Promise<PostRow[]> => {
  if (followeeProfileIds.length === 0 || limit <= 0) {
    return [];
  }

  return db
    .select(getColumns(Posts))
    .from(Posts)
    .innerJoin(Profiles, eq(Profiles.id, Posts.profileId))
    .innerJoin(Instances, eq(Instances.id, Profiles.instanceId))
    .where(
      and(
        homePostListWhere({ db, viewerProfileId: profileId }),
        homeTimelineFollowCandidateWhere(profileId, followeeProfileIds),
        gte(Posts.id, minimumPostId),
        lte(Posts.id, maximumPostId),
      ),
    )
    .orderBy(desc(Posts.id))
    .limit(limit);
};

export const queryHomeTimelineForInsertion = async ({
  profileId,
  after,
  before,
  limit,
  inverted = false,
  postIds,
}: {
  readonly profileId: string;
  readonly after?: string;
  readonly before?: string;
  readonly limit: number;
  readonly inverted?: boolean;
  readonly postIds?: readonly string[];
}): Promise<{ readonly candidates: PostRow[]; readonly includedPosts: PostRow[] }> => {
  if (limit <= 0) {
    return { candidates: [], includedPosts: [] };
  }

  const candidates = await queryHomeTimeline({
    profileId,
    after,
    before,
    limit,
    inverted,
    ...(postIds === undefined ? {} : { postIds }),
  });
  if (candidates.length === 0) {
    return { candidates, includedPosts: [] };
  }
  const cachedPostIds = await getCachedHomeTimelinePostIds(
    profileId,
    candidates.map(({ id }) => id),
  );
  const newCandidates = candidates.filter(({ id }) => !cachedPostIds.has(id));
  const includedNewPosts = await filterHomeTimelinePosts({ profileId, posts: newCandidates });
  const includedPostIds = new Set([...cachedPostIds, ...includedNewPosts.map(({ id }) => id)]);

  return {
    candidates,
    includedPosts: candidates.filter(({ id }) => includedPostIds.has(id)),
  };
};
