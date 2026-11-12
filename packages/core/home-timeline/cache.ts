import { and, asc, eq, exists, gt, or } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';
import { Temporal } from 'temporal-polyfill';
import { db, Instances, Posts, ProfileFollows, Profiles } from '../db';
import { runRedisCommand } from '../redis/client';
import { homePostListWhere } from '../visibility/home-post-list';
import { publishHomeTimelinePostAdded } from './events';
import { getCachedHomeTimelinePostIds, homeTimelineFeedKey as feedKey } from './membership';
import { filterHomeTimelineMuteCandidates, filterHomeTimelinePosts } from './natural-language-mute';
import { queryHomeTimeline } from './query';

const feedKeyPrefix = feedKey('');
const legacyReadyMember = '__ready__';
const maximumEntries = 1_000;
const keyLifetimeSeconds = 604_800;
const candidateBatchSize = 100;
const postIdPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const HomeFanoutViewers = alias(Profiles, 'home_timeline_fanout_viewer');
const HomeFanoutViewerInstances = alias(Instances, 'home_timeline_fanout_viewer_instance');
const HomeFanoutReplyParents = alias(Posts, 'home_timeline_fanout_reply_parent');

const homeTimelineCandidateWhere = () => {
  const viewerFollowsAuthor = exists(
    db
      .select({ id: ProfileFollows.id })
      .from(ProfileFollows)
      .where(
        and(
          eq(ProfileFollows.followerProfileId, HomeFanoutViewers.id),
          eq(ProfileFollows.followeeProfileId, Posts.profileId),
        ),
      ),
  );
  const replyParentIsViewerPost = exists(
    db
      .select({ id: HomeFanoutReplyParents.id })
      .from(HomeFanoutReplyParents)
      .where(
        and(
          eq(HomeFanoutReplyParents.id, Posts.replyParentId),
          eq(HomeFanoutReplyParents.profileId, HomeFanoutViewers.id),
        ),
      ),
  );
  return or(
    eq(HomeFanoutViewers.id, Posts.profileId),
    viewerFollowsAuthor,
    replyParentIsViewerPost,
  );
};

export type HomeTimelineEntry = {
  readonly postId: string;
  readonly score: number;
};

const parseEntries = (
  entries: readonly { value: string; score: number }[],
): HomeTimelineEntry[] | null => {
  const parsed: HomeTimelineEntry[] = [];
  for (const { value, score } of entries) {
    if (!postIdPattern.test(value) || !Number.isFinite(score) || score < 0) {
      return null;
    }
    parsed.push({ postId: value, score });
  }
  return parsed;
};

export const readHomeTimelineCache = async ({
  profileId,
  after,
  before,
  limit,
  inverted = false,
}: {
  readonly profileId: string;
  readonly after?: number;
  readonly before?: number;
  readonly limit: number;
  readonly inverted?: boolean;
}): Promise<{
  readonly entries: HomeTimelineEntry[];
  readonly oldestPostId: string | null;
  readonly anchorPostId: string | null;
} | null> => {
  if (
    !Number.isInteger(limit) ||
    limit < 0 ||
    (after !== undefined && !Number.isFinite(after)) ||
    (before !== undefined && !Number.isFinite(before))
  ) {
    return null;
  }

  const minimum = before === undefined ? '0' : `(${before}`;
  const maximum = after === undefined ? '+inf' : `(${after}`;
  const start = inverted ? minimum : maximum;
  const stop = inverted ? maximum : minimum;
  const result = await runRedisCommand(async (client) => {
    const transaction = client.multi();
    transaction.zRem(feedKey(profileId), legacyReadyMember);
    transaction.zRangeWithScores(feedKey(profileId), start, stop, {
      BY: 'SCORE',
      LIMIT: { offset: 0, count: limit },
      REV: !inverted,
    });
    transaction.zRangeWithScores(feedKey(profileId), '0', '+inf', {
      BY: 'SCORE',
      LIMIT: { offset: 0, count: 1 },
    });
    if (after !== undefined || before !== undefined) {
      const cursorScore = after ?? before!;
      transaction.zRangeWithScores(feedKey(profileId), cursorScore, cursorScore, {
        BY: 'SCORE',
        LIMIT: { offset: 0, count: 1 },
      });
    }
    transaction.expire(feedKey(profileId), keyLifetimeSeconds);
    return transaction.exec();
  });

  if (result === null) {
    return null;
  }

  const [, cachedRows, oldestRows] = result.value as unknown as [
    number,
    { value: string; score: number }[],
    { value: string; score: number }[],
  ];
  const cursorRows =
    after !== undefined || before !== undefined
      ? (
          result.value as unknown as [
            unknown,
            unknown,
            unknown,
            { value: string; score: number }[] | undefined,
          ]
        )[3]
      : undefined;

  const entries = parseEntries(cachedRows);
  const oldestEntries = parseEntries(oldestRows);
  const cursorEntries = parseEntries(cursorRows ?? []);
  if (
    entries === null ||
    oldestEntries === null ||
    oldestEntries.length === 0 ||
    cursorEntries === null
  ) {
    return null;
  }

  return {
    entries,
    oldestPostId: oldestEntries[0]?.postId ?? null,
    anchorPostId: cursorEntries[0]?.postId ?? oldestEntries[0]?.postId ?? null,
  };
};

