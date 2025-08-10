import { Redlock } from '@sesamecare-oss/redlock';
import { Redis } from 'ioredis';
import { env } from './env';
import { stack } from '@kosmo/runtime';

export const redis = new Redis.Cluster([env.REDIS_URL], {
  keyPrefix: `${stack}:`,
});

export const redlock = new Redlock([redis]);
