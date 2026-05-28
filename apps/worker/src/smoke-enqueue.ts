import {
  connectQueue,
  ensureJobStream,
  loadQueueConfig,
  publishJob,
  smokeJob,
} from '@kosmo/core/queue';

const main = async () => {
  const config = loadQueueConfig(process.env, { requireNatsUrl: true });
  const connection = await connectQueue(config);

  try {
    await ensureJobStream(connection.manager, config);
    const result = await publishJob(connection.jetstream, config, smokeJob, {
      payload: {
        message: 'smoke',
      },
    });

    console.log(
      JSON.stringify({
        event: 'job_smoke_enqueued',
        ...result,
      }),
    );
  } finally {
    await connection.nats.drain();
  }
};

main().catch((error: unknown) => {
  console.error(
    JSON.stringify({
      error: error instanceof Error ? error.message : String(error),
      event: 'job_smoke_enqueue_failed',
    }),
  );
  process.exitCode = 1;
});
