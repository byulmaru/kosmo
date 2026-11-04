import { and, asc, desc, eq, getColumns, gt, inArray, lt } from 'drizzle-orm';
import { db, Instances, Posts, Profiles } from '../db';
import { homePostListWhere } from '../visibility/home-post-list';
import { getCachedHomeTimelinePostIds } from './membership';
import { filterHomeTimelinePosts } from './natural-language-mute';

type PostRow = typeof Posts.$inferSelect;
const insertionCandidateBatchSize = 100;

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
}): Promise<PostRow[]> => {
  if (limit <= 0) {
    return [];
  }

  const results: PostRow[] = [];
  let cursorAfter = after;
  let cursorBefore = before;
  let remainingPostIds = postIds === undefined ? undefined : [...postIds];

  while (results.length < limit) {
    const batchLimit = Math.min(limit - results.length, insertionCandidateBatchSize);
    const candidates = await queryHomeTimeline({
      profileId,
      after: cursorAfter,
      before: cursorBefore,
      limit: batchLimit,
      inverted,
      ...(remainingPostIds === undefined ? {} : { postIds: remainingPostIds }),
    });
    if (candidates.length === 0) {
      break;
    }

    const cachedPostIds = await getCachedHomeTimelinePostIds(
      profileId,
      candidates.map(({ id }) => id),
    );
    const newCandidates = candidates.filter(({ id }) => !cachedPostIds.has(id));
    const includedNewPosts = await filterHomeTimelinePosts({ profileId, posts: newCandidates });
    const includedPostIds = new Set([...cachedPostIds, ...includedNewPosts.map(({ id }) => id)]);
    results.push(...candidates.filter(({ id }) => includedPostIds.has(id)));

    if (remainingPostIds !== undefined) {
      const scannedPostIds = new Set(candidates.map(({ id }) => id));
      remainingPostIds = remainingPostIds.filter((postId) => !scannedPostIds.has(postId));
      if (remainingPostIds.length === 0) {
        break;
      }
      continue;
    }

    const lastCandidate = candidates.at(-1);
    if (lastCandidate === undefined || candidates.length < batchLimit) {
      break;
    }
    if (inverted) {
      cursorBefore = lastCandidate.id;
    } else {
      cursorAfter = lastCandidate.id;
    }
  }

  return results;
};
