import { randomUUID } from 'node:crypto';
import { and, asc, eq, exists, gt, or } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';
import { Temporal } from 'temporal-polyfill';
import { db, Instances, Posts, ProfileFollows, Profiles } from '../db';
import { runRedisCommand } from '../redis/client';
import { homePostListWhere } from '../visibility/home-post-list';
import { queryHomeTimeline } from './query';

const feedKeyPrefix = 'kosmo:home-timeline:profile:';
const seedKeyPrefix = 'kosmo:home-timeline:seed:';
const readyMember = '__ready__';
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

const feedKey = (profileId: string) => `${feedKeyPrefix}${profileId}`;

const parseEntries = (
  entries: readonly { value: string; score: number }[],
): HomeTimelineEntry[] | null => {
  const parsed: HomeTimelineEntry[] = [];
  for (const { value, score } of entries) {
    if (
      value === readyMember ||
      !postIdPattern.test(value) ||
      !Number.isFinite(score) ||
      score < 0
    ) {
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
    transaction.zScore(feedKey(profileId), readyMember);
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

  const [readyScore, cachedRows, oldestRows] = result.value as unknown as [
    number | null,
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
  if (readyScore !== -1) {
    return null;
  }

  const entries = parseEntries(cachedRows);
  const oldestEntries = parseEntries(oldestRows);
  const cursorEntries = parseEntries(cursorRows ?? []);
  if (entries === null || oldestEntries === null || cursorEntries === null) {
    return null;
  }

  return {
    entries,
    oldestPostId: oldestEntries[0]?.postId ?? null,
    anchorPostId: cursorEntries[0]?.postId ?? oldestEntries[0]?.postId ?? null,
  };
};

const appendHomeTimelinePageScript = `
local readyRows = redis.call('ZRANGE', KEYS[1], 0, 0, 'WITHSCORES')
if #readyRows ~= 2 or readyRows[1] ~= ARGV[1] or tonumber(readyRows[2]) ~= -1 then
  return 0
end
local tailRows = redis.call('ZRANGE', KEYS[1], 1, 1, 'WITHSCORES')
if #tailRows ~= 2 then
  return 0
end
local tailId = tailRows[1]
local tailScore = tonumber(tailRows[2])
if not tailScore or tailScore < 0 then
  return 0
end
local afterId = ARGV[2]
local pageCount = tonumber(ARGV[3])
local startIndex = 0
if afterId == tailId then
  startIndex = 1
else
  for index = 1, pageCount do
    if ARGV[index + 3] == tailId then
      startIndex = index + 1
      break
    end
  end
  if startIndex == 0 then
    return 0
  end
end
for index = startIndex, pageCount do
  redis.call('ZADD', KEYS[1], 'NX', tailRows[2], ARGV[index + 3])
end
redis.call('ZREMRANGEBYRANK', KEYS[1], 1, -1001)
redis.call('EXPIRE', KEYS[1], ARGV[pageCount + 4])
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
  const key = feedKey(profileId);

  if (after !== undefined) {
    if (postIds.length === 0) {
      return;
    }

    await runRedisCommand((client) =>
      client.eval(appendHomeTimelinePageScript, {
        keys: [key],
        arguments: [
          readyMember,
          after,
          String(postIds.length),
          ...postIds,
          String(keyLifetimeSeconds),
        ],
      }),
    );
    return;
  }

  const existing = await runRedisCommand((client) =>
    client.zRangeWithScores(key, '0', '+inf', {
      BY: 'SCORE',
      LIMIT: { offset: 0, count: maximumEntries },
    }),
  );
  if (existing === null) {
    return;
  }

  const existingScores = new Map(
    existing.value
      .filter(
        ({ value, score }) =>
          value !== readyMember &&
          postIdPattern.test(value) &&
          Number.isFinite(score) &&
          score >= 0,
      )
      .map(({ value, score }) => [value, score]),
  );
  const insertionScore = Temporal.Now.instant().epochMilliseconds;
  const buildKey = `${seedKeyPrefix}${randomUUID()}`;
  await runRedisCommand((client) => {
    const transaction = client.multi();
    const entries = postIds.slice(0, maximumEntries).map((postId) => ({
      score: existingScores.get(postId) ?? insertionScore,
      value: postId,
    }));
    if (entries.length > 0) {
      transaction.zAdd(buildKey, entries);
    }
    transaction.zAdd(buildKey, { score: -1, value: readyMember });
    transaction.expire(buildKey, keyLifetimeSeconds);
    transaction.rename(buildKey, key);
    transaction.expire(key, keyLifetimeSeconds);
    return transaction.exec();
  });
};

const fanoutScript = `
if redis.call('ZSCORE', KEYS[1], ARGV[3]) ~= '-1' then
  return 0
end
local added = redis.call('ZADD', KEYS[1], 'NX', ARGV[1], ARGV[2])
if added == 1 then
  redis.call('ZREMRANGEBYRANK', KEYS[1], 1, -1001)
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
    .select({ profileId: HomeFanoutViewers.id })
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
    const result = await runRedisCommand((client) => {
      const transaction = client.multi();
      for (const { profileId } of batch) {
        transaction.eval(fanoutScript, {
          keys: [feedKey(profileId)],
          arguments: [String(score), postId, readyMember],
        });
      }
      return transaction.exec();
    });
    if (result === null) {
      throw new Error('Redis unavailable while fanning out Home timeline post');
    }
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
}: {
  readonly postId: string;
  readonly afterProfileId?: string;
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
    .limit(candidateBatchSize + 1);
  const candidates = candidateRows.slice(0, candidateBatchSize);
  const nextCursor =
    candidateRows.length > candidateBatchSize ? (candidates.at(-1)?.profileId ?? null) : null;
  return { profileIds: candidates.map(({ profileId }) => profileId), nextCursor };
};

export const listHomeTimelineRecipientPage = async ({
  postId,
  afterProfileId,
}: {
  readonly postId: string;
  readonly afterProfileId?: string;
}): Promise<{ readonly profileIds: string[]; readonly nextCursor: string | null }> => {
  if (!process.env.REDIS_URL?.trim()) {
    return { profileIds: [], nextCursor: null };
  }

  const candidatePage = await listHomeTimelineCandidatePage({ postId, afterProfileId });
  if (candidatePage.profileIds.length === 0) {
    return candidatePage;
  }

  const readyResult = await runRedisCommand((client) => {
    const transaction = client.multi();
    for (const profileId of candidatePage.profileIds) {
      transaction.zScore(feedKey(profileId), readyMember);
    }
    return transaction.exec();
  });
  if (readyResult === null) {
    throw new Error('Redis unavailable while listing Home timeline recipients');
  }

  const readyScores = readyResult.value as unknown as (number | null)[];
  return {
    profileIds: candidatePage.profileIds.filter((_, index) => readyScores[index] === -1),
    nextCursor: candidatePage.nextCursor,
  };
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

  const readyResult = await runRedisCommand((client) =>
    client.zScore(feedKey(profileId), readyMember),
  );
  if (readyResult === null) {
    throw new Error('Redis unavailable while inserting Home timeline post');
  }
  if (readyResult.value !== -1) {
    return;
  }

  const eligiblePosts = await queryHomeTimeline({ profileId, postIds: [postId], limit: 1 });
  if (eligiblePosts.length === 0) {
    return;
  }

  const result = await runRedisCommand((client) =>
    client.eval(fanoutScript, {
      keys: [feedKey(profileId)],
      arguments: [String(Temporal.Now.instant().epochMilliseconds), postId, readyMember],
    }),
  );
  if (result === null) {
    throw new Error('Redis unavailable while inserting Home timeline post');
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
if redis.call('ZSCORE', KEYS[1], ARGV[1]) ~= '-1' then
  return 0
end
local removeCount = tonumber(ARGV[2])
for index = 1, removeCount do
  redis.call('ZREM', KEYS[1], ARGV[index + 2])
end
local scoreIndex = removeCount + 3
local score = ARGV[scoreIndex]
local addCount = tonumber(ARGV[scoreIndex + 1])
for index = 1, addCount do
  redis.call('ZADD', KEYS[1], 'NX', score, ARGV[scoreIndex + index + 1])
end
redis.call('ZREMRANGEBYRANK', KEYS[1], 1, -1001)
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
    transaction.zScore(key, readyMember);
    transaction.zRangeWithScores(key, '0', '+inf', {
      BY: 'SCORE',
      LIMIT: { offset: 0, count: maximumEntries },
    });
    return transaction.exec();
  });
  if (cacheResult === null) {
    throw new Error('Redis unavailable while reconciling Home timeline');
  }

  const [readyScore, cachedRows] = cacheResult.value as unknown as [
    number | null,
    { value: string; score: number }[],
  ];
  if (readyScore !== -1) {
    return;
  }

  const cachedEntries = parseEntries(cachedRows);
  if (cachedEntries === null) {
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
  const addPostIds = latestEligiblePosts
    .map(({ id }) => id)
    .filter((postId) => !cachedPostIdSet.has(postId));

  const result = await runRedisCommand((client) =>
    client.eval(reconcileScript, {
      keys: [key],
      arguments: [
        readyMember,
        String(removePostIds.length),
        ...removePostIds,
        String(Temporal.Now.instant().epochMilliseconds),
        String(addPostIds.length),
        ...addPostIds,
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
