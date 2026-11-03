import '@kosmo/core/polyfill';

import * as Sentry from '@sentry/node';
import { serve } from '@hono/node-server';
import { AccountState, InstanceKind, InstanceState, SessionState } from '@kosmo/core/enums';
import { Accounts, db, firstOrThrow, Instances, pg, Sessions } from '@kosmo/core/db';
import { eq } from 'drizzle-orm';
import { Hono } from 'hono';
import type { Env } from '../../src/context';

type CapturedEnvelope = [unknown, Array<[Record<string, unknown>, unknown]>];

const sentryEnvelopes: CapturedEnvelope[] = [];
const client = Sentry.getClient();
const transport = client?.getTransport();

if (!client || !transport) {
  throw new Error('Sentry tracing fixture did not initialize its local client');
}

transport.send = async (envelope) => {
  sentryEnvelopes.push(envelope as CapturedEnvelope);
  return { statusCode: 503 };
};

const publicOrigin = process.env.PUBLIC_ORIGIN;
if (!publicOrigin) {
  throw new Error('PUBLIC_ORIGIN is required');
}

const accountName = 'Sentry tracing fixture';
const authToken = process.env.TRACE_AUTH_TOKEN;
if (!authToken) {
  throw new Error('TRACE_AUTH_TOKEN is required');
}
const localInstanceOrigin = new URL(publicOrigin).origin;
const localInstance = await db
  .insert(Instances)
  .values({
    canonicalOrigin: localInstanceOrigin,
    domain: new URL(localInstanceOrigin).host,
    kind: InstanceKind.LOCAL,
    state: InstanceState.ACTIVE,
  })
  .returning()
  .then(firstOrThrow);
const account = await db
  .insert(Accounts)
  .values({
    displayName: accountName,
    oidcSubject: crypto.randomUUID(),
    state: AccountState.ACTIVE,
  })
  .returning()
  .then(firstOrThrow);
const session = await db
  .insert(Sessions)
  .values({ accountId: account.id, state: SessionState.ACTIVE, token: authToken })
  .returning()
  .then(firstOrThrow);

const [{ deriveContext }, { yoga }] = await Promise.all([
  import('../../src/context'),
  import('../../src/graphql'),
]);

const app = new Hono<Env>();
app.use('*', async (c, next) => {
  c.set('context', await deriveContext(c));
  return next();
});
app.route('/graphql', yoga);

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
  throw new Error('API tracing fixture did not bind a TCP port');
}

const sendMessage = (message: Record<string, unknown>) => {
  if (!process.send) {
    throw new Error('API tracing fixture requires an IPC parent');
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
    await db.delete(Sessions).where(eq(Sessions.id, session.id));
    await db.delete(Accounts).where(eq(Accounts.id, account.id));
    await db.delete(Instances).where(eq(Instances.id, localInstance.id));
    await pg.end();
    await Sentry.flush(1_000);
    const envelopes = JSON.parse(JSON.stringify(sentryEnvelopes)) as CapturedEnvelope[];
    await Sentry.close(1_000);
    sendMessage({ type: 'report', envelopes });
  })().catch((error: unknown) => {
    console.error('API tracing fixture shutdown failed', error);
    process.exitCode = 1;
  });
});