const cacheHomeTimelinePageScript = `
redis.call('ZREM', KEYS[1], ARGV[1])
local afterId = ARGV[2]
local pageCount = tonumber(ARGV[3])
local ttl = ARGV[5]
if afterId == '' then
  local score = tonumber(ARGV[4])
  for index = 1, pageCount do
    redis.call('ZADD', KEYS[1], 'NX', score - (index - 1), ARGV[index + 5])
  end
else
  local tailRows = redis.call('ZRANGE', KEYS[1], 0, 0, 'WITHSCORES')
  if #tailRows ~= 2 then
    return 0
  end
  local tailId = tailRows[1]
  local tailScore = tonumber(tailRows[2])
  if not tailScore or tailScore < 0 then
    return 0
  end
  local startIndex = 0
  if afterId == tailId then
    startIndex = 1
  else
    for index = 1, pageCount do
      if ARGV[index + 5] == tailId then
        startIndex = index + 1
        break
      end
    end
    if startIndex == 0 then
      return 0
    end
  end
  local suffixCount = pageCount - startIndex + 1
  if tailScore < suffixCount then
    return 0
  end
  for index = startIndex, pageCount do
    redis.call('ZADD', KEYS[1], 'NX', tailScore - (index - startIndex + 1), ARGV[index + 5])
  end
end
redis.call('ZREMRANGEBYRANK', KEYS[1], 0, -1001)
redis.call('EXPIRE', KEYS[1], ttl)
return 1
`;

export const cacheHomeTimelinePage = async ({
  profileId,
  postIds,
  after,
}: {
  readonly profileId: string;
  readonly postIds: readonly string[];
  readonly after?: string;
}): Promise<void> => {
  if (postIds.length === 0) {
    return;
  }

  const insertionScore = Temporal.Now.instant().epochMilliseconds;
  const pageIds = after === undefined ? postIds.slice(0, maximumEntries) : postIds;
  await runRedisCommand((client) => {
    return client.eval(cacheHomeTimelinePageScript, {
      keys: [feedKey(profileId)],
      arguments: [
        legacyReadyMember,
        after ?? '',
        String(pageIds.length),
        String(insertionScore),
        String(keyLifetimeSeconds),
        ...pageIds,
      ],
    });
  });
};

const fanoutScript = `
redis.call('ZREM', KEYS[1], ARGV[3])
local added = redis.call('ZADD', KEYS[1], 'NX', ARGV[1], ARGV[2])
if added == 1 then
  redis.call('ZREMRANGEBYRANK', KEYS[1], 0, -1001)
  if redis.call('TTL', KEYS[1]) == -1 then
    redis.call('EXPIRE', KEYS[1], ARGV[4])
  end
end
return added
`;

