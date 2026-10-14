import assert from 'node:assert/strict';
import { mock, test } from 'node:test';
import * as Sentry from '@sentry/node';

process.env.DATABASE_URL ??= 'postgres://kosmo:kosmo@localhost:54329/kosmo_test';

test('records sanitized Postgres.js query spans under sampled request spans', async (context) => {
  const envelopes: unknown[] = [];
  let pg: typeof import('@kosmo/core/db').pg | undefined;
  let restoreSend: (() => void) | undefined;

  context.after(async () => {
    await pg?.end();
    await Sentry.close(1_000);
    restoreSend?.();
  });

  Sentry.init({
    dsn: 'https://public@example.invalid/1',
    environment: 'test',
    integrations: [Sentry.postgresJsIntegration()],
    release: 'kosmo@query-tracing-test',
    sendDefaultPii: false,
    tracesSampleRate: 1,
  });

  const transport = Sentry.getClient()?.getTransport();
  assert.ok(transport);
  const send = mock.method(transport, 'send', async (envelope) => {
    envelopes.push(envelope);
    return { statusCode: 200 };
  });
  restoreSend = () => send.mock.restore();

  // Install Sentry's ESM integration before postgres is imported.
  const coreDb = await import('@kosmo/core/db');
  const { sql } = await import('drizzle-orm');
  pg = coreDb.pg;

  const collectDatabaseSpans = (rootSpan: Sentry.Span) =>
    Sentry.getSpanDescendants(rootSpan)
      .map(Sentry.spanToJSON)
      .filter((span) => span.data?.['db.system.name'] === 'postgres');

  await coreDb.db.execute(sql`SELECT ${'outside-request-secret'}::text AS outside_request`);

  const firstRequest = await Sentry.startSpan(
    { name: 'GET /representative', op: 'http.server' },
    async (rootSpan) => {
      await coreDb.db.execute(sql`SELECT ${'sensitive-primary-value'}::text AS primary_value`);
      await coreDb.db.transaction((transaction) =>
        transaction.execute(
          sql`SELECT ${'sensitive-transaction-value'}::text AS transaction_value`,
        ),
      );
      await assert.rejects(coreDb.db.execute(sql`SELECT 1 / 0 AS intentional_failure`));

      return {
        databaseSpans: collectDatabaseSpans(rootSpan),
        spanContext: rootSpan.spanContext(),
      };
    },
  );
  const secondRequest = await Sentry.startSpan(
    { name: 'GET /second-representative', op: 'http.server' },
    async (rootSpan) => {
      await coreDb.db.execute(
        sql`SELECT ${'sensitive-second-request-value'}::text AS second_request`,
      );

      return {
        databaseSpans: collectDatabaseSpans(rootSpan),
        spanContext: rootSpan.spanContext(),
      };
    },
  );

  const requestSpans = [firstRequest, secondRequest];
  for (const request of requestSpans) {
    assert.ok(request.databaseSpans.length > 0);
    for (const span of request.databaseSpans) {
      assert.equal(span.trace_id, request.spanContext.traceId);
      assert.ok(span.parent_span_id);
      assert.equal(typeof span.start_timestamp, 'number');
      assert.equal(typeof span.timestamp, 'number');
      assert.ok((span.timestamp ?? 0) >= (span.start_timestamp ?? 0));
    }
  }
  assert.notEqual(firstRequest.spanContext.traceId, secondRequest.spanContext.traceId);

  const allDatabaseSpans = requestSpans.flatMap((request) => request.databaseSpans);
  const matchingQuerySpans = (alias: string) =>
    allDatabaseSpans.filter((span) =>
      String(span.data?.['db.query.text'] ?? '').toLowerCase().includes(alias.toLowerCase()),
    );
  const queryAliases = [
    'primary_value',
    'transaction_value',
    'intentional_failure',
    'second_request',
  ];
  for (const alias of queryAliases) {
    assert.equal(matchingQuerySpans(alias).length, 1, `expected one span for ${alias}`);
  }
  const failedQuerySpan = matchingQuerySpans('intentional_failure')[0];
  assert.ok(failedQuerySpan?.status);
  assert.notEqual(failedQuerySpan.status, 'ok');
  assert.equal(matchingQuerySpans('outside_request').length, 0);

  assert.equal(await Sentry.flush(1_000), true);
  const serializedEnvelopes = JSON.stringify(envelopes);
  assert.match(serializedEnvelopes, /db\.query\.text/);
  assert.match(serializedEnvelopes, /primary_value/);
  assert.equal(serializedEnvelopes.includes('outside_request'), false);
  const sensitiveValues = [
    'outside-request-secret',
    'sensitive-primary-value',
    'sensitive-transaction-value',
    'sensitive-second-request-value',
  ];
  for (const sensitiveValue of sensitiveValues) {
    assert.equal(serializedEnvelopes.includes(sensitiveValue), false);
  }
});
