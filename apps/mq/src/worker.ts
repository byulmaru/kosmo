import '@kosmo/service';

import { logger } from '@kosmo/logger';
import { queue } from '@kosmo/queue';
import { lane } from '@kosmo/queue/const';
import { mqRedis } from '@kosmo/redis';
import { jobs as serviceJobs } from '@kosmo/service/define';
import * as Sentry from '@sentry/node';
import { Worker } from 'bullmq';
import { cronMap } from './crons';

const log = logger.getChild('mq');

for (const [cronName, { pattern }] of cronMap.entries()) {
  queue.upsertJobScheduler(cronName, {
    pattern,
    tz: 'Asia/Seoul',
  });
}

const worker = new Worker(
  lane,
  async (job) => {
    const fn = serviceJobs.get(job.name) ?? cronMap.get(job.name)?.fn;

    await fn?.(job.data);
  },
  {
    prefix: '{mq}',
    connection: mqRedis,
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
