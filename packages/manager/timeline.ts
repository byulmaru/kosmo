import { idToTimestamp } from '@kosmo/db';
import { redis } from '@kosmo/redis';

type InsertParams = {
  postId: string;
  profileId: string;
};

export const insert = async ({ postId, profileId }: InsertParams) => {
  await redis.zadd(`timeline:${profileId}`, idToTimestamp(postId), postId);
};
