import { and, asc, desc, eq, getColumns, gt, inArray, lt } from 'drizzle-orm';
import { db, Instances, Posts, Profiles } from '../db';
import { homePostListWhere } from '../visibility/home-post-list';
import { getCachedHomeTimelinePostIds } from './membership';
import { filterHomeTimelinePosts } from './natural-language-mute';

type PostRow = typeof Posts.$inferSelect;

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
