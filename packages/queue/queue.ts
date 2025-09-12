import { mqRedis } from '@kosmo/redis';
import { Queue } from 'bullmq';
import { lane } from './const';

export const queue = new Queue(lane, {
  prefix: '{mq}',
  connection: mqRedis,

  defaultJobOptions: {
    attempts: 10,
    backoff: {
      type: 'exponential',
      delay: 2000,
      jitter: 0.5,
    },
  },
});
