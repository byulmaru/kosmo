import { stack } from '@kosmo/runtime';
import { Redlock } from '@sesamecare-oss/redlock';
import { Redis } from 'ioredis';
import { env } from './env';

export const redis = new Redis(env.REDIS_URL, {
  keyPrefix: `${stack}:`,
});

export const mqRedis = new Redis(env.REDIS_URL, {
  maxRetriesPerRequest: null,
});

export const redlock = new Redlock([redis]);
