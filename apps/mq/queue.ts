import { Queue } from 'bullmq';
import { stack } from '@kosmo/runtime';
import { lane } from './const';
import { redis } from '@kosmo/redis';

export const queue = new Queue(lane, {
  prefix: '{mq}',
  connection: redis,

  defaultJobOptions: {
    attempts: 5,
    backoff: {
      type: 'exponential',
      delay: 1000,
      jitter: 0.5,
    },
  },
});
