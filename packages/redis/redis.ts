import { env, stack } from '@kosmo/env';
import { Redlock } from '@sesamecare-oss/redlock';
import { Redis } from 'ioredis';

export const redis = new Redis(env.REDIS_URL, {
  keyPrefix: `${stack}:`,
});

export const redlock = new Redlock([redis]);
