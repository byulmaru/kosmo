import { runRedisCommand } from '../redis/client';

const feedKeyPrefix = 'kosmo:home-timeline:profile:';

export const homeTimelineFeedKey = (profileId: string) => `${feedKeyPrefix}${profileId}`;

export const getCachedHomeTimelinePostIds = async (
  profileId: string,
  postIds: readonly string[],
): Promise<Set<string>> => {
  if (postIds.length === 0) {
    return new Set();
  }

  const result = await runRedisCommand((client) => {
    const transaction = client.multi();
    for (const postId of postIds) {
      transaction.zScore(homeTimelineFeedKey(profileId), postId);
    }
    return transaction.exec();
  });

  if (result === null) {
    return new Set();
  }

  const scores = result.value as unknown as (number | null)[];
  const cachedPostIds = new Set<string>();
  for (let index = 0; index < postIds.length; index += 1) {
    const score = scores[index];
    if (typeof score === 'number' && Number.isFinite(score)) {
      cachedPostIds.add(postIds[index]!);
    }
  }
  return cachedPostIds;
};
