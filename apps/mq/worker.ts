import { lane } from './const';
import { Worker } from 'bullmq';
import { logger } from '@kosmo/commonlib/logger';
import * as Sentry from '@sentry/node';
import { jobs } from './jobs';
import { crons } from './crons';
import { redis } from '@kosmo/redis';

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