export const fanoutHomeTimelinePost = async ({
  postId,
}: {
  readonly postId: string;
}): Promise<void> => {
  if (!process.env.REDIS_URL?.trim()) {
    return;
  }

  if ((await runRedisCommand((client) => client.ping())) === null) {
    throw new Error('Redis unavailable while fanning out Home timeline post');
  }

  const viewers = await db
    .select({
      profileId: HomeFanoutViewers.id,
      post: {
        id: Posts.id,
        profileId: Posts.profileId,
        currentContentId: Posts.currentContentId,
        quoteConsentStatus: Posts.quoteConsentStatus,
        repostSourceId: Posts.repostSourceId,
      },
    })
    .from(HomeFanoutViewers)
    .innerJoin(
      HomeFanoutViewerInstances,
      eq(HomeFanoutViewerInstances.id, HomeFanoutViewers.instanceId),
    )
    .innerJoin(Posts, eq(Posts.id, postId))
    .innerJoin(Profiles, eq(Profiles.id, Posts.profileId))
    .innerJoin(Instances, eq(Instances.id, Profiles.instanceId))
    .where(
      and(
        homeTimelineCandidateWhere(),
        homePostListWhere({ db, viewerProfileId: HomeFanoutViewers.id }),
      ),
    );
  if (viewers.length === 0) {
    return;
  }

  const score = Temporal.Now.instant().epochMilliseconds;
  for (let offset = 0; offset < viewers.length; offset += candidateBatchSize) {
    const batch = viewers.slice(offset, offset + candidateBatchSize);
    const cachedMemberships = await Promise.all(
      batch.map(async (viewer) => ({
        viewer,
        cached: (await getCachedHomeTimelinePostIds(viewer.profileId, [postId])).has(postId),
      })),
    );
    const newCandidates = cachedMemberships
      .filter(({ cached }) => !cached)
      .map(({ viewer }) => ({ profileId: viewer.profileId, post: viewer.post }));
    const includedCandidates = await filterHomeTimelineMuteCandidates(newCandidates);
    const includedProfileIds = new Set(includedCandidates.map(({ profileId }) => profileId));
    const writableProfileIds = cachedMemberships
      .filter(({ cached, viewer }) => !cached && includedProfileIds.has(viewer.profileId))
      .map(({ viewer }) => viewer.profileId);
    if (writableProfileIds.length === 0) {
      continue;
    }

    const result = await runRedisCommand((client) => {
      const transaction = client.multi();
      for (const profileId of writableProfileIds) {
        transaction.eval(fanoutScript, {
          keys: [feedKey(profileId)],
          arguments: [String(score), postId, legacyReadyMember, String(keyLifetimeSeconds)],
        });
      }
      return transaction.exec();
    });
    if (result === null) {
      throw new Error('Redis unavailable while fanning out Home timeline post');
    }

    const insertResults: readonly unknown[] = Array.isArray(result.value) ? result.value : [];
    writableProfileIds.forEach((profileId, index) => {
      if (insertResults[index] === 1) {
        publishHomeTimelinePostAdded({ postId, profileId });
      }
    });
  }
};

export const touchHomeTimeline = async ({
  profileId,
}: {
  readonly profileId: string;
}): Promise<void> => {
  if (!process.env.REDIS_URL?.trim()) {
    return;
  }

  try {
    await runRedisCommand((client) => client.expire(feedKey(profileId), keyLifetimeSeconds));
  } catch {
    // Redis is disposable; a touch must not fail a Home query.
  }
};

