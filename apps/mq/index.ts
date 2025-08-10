import { queue } from './queue';
import { crons } from './crons';
import type { JobsOptions } from 'bullmq';
import type { JobMap, JobName } from './jobs';
import type { JobFn } from './types';

for (const cron of crons) {
  queue.upsertJobScheduler(cron.name, {
    pattern: cron.pattern,
    tz: 'Asia/Seoul',
  });
}

export const enqueueJob = async <N extends JobName, F extends JobMap[N]>(
  name: N,
  payload: F extends JobFn<infer P> ? P : never,
  options?: JobsOptions,
) => {
  await queue.add(name, payload, options);
};
