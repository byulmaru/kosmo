import { serve } from '@hono/node-server';
import { closeFedifyMetrics, configureFedifyInboxLogging, startFedifyMetrics } from '@kosmo/fedify';
import * as Sentry from '@sentry/node';
import app from './app';

configureFedifyInboxLogging(Sentry);
try {
  await startFedifyMetrics();
} catch (error) {
  await closeFedifyMetrics();
  throw error;
}

const server = serve({
  fetch: app.fetch,
  port: Number(process.env.PORT ?? 5174),
});

let shuttingDown = false;
const stop = async () => {
  if (shuttingDown) {
    return;
  }
  shuttingDown = true;

  try {
    await new Promise<void>((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
    });
  } finally {
    await closeFedifyMetrics();
  }

  process.exit(0);
};
const handleSignal = () => {
  void stop().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  });
};

process.once('SIGINT', handleSignal);
process.once('SIGTERM', handleSignal);

export default app;