const listHomeTimelineCandidatePage = async ({
  postId,
  afterProfileId,
  limit = candidateBatchSize,
}: {
  readonly postId: string;
  readonly afterProfileId?: string;
  readonly limit?: number;
}): Promise<{ readonly profileIds: string[]; readonly nextCursor: string | null }> => {
  const candidateRows = await db
    .select({ profileId: HomeFanoutViewers.id })
    .from(HomeFanoutViewers)
    .innerJoin(Posts, eq(Posts.id, postId))
    .where(
      and(
        afterProfileId === undefined ? undefined : gt(HomeFanoutViewers.id, afterProfileId),
        homeTimelineCandidateWhere(),
      ),
    )
    .orderBy(asc(HomeFanoutViewers.id))
    .limit(limit + 1);
  const candidates = candidateRows.slice(0, limit);
  const nextCursor = candidateRows.length > limit ? (candidates.at(-1)?.profileId ?? null) : null;
  return { profileIds: candidates.map(({ profileId }) => profileId), nextCursor };
};

export const listHomeTimelineRecipientPage = async ({
  postId,
  afterProfileId,
  limit = candidateBatchSize,
}: {
  readonly postId: string;
  readonly afterProfileId?: string;
  readonly limit?: number;
}): Promise<{ readonly profileIds: string[]; readonly nextCursor: string | null }> => {
  if (!Number.isInteger(limit) || limit < 1 || limit > maximumEntries) {
    throw new RangeError(
      `Home timeline recipient page limit must be between 1 and ${maximumEntries}`,
    );
  }

  if (!process.env.REDIS_URL?.trim()) {
    return { profileIds: [], nextCursor: null };
  }

  return listHomeTimelineCandidatePage({ postId, afterProfileId, limit });
};

export const insertHomeTimelinePost = async ({
  postId,
  profileId,
}: {
  readonly postId: string;
  readonly profileId: string;
}): Promise<void> => {
  if (!process.env.REDIS_URL?.trim()) {
    return;
  }

  const eligiblePosts = await queryHomeTimeline({ profileId, postIds: [postId], limit: 1 });
  if (eligiblePosts.length === 0) {
    return;
  }
  if ((await getCachedHomeTimelinePostIds(profileId, [postId])).has(postId)) {
    return;
  }
  if ((await filterHomeTimelinePosts({ profileId, posts: eligiblePosts })).length === 0) {
    return;
  }

  const result = await runRedisCommand((client) =>
    client.eval(fanoutScript, {
      keys: [feedKey(profileId)],
      arguments: [
        String(Temporal.Now.instant().epochMilliseconds),
        postId,
        legacyReadyMember,
        String(keyLifetimeSeconds),
      ],
    }),
  );
  if (result === null) {
    throw new Error('Redis unavailable while inserting Home timeline post');
  }
  if (result.value === 1) {
    publishHomeTimelinePostAdded({ postId, profileId });
  }
};

export const removeHomeTimelinePost = async ({
  postId,
}: {
  readonly postId: string;
}): Promise<void> => {
  if (!process.env.REDIS_URL?.trim()) {
    return;
  }

  let afterProfileId: string | undefined;
  do {
    const candidatePage = await listHomeTimelineCandidatePage({ postId, afterProfileId });
    if (candidatePage.profileIds.length > 0) {
      const removalResult = await runRedisCommand((client) => {
        const transaction = client.multi();
        for (const profileId of candidatePage.profileIds) {
          transaction.zRem(feedKey(profileId), postId);
        }
        return transaction.exec();
      });
      if (removalResult === null) {
        throw new Error('Redis unavailable while removing Home timeline post');
      }
    }
    afterProfileId = candidatePage.nextCursor ?? undefined;
  } while (afterProfileId !== undefined);
};

const reconcileScript = `
if redis.call('EXISTS', KEYS[1]) == 0 then
  return 0
end
local previousTtl = redis.call('PTTL', KEYS[1])
local removeCount = tonumber(ARGV[1])
for index = 1, removeCount do
  redis.call('ZREM', KEYS[1], ARGV[index + 1])
end
local addCountIndex = removeCount + 2
local addCount = tonumber(ARGV[addCountIndex])
for index = 1, addCount do
  local argumentIndex = addCountIndex + (index - 1) * 2 + 1
  redis.call('ZADD', KEYS[1], 'NX', ARGV[argumentIndex], ARGV[argumentIndex + 1])
end
redis.call('ZREMRANGEBYRANK', KEYS[1], 0, -1001)
if redis.call('PTTL', KEYS[1]) == -1 then
  if previousTtl >= 0 then
    redis.call('PEXPIRE', KEYS[1], previousTtl)
  else
    redis.call('EXPIRE', KEYS[1], ARGV[addCountIndex + addCount * 2 + 1])
  end
end
return 1
`;

