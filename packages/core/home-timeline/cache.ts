import { randomUUID } from 'node:crypto';
import { and, eq, exists, or } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';
import { Temporal } from 'temporal-polyfill';
import { db, Instances, Posts, ProfileFollows, Profiles } from '../db';
import { runRedisCommand } from '../redis/client';
import { homePostListWhere } from '../visibility/home-post-list';
import { queryHomeTimeline } from './query';

const feedKeyPrefix = 'kosmo:home-timeline:profile:';
const rebuildKeyPrefix = 'kosmo:home-timeline:rebuild:';
const readyMember = '__ready__';
const maximumEntries = 1_000;
const keyLifetimeSeconds = 300;
const candidateBatchSize = 100;
const postIdPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const inFlightRebuilds = new Map<string, Promise<void>>();

const HomeFanoutViewers = alias(Profiles, 'home_timeline_fanout_viewer');
const HomeFanoutViewerInstances = alias(Instances, 'home_timeline_fanout_viewer_instance');
const HomeFanoutReplyParents = alias(Posts, 'home_timeline_fanout_reply_parent');

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
    return transaction.exec();
  });

  if (result === null) {
    return null;
  }

  const [readyScore, cachedRows, oldestRows, cursorRows] = result.value as unknown as [
    number | null,
    { value: string; score: number }[],
    { value: string; score: number }[],
    { value: string; score: number }[] | undefined,
  ];
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

const rebuildHomeTimelineFromDatabase = async ({
  profileId,
}: {
  readonly profileId: string;
}): Promise<void> => {
  const existing = await runRedisCommand((client) =>
    client.zRangeWithScores(feedKey(profileId), '0', '+inf', {
      BY: 'SCORE',
      LIMIT: { offset: 0, count: maximumEntries },
    }),
  );
  if (existing === null) {
    return;
  }

  const posts = await queryHomeTimeline({ profileId, limit: maximumEntries });
  const existingScores = new Map(
    existing.value
      .filter(
        ({ value, score }) => value !== readyMember && postIdPattern.test(value) && score >= 0,
      )
      .map(({ value, score }) => [value, score]),
  );
  const insertionScore = Temporal.Now.instant().epochMilliseconds;
  const key = feedKey(profileId);
  const buildKey = `${rebuildKeyPrefix}${randomUUID()}`;
  await runRedisCommand((client) => {
    const transaction = client.multi();
    const entries = posts.map(({ id }) => ({
      score: existingScores.get(id) ?? insertionScore,
      value: id,
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

export const rebuildHomeTimeline = ({
  profileId,
}: {
  readonly profileId: string;
}): Promise<void> => {
  const inFlight = inFlightRebuilds.get(profileId);
  if (inFlight) {
    return inFlight;
  }

  const rebuilding = rebuildHomeTimelineFromDatabase({ profileId }).finally(() => {
    if (inFlightRebuilds.get(profileId) === rebuilding) {
      inFlightRebuilds.delete(profileId);
    }
  });
  inFlightRebuilds.set(profileId, rebuilding);
  return rebuilding;
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
  if ((await runRedisCommand((client) => client.ping())) === null) {
    return;
  }

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
  const candidateWhere = or(
    eq(HomeFanoutViewers.id, Posts.profileId),
    viewerFollowsAuthor,
    replyParentIsViewerPost,
  );
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
    .where(and(candidateWhere, homePostListWhere({ db, viewerProfileId: HomeFanoutViewers.id })));
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
      return;
    }
  }
};

export const invalidateHomeTimelines = async ({
  profileIds,
}: {
  readonly profileIds?: readonly string[];
} = {}): Promise<void> => {
  if (profileIds !== undefined) {
    for (let offset = 0; offset < profileIds.length; offset += candidateBatchSize) {
      const keys = profileIds.slice(offset, offset + candidateBatchSize).map(feedKey);
      if (keys.length === 0) {
        continue;
      }
      if ((await runRedisCommand((client) => client.unlink(keys))) === null) {
        return;
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
      return;
    }
    cursor = result.value.cursor;
    if (
      result.value.keys.length > 0 &&
      (await runRedisCommand((client) => client.unlink(result.value.keys))) === null
    ) {
      return;
    }
  } while (cursor !== '0');
};
