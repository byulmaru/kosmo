import {
  connectQueue,
  ensureJobConsumer,
  ensureJobStream,
  loadQueueConfig,
  runJobConsumer,
} from '@kosmo/core/queue';
import { createWorkerRegistry } from './registry';

const abortController = new AbortController();

process.once('SIGINT', () => {
  abortController.abort();
});

process.once('SIGTERM', () => {
  abortController.abort();
});

const main = async () => {
  const config = loadQueueConfig(process.env, { requireNatsUrl: true });
  const connection = await connectQueue(config);

  try {
    await ensureJobStream(connection.manager, config);
    const consumerInfo = await ensureJobConsumer(connection.manager, config);
    const consumer = await connection.jetstream.consumers.get(config.streamName, consumerInfo.name);

    console.log(
      JSON.stringify({
        consumer: config.consumerName,
        event: 'worker_started',
        stream: config.streamName,
        subjectPrefix: config.subjectPrefix,
      }),
    );

    await runJobConsumer(consumer, createWorkerRegistry(), config, {
      signal: abortController.signal,
    });
  } finally {
    await connection.nats.drain();
  }
};

main().catch((error: unknown) => {
  console.error(
    JSON.stringify({
      error: error instanceof Error ? error.message : String(error),
      event: 'worker_failed',
    }),
  );
  process.exitCode = 1;
});
