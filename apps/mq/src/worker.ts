import '@kosmo/service';

import { env } from '@kosmo/env';
import { ExternalServerError, UnrecoverableError } from '@kosmo/error';
import { logger } from '@kosmo/logger';
import { js, streamName } from '@kosmo/nats';
import { jobs as serviceJobs } from '@kosmo/service/define';
import { AckPolicy } from '@nats-io/jetstream';
import * as Sentry from '@sentry/node';

const consumerName = 'MQ_WORKER';

const log = logger.getChild('mq');
const textDecoder = new TextDecoder();
const jsm = await js.jetstreamManager();

await jsm.consumers.add(streamName, {
  durable_name: consumerName,
  ack_policy: AckPolicy.Explicit,
  deliver_policy: 'all',
  max_deliver: 20,
});

process.on('SIGTERM', () => {
  process.exit(0);
});

async function runWorker(workerId: number) {
  const consumer = await js.consumers.get(streamName, consumerName);
  const messages = await consumer.consume({ max_messages: 1 });
  for await (const m of messages) {
    try {
      const jobName = m.subject;
      const payload = textDecoder.decode(m.data);
      const data = JSON.parse(payload);

      const fn = serviceJobs.get(jobName);

      if (fn) {
        await fn(data);
        m.ack();
        log.info('Job completed {*}', { workerId, name: jobName });
      } else {
        log.warn('Job handler not found {*}', { workerId, name: jobName });
        // 현재 worker가 구버전일수도 있어서 job을 없애면 안됨
        m.nak();
      }
    } catch (error) {
      log.error('Job failed {*}', { workerId, name: m.subject, error });
      if (!(error instanceof ExternalServerError)) {
        Sentry.captureException(error);
      }

      if (error instanceof UnrecoverableError) {
        m.term();
      } else {
        m.nak((4 ** m.info.deliveryCount + 10 + Math.random() * m.info.deliveryCount) * 1000);
      }
    }
  }
}

await Promise.all(Array.from({ length: env.WORKER_COUNT }, (_, i) => runWorker(i)));
