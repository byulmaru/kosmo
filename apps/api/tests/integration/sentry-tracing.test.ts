import assert from 'node:assert/strict';
import { spawn, type ChildProcess } from 'node:child_process';
import { once } from 'node:events';
import { randomBytes, randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';

type FixtureMessage = {
  type: 'ready' | 'report';
  port?: number;
  envelopes?: CapturedEnvelope[];
};

type CapturedEnvelope = [unknown, Array<[{ type?: string; [key: string]: unknown }, unknown]>];

type Span = {
  trace_id?: string;
  span_id?: string;
  parent_span_id?: string;
  op?: string;
  description?: string;
  start_timestamp?: number;
  timestamp?: number;
  data?: Record<string, unknown>;
  spans?: Span[];
};

const apiPackage = fileURLToPath(new URL('../../', import.meta.url));
const webPackage = fileURLToPath(new URL('../../../web/', import.meta.url));
const apiFixturePath = fileURLToPath(new URL('./sentry-tracing-api.fixture.ts', import.meta.url));
const webFixturePath = fileURLToPath(new URL('./sentry-tracing-web.fixture.ts', import.meta.url));
const apiSentryPath = fileURLToPath(new URL('../../src/sentry.ts', import.meta.url));
const webSentryPath = fileURLToPath(new URL('../../../web/src/server/sentry.ts', import.meta.url));
const testDsn = 'http://public@127.0.0.1:9/1';

const newId = (bytes: number) => randomBytes(bytes).toString('hex');

const findEnvelopePayloads = (envelopes: CapturedEnvelope[], type: string) =>
  envelopes.flatMap(([, items]) =>
    items
      .filter(([headers]) => headers.type === type)
      .map(([, payload]) => payload)
      .filter(
        (payload): payload is Record<string, unknown> =>
          typeof payload === 'object' && payload !== null,
      ),
  );

const spanFromTransaction = (event: Record<string, unknown>): Span => {
  const trace = (event.contexts as { trace?: Span } | undefined)?.trace;
  return {
    ...trace,
    description: typeof event.transaction === 'string' ? event.transaction : undefined,
    spans: Array.isArray(event.spans) ? (event.spans as Span[]) : [],
    start_timestamp: typeof event.start_timestamp === 'number' ? event.start_timestamp : undefined,
    timestamp: typeof event.timestamp === 'number' ? event.timestamp : undefined,
  };
};

const pathsContaining = (value: unknown, marker: string, path = '$'): string[] => {
  if (typeof value === 'string') {
    return value.includes(marker) ? [path] : [];
  }
  if (Array.isArray(value)) {
    return value.flatMap((item, index) => pathsContaining(item, marker, `${path}[${index}]`));
  }
  if (typeof value === 'object' && value !== null) {
    return Object.entries(value).flatMap(([key, item]) =>
      pathsContaining(item, marker, `${path}.${key}`),
    );
  }
  return [];
};

const findTraceSpans = (envelopes: CapturedEnvelope[], traceId: string): Span[] => {
  const transactionEvents = findEnvelopePayloads(envelopes, 'transaction');
  const transactionSpans = transactionEvents.flatMap((event) => {
    const root = spanFromTransaction(event);
    return [root, ...(root.spans ?? [])];
  });

  return [
    ...new Map(
      transactionSpans
        .filter((span) => span.trace_id === traceId)
        .map((span) => [span.span_id, span]),
    ).values(),
  ];
};

const transactionsForTrace = (envelopes: CapturedEnvelope[], traceId: string) =>
  findEnvelopePayloads(envelopes, 'transaction').filter((event) => {
    const trace = (event.contexts as { trace?: { trace_id?: unknown } } | undefined)?.trace;
    return trace?.trace_id === traceId;
  });

const requestBodyFor = (event: Record<string, unknown>) => {
  const data = (event.request as { data?: unknown } | undefined)?.data;
  if (typeof data !== 'string') {
    return data;
  }
  try {
    return JSON.parse(data) as unknown;
  } catch {
    return undefined;
  }
};

const hasGraphqlRequestBody = (
  events: Record<string, unknown>[],
  query: string,
  variableMarker: string,
) =>
  events.some((event) => {
    const body = requestBodyFor(event);
    if (typeof body !== 'object' || body === null || Array.isArray(body)) {
      return false;
    }
    const request = body as { query?: unknown; variables?: unknown };
    if (
      request.query !== query ||
      typeof request.variables !== 'object' ||
      request.variables === null
    ) {
      return false;
    }
    return (request.variables as Record<string, unknown>).handle === variableMarker;
  });

const spanAttributePaths = (events: Record<string, unknown>[], marker: string) =>
  events.flatMap((event) => {
    const rootSpan = (event.contexts as { trace?: { data?: unknown } } | undefined)?.trace;
    return [
      ...pathsContaining(rootSpan?.data, marker, 'rootSpan.data'),
      ...(Array.isArray(event.spans)
        ? event.spans.flatMap((span) => pathsContaining((span as Span).data, marker, 'span.data'))
        : []),
    ];
  });

type RunningFixture = {
  child: ChildProcess;
  port: number;
  nextMessage: () => Promise<FixtureMessage>;
  terminate: () => Promise<void>;
  stop: () => Promise<CapturedEnvelope[]>;
};

const waitForExit = async (exitPromise: Promise<unknown>, timeoutMs: number): Promise<boolean> => {
  let timeout: NodeJS.Timeout | undefined;
  try {
    return await Promise.race([
      exitPromise.then(() => true),
      new Promise<boolean>((resolve) => {
        timeout = setTimeout(() => resolve(false), timeoutMs);
      }),
    ]);
  } finally {
    if (timeout) {
      clearTimeout(timeout);
    }
  }
};

const terminateFixture = async (child: ChildProcess, exitPromise: Promise<unknown>) => {
  if (child.exitCode !== null || child.signalCode !== null) {
    return;
  }

  child.kill('SIGTERM');
  if (await waitForExit(exitPromise, 2_000)) {
    return;
  }

  child.kill('SIGKILL');
  if (!(await waitForExit(exitPromise, 2_000))) {
    throw new Error('Tracing fixture did not exit after SIGTERM or SIGKILL');
  }
};

const startFixture = async (
  fixturePath: string,
  sentryPath: string,
  workingDirectory: string,
  environment: NodeJS.ProcessEnv,
): Promise<RunningFixture> => {
  const child = spawn(process.execPath, ['--import', 'tsx', '--import', sentryPath, fixturePath], {
    cwd: workingDirectory,
    env: environment,
    serialization: 'advanced',
    stdio: ['ignore', 'ignore', 'pipe', 'ipc'],
  });
  const messages: FixtureMessage[] = [];
  let stderr = '';
  const waiters: Array<{
    resolve: (message: FixtureMessage) => void;
    reject: (error: Error) => void;
    timeout: NodeJS.Timeout;
  }> = [];
  let exitResult: { code: number | null; signal: NodeJS.Signals | null } | undefined;
  child.stderr?.setEncoding('utf8');
  child.stderr?.on('data', (chunk: string) => {
    stderr += chunk;
  });
  const safeStderr = () => {
    let output = stderr;
    for (const key of [
      'TRACE_AUTH_TOKEN',
      'TRACE_VARIABLE_MARKER',
      'TRACE_DOCUMENT_MARKER',
      'TRACE_QUERY_DOCUMENT',
    ]) {
      const value = environment[key];
      if (value) {
        output = output.replaceAll(value, '[redacted]');
      }
    }
    return output.trim().slice(-4_000);
  };
  const exitPromise = once(child, 'exit').then(([code, signal]) => {
    exitResult = { code: code as number | null, signal: signal as NodeJS.Signals | null };
    return exitResult;
  });

  child.on('message', (message: unknown) => {
    const fixtureMessage = message as FixtureMessage;
    const waiter = waiters.shift();
    if (waiter) {
      clearTimeout(waiter.timeout);
      waiter.resolve(fixtureMessage);
    } else {
      messages.push(fixtureMessage);
    }
  });
  child.on('exit', (code, signal) => {
    for (const waiter of waiters.splice(0)) {
      clearTimeout(waiter.timeout);
      waiter.reject(
        new Error(
          `Tracing fixture exited before its next message (${code ?? signal})${safeStderr() ? `: ${safeStderr()}` : ''}`,
        ),
      );
    }
  });

  const nextMessage = async (): Promise<FixtureMessage> => {
    if (messages.length > 0) {
      return messages.shift()!;
    }
    if (exitResult) {
      throw new Error(
        `Tracing fixture exited before its next message (${exitResult.code ?? exitResult.signal})`,
      );
    }

    return new Promise<FixtureMessage>((resolve, reject) => {
      const waiter = {
        resolve,
        reject,
        timeout: setTimeout(() => {
          const index = waiters.indexOf(waiter);
          if (index !== -1) {
            waiters.splice(index, 1);
          }
          reject(new Error('Tracing fixture did not respond within 15 seconds'));
        }, 15_000),
      };
      waiters.push(waiter);
    });
  };

  try {
    const ready = await nextMessage();
    if (ready.type !== 'ready' || typeof ready.port !== 'number') {
      throw new Error('Tracing fixture did not report a listening port');
    }

    return {
      child,
      port: ready.port,
      nextMessage,
      terminate: () => terminateFixture(child, exitPromise),
      stop: async () => {
        if (child.exitCode !== null || child.signalCode !== null) {
          throw new Error('Tracing fixture exited before it could flush its transport');
        }
        child.send({ type: 'stop' });
        const report = await nextMessage();
        if (report.type !== 'report' || !Array.isArray(report.envelopes)) {
          throw new Error('Tracing fixture did not report captured envelopes');
        }
        if (child.connected) {
          child.disconnect();
        }
        if (!(await waitForExit(exitPromise, 5_000))) {
          await terminateFixture(child, exitPromise);
        }
        const exit = await exitPromise;
        if (!exit) {
          throw new Error('Tracing fixture did not report its exit status');
        }
        const { code, signal } = exit;
        if (code !== 0) {
          throw new Error(`Tracing fixture exited unsuccessfully (${code ?? signal})`);
        }
        return report.envelopes;
      },
    };
  } catch (error) {
    try {
      await terminateFixture(child, exitPromise);
    } catch (terminationError) {
      throw new AggregateError(
        [error, terminationError],
        'Tracing fixture startup and cleanup failed',
      );
    }
    throw error;
  }
};

const stopIfRunning = async (fixture: RunningFixture | undefined) => {
  if (!fixture) {
    return;
  }
  try {
    await fixture.stop();
  } catch {
    await fixture.terminate();
  }
};

const traceHeaders = (traceId: string, parentSpanId: string, sampled: boolean) => ({
  'sentry-trace': `${traceId}-${parentSpanId}-${sampled ? '1' : '0'}`,
});

const spansFor = (spans: Span[], pattern: RegExp) =>
  spans.filter((span) =>
    pattern.test(`${span.op ?? ''} ${span.description ?? ''} ${JSON.stringify(span.data ?? {})}`),
  );

const isDescendantOf = (span: Span, ancestorId: string, spans: Span[]) => {
  const byId = new Map(
    spans.flatMap((item) => (item.span_id ? [[item.span_id, item] as const] : [])),
  );
  let parentId = span.parent_span_id;
  while (parentId) {
    if (parentId === ancestorId) {
      return true;
    }
    parentId = byId.get(parentId)?.parent_span_id;
  }
  return false;
};

test(
  'links a real Web BFF GraphQL request to API GraphQL and Postgres spans',
  { timeout: 60_000 },
  async () => {
    const authToken = `trace-auth-marker-${randomUUID()}`;
    const variableMarker = `trace-variable-marker-${randomUUID()}`;
    const documentMarker = `trace-document-marker-${randomUUID()}`;
    const traceId = newId(16);
    const incomingSpanId = newId(8);
    const unsampledTraceId = newId(16);
    const unsampledSpanId = newId(8);
    const publicOrigin = `https://sentry-tracing-${randomUUID()}.test`;
    const query = `# ${documentMarker}\nquery TraceFixture($handle: String!) { me { name } profileByHandle(handle: $handle) { id } }`;
    const metadata = {
      ...process.env,
      ENVIRONMENT: 'prod',
      EXPO_PUBLIC_SENTRY_DSN: testDsn,
      INTERNAL_API_ORIGIN: '',
      NODE_ENV: 'production',
      PUBLIC_ORIGIN: publicOrigin,
      SENTRY_RELEASE: 'kosmo-sentry-tracing-test',
      TEMPORAL_ADDRESS: '127.0.0.1:7233',
      TEMPORAL_NAMESPACE: 'test',
      TRACE_AUTH_TOKEN: authToken,
      TRACE_DOCUMENT_MARKER: documentMarker,
      TRACE_QUERY_DOCUMENT: query,
      TRACE_VARIABLE_MARKER: variableMarker,
    };
    let api: RunningFixture | undefined;
    let web: RunningFixture | undefined;

    try {
      api = await startFixture(apiFixturePath, apiSentryPath, apiPackage, metadata);
      web = await startFixture(webFixturePath, webSentryPath, webPackage, {
        ...metadata,
        INTERNAL_API_ORIGIN: `http://127.0.0.1:${api.port}`,
      });

      const request = async (trace: ReturnType<typeof traceHeaders>, useSessionCookie = false) => {
        const response = await fetch(`http://127.0.0.1:${web!.port}/graphql`, {
          body: JSON.stringify({ query, variables: { handle: variableMarker } }),
          headers: {
            'content-type': 'application/json',
            ...(useSessionCookie
              ? { cookie: `kosmo_session=${authToken}` }
              : { authorization: `Bearer ${authToken}` }),
            ...trace,
          },
          method: 'POST',
          signal: AbortSignal.timeout(10_000),
        });
        assert.equal(response.status, 200, 'the BFF must preserve the API response status');
        const result = (await response.json()) as {
          data?: { me?: { name?: string }; profileByHandle?: null };
          errors?: unknown[];
        };
        assert.deepEqual(result, {
          data: { me: { name: 'Sentry tracing fixture' }, profileByHandle: null },
        });
      };

      await request(traceHeaders(traceId, incomingSpanId, true), true);
      await request(traceHeaders(unsampledTraceId, unsampledSpanId, false));

      const [webEnvelopes, apiEnvelopes] = await Promise.all([web.stop(), api.stop()]);
      web = undefined;
      api = undefined;

      const bffSpans = findTraceSpans(webEnvelopes, traceId);
      const apiSpans = findTraceSpans(apiEnvelopes, traceId);
      const envelopeTypes = (envelopes: CapturedEnvelope[]) =>
        envelopes.map(([, items]) => items.map(([headers]) => headers.type));
      const traceSummary = (envelopes: CapturedEnvelope[]) => ({
        transactions: findEnvelopePayloads(envelopes, 'transaction').map((event) => {
          const trace = (event.contexts as { trace?: Record<string, unknown> } | undefined)?.trace;
          return {
            transaction: event.transaction,
            trace: trace && {
              trace_id: trace.trace_id,
              span_id: trace.span_id,
              parent_span_id: trace.parent_span_id,
              op: trace.op,
            },
            spans: Array.isArray(event.spans)
              ? event.spans.map((span) => {
                  const item = span as Span;
                  return {
                    trace_id: item.trace_id,
                    span_id: item.span_id,
                    parent_span_id: item.parent_span_id,
                    op: item.op,
                    description: item.description,
                    data: Object.keys(item.data ?? {}),
                  };
                })
              : [],
          };
        }),
      });
      assert.ok(
        bffSpans.length > 0,
        `the sampled BFF request must record a trace (items: ${JSON.stringify(envelopeTypes(webEnvelopes))}; trace: ${JSON.stringify(traceSummary(webEnvelopes))})`,
      );
      assert.ok(
        apiSpans.length > 0,
        `the sampled API request must record a trace (envelope item types: ${JSON.stringify(envelopeTypes(apiEnvelopes))})`,
      );
      assert.equal(findTraceSpans(webEnvelopes, unsampledTraceId).length, 0);
      assert.equal(findTraceSpans(apiEnvelopes, unsampledTraceId).length, 0);

      const assertBodyCollection = (service: string, events: Record<string, unknown>[]) => {
        assert.ok(
          hasGraphqlRequestBody(events, query, variableMarker),
          `${service} SDK request.data must retain the GraphQL query and variable values`,
        );
        for (const [label, marker] of [
          ['GraphQL document', documentMarker],
          ['GraphQL variable', variableMarker],
        ]) {
          const spanPaths = spanAttributePaths(events, marker);
          assert.equal(
            spanPaths.length,
            0,
            `${service} span attributes must not duplicate the ${label} marker (paths: ${spanPaths.join(', ')})`,
          );
        }
      };
      assertBodyCollection('BFF', transactionsForTrace(webEnvelopes, traceId));
      assertBodyCollection('API', transactionsForTrace(apiEnvelopes, traceId));

      const bffHttp = spansFor(bffSpans, /http\.server/u).find(
        (span) => span.parent_span_id === incomingSpanId,
      );
      assert.ok(bffHttp?.span_id, 'the BFF HTTP span must continue the incoming trace parent');
      const bffApiFetch = spansFor(bffSpans, /http\.client|fetch/u).find(
        (span) =>
          span.description?.includes('/graphql') &&
          isDescendantOf(span, bffHttp.span_id!, bffSpans),
      );
      assert.ok(bffApiFetch?.span_id, 'the BFF API fetch span must descend from its HTTP request');

      const apiHttp = spansFor(apiSpans, /http\.server/u).find(
        (span) => span.parent_span_id === bffApiFetch.span_id,
      );
      assert.ok(apiHttp?.span_id, 'the API HTTP span must continue the BFF API fetch span');
      const graphql = apiSpans.find(
        (span) => span.op === 'graphql.execute' && isDescendantOf(span, apiHttp.span_id!, apiSpans),
      );
      assert.ok(graphql?.span_id, 'the API GraphQL span must descend from the HTTP request');
      assert.ok(
        [graphql.description, graphql.op, ...Object.values(graphql.data ?? {})].some(
          (value) => typeof value === 'string' && value.includes('TraceFixture'),
        ),
        `the GraphQL operation name must be recorded (trace: ${JSON.stringify(traceSummary(apiEnvelopes))})`,
      );
      assert.ok(
        typeof graphql.start_timestamp === 'number' &&
          typeof graphql.timestamp === 'number' &&
          graphql.timestamp > graphql.start_timestamp,
        'the GraphQL operation must have a positive duration',
      );

      const database = spansFor(apiSpans, /db\.query|postgres|SELECT/iu).find((span) => {
        const details = `${span.description ?? ''} ${JSON.stringify(span.data ?? {})}`;
        return (
          isDescendantOf(span, graphql.span_id!, apiSpans) && /normalized_handle/i.test(details)
        );
      });
      assert.ok(
        database,
        'the bound profile-handle Postgres span must descend from GraphQL and include the normalized-handle lookup',
      );
      assert.equal(
        JSON.stringify({ description: database.description, data: database.data }).includes(
          variableMarker,
        ),
        false,
        'the bound handle value must not appear in the profile lookup Postgres span',
      );

      const authPaths = pathsContaining([webEnvelopes, apiEnvelopes], authToken);
      assert.equal(
        authPaths.length,
        0,
        `captured envelopes must omit auth credentials (paths: ${authPaths.join(', ')})`,
      );
    } finally {
      await stopIfRunning(web);
      await stopIfRunning(api);
    }
  },
);
