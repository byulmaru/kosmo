import { env } from '@kosmo/env';
import { stack } from '@kosmo/runtime';
import { Redlock } from '@sesamecare-oss/redlock';
import { Redis } from 'ioredis';

export const redis = new Redis(env.REDIS_URL, {
  keyPrefix: `${stack}:`,
});

export const mqRedis = new Redis(env.REDIS_URL, {
  maxRetriesPerRequest: null,
});

export const redlock = new Redlock([redis]);
