import { serve } from '@hono/node-server';
import * as Sentry from '@sentry/node';
import { Hono } from 'hono';
import graphqlRoutes from '../../../web/src/server/routes/graphql';

type CapturedEnvelope = [unknown, Array<[Record<string, unknown>, unknown]>];

const sentryEnvelopes: CapturedEnvelope[] = [];
const client = Sentry.getClient();
const transport = client?.getTransport();

if (!client || !transport) {
  throw new Error('Web tracing fixture did not initialize its local client');
}

transport.send = async (envelope) => {
  sentryEnvelopes.push(envelope as CapturedEnvelope);
  return { statusCode: 503 };
};

const app = new Hono();
app.route('/', graphqlRoutes);

const server = serve({ fetch: app.fetch, hostname: '127.0.0.1', port: 0 });
await new Promise<void>((resolve, reject) => {
  if (server.listening) {
    resolve();
    return;
  }
  server.once('listening', resolve);
  server.once('error', reject);
});

const address = server.address();
if (!address || typeof address === 'string') {
  throw new Error('Web tracing fixture did not bind a TCP port');
}

const sendMessage = (message: Record<string, unknown>) => {
  if (!process.send) {
    throw new Error('Web tracing fixture requires an IPC parent');
  }
  process.send(message);
};

sendMessage({ type: 'ready', port: address.port });

process.on('message', (message: unknown) => {
  if (
    typeof message !== 'object' ||
    message === null ||
    (message as { type?: unknown }).type !== 'stop'
  ) {
    return;
  }

  void (async () => {
    await new Promise<void>((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
    });
    await Sentry.flush(1_000);
    const envelopes = JSON.parse(JSON.stringify(sentryEnvelopes)) as CapturedEnvelope[];
    await Sentry.close(1_000);
    sendMessage({ type: 'report', envelopes });
  })().catch((error: unknown) => {
    console.error('Web tracing fixture shutdown failed', error);
    process.exitCode = 1;
  });
});
