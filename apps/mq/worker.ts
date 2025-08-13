import { logger } from '@kosmo/logger';
import { redis } from '@kosmo/redis';
import * as Sentry from '@sentry/node';
import { Worker } from 'bullmq';
import { lane } from './const';
import { crons } from './crons';
import { jobs } from './jobs';

const log = logger.getChild('mq');
const taskMap = Object.fromEntries([...jobs, ...crons].map((job) => [job.name, job.fn]));

const worker = new Worker(
  lane,
  async (job) => {
    const fn = taskMap[job.name];
    await fn?.(job.data);
  },
  {
    prefix: '{mq}',
    connection: redis,
    concurrency: 50,
  },
);

worker.on('completed', (job) => {
  log.info('Job completed {*}', { id: job.id, name: job.name });
});

worker.on('failed', (job, error) => {
  log.error('Job failed {*}', { id: job?.id, name: job?.name, error });
  Sentry.captureException(error);
});

worker.on('error', (error) => {
  log.error('Job error {*}', { error });
  Sentry.captureException(error);
});