export const reconcileHomeTimelineFollow = async ({
  profileId,
}: {
  readonly profileId: string;
}): Promise<void> => {
  if (!process.env.REDIS_URL?.trim()) {
    return;
  }

  const key = feedKey(profileId);
  const cacheResult = await runRedisCommand((client) => {
    const transaction = client.multi();
    transaction.zRem(key, legacyReadyMember);
    transaction.zRangeWithScores(key, '0', '+inf', {
      BY: 'SCORE',
      LIMIT: { offset: 0, count: maximumEntries },
    });
    return transaction.exec();
  });
  if (cacheResult === null) {
    throw new Error('Redis unavailable while reconciling Home timeline');
  }

  const [, cachedRows] = cacheResult.value as unknown as [
    number,
    { value: string; score: number }[],
  ];

  const cachedEntries = parseEntries(cachedRows);
  if (cachedEntries === null || cachedEntries.length === 0) {
    return;
  }

  const cachedPostIds = cachedEntries.map(({ postId }) => postId);
  const cachedPostIdSet = new Set(cachedPostIds);
  const currentlyEligiblePosts = await queryHomeTimeline({
    profileId,
    postIds: cachedPostIds,
    limit: maximumEntries,
  });
  const currentlyEligiblePostIds = new Set(currentlyEligiblePosts.map(({ id }) => id));
  const removePostIds = cachedPostIds.filter((postId) => !currentlyEligiblePostIds.has(postId));
  const latestEligiblePosts = await queryHomeTimeline({ profileId, limit: maximumEntries });
  const missingPosts = latestEligiblePosts.filter(({ id }) => !cachedPostIdSet.has(id));
  const addPosts = await filterHomeTimelinePosts({ profileId, posts: missingPosts });

  const result = await runRedisCommand((client) =>
    client.eval(reconcileScript, {
      keys: [key],
      arguments: [
        String(removePostIds.length),
        ...removePostIds,
        String(addPosts.length),
        ...addPosts.flatMap(({ createdAt, id }) => [String(createdAt.epochMilliseconds), id]),
        String(keyLifetimeSeconds),
      ],
    }),
  );
  if (result === null) {
    throw new Error('Redis unavailable while reconciling Home timeline');
  }
};

export const invalidateHomeTimelines = async ({
  profileIds,
}: {
  readonly profileIds?: readonly string[];
} = {}): Promise<void> => {
  if (!process.env.REDIS_URL?.trim()) {
    return;
  }

  if (profileIds !== undefined) {
    for (let offset = 0; offset < profileIds.length; offset += candidateBatchSize) {
      const keys = profileIds.slice(offset, offset + candidateBatchSize).map(feedKey);
      if (keys.length === 0) {
        continue;
      }
      if ((await runRedisCommand((client) => client.unlink(keys))) === null) {
        throw new Error('Redis unavailable while invalidating Home timelines');
      }
    }
    return;
  }

  let cursor = '0';
  do {
    const result = await runRedisCommand((client) =>
      client.scan(cursor, { MATCH: `${feedKeyPrefix}*`, COUNT: candidateBatchSize }),
    );
    if (result === null) {
      throw new Error('Redis unavailable while invalidating Home timelines');
    }
    cursor = result.value.cursor;
    if (
      result.value.keys.length > 0 &&
      (await runRedisCommand((client) => client.unlink(result.value.keys))) === null
    ) {
      throw new Error('Redis unavailable while invalidating Home timelines');
    }
  } while (cursor !== '0');
};
