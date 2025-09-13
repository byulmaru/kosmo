import { idToTimestamp } from '@kosmo/db';
import { redis } from '@kosmo/redis';
import * as I from 'iter-ops';

type InsertParams = {
  postId: string;
  profileId: string;
};

export const insert = async ({ postId, profileId }: InsertParams) => {
  await redis.zadd(`timeline:${profileId}`, idToTimestamp(postId), postId);
};

type GetParams = {
  profileId: string;
  before?: string;
  after?: string;
  limit: number;
  inverted: boolean;
};

export const getPosts = async ({ profileId, before, after, limit, inverted }: GetParams) => {
  const ids = I.pipe(
    inverted
      ? await redis.zrangebyscore(
          `timeline:${profileId}`,
          after ? `(${after}` : '-inf',
          before ? `(${before}` : '+inf',
          'WITHSCORES',
          'LIMIT',
          0,
          limit,
        )
      : await redis.zrevrangebyscore(
          `timeline:${profileId}`,
          after ? `(${after}` : '+inf',
          before ? `(${before}` : '-inf',
          'WITHSCORES',
          'LIMIT',
          0,
          limit,
        ),
    I.page(2),
    I.map(([id, score]) => ({ id, score })),
  );

  return ids;
};
