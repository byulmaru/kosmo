import assert from 'node:assert/strict';
import test from 'node:test';
import * as Sentry from '@sentry/node';
import { evaluateNaturalLanguageMute } from './decision';
import type { Event, NodeOptions } from '@sentry/node';
import type { NaturalLanguageMuteInput } from './decision';

const originalFetch = globalThis.fetch;
const originalApiKey = process.env.OPENAI_API_KEY;
type CapturedEnvelope = Parameters<ReturnType<NonNullable<NodeOptions['transport']>>['send']>[0];
type CapturedItem = { readonly type: string; readonly payload: unknown };
let sentryEnvelopes: CapturedEnvelope[] | undefined;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function initializeSentry(): CapturedEnvelope[] {
  if (sentryEnvelopes !== undefined) {
    sentryEnvelopes.length = 0;
    return sentryEnvelopes;
  }

  const envelopes: CapturedEnvelope[] = [];
  Sentry.init({
    dsn: 'https://public@example.invalid/1',
    environment: 'test',
    release: 'kosmo@test',
    tracesSampleRate: 1,
    transport: () => ({
      send: async (envelope) => {
        envelopes.push(envelope);
        return { statusCode: 200 };
      },
      flush: async () => true,
    }),
  });
  Sentry.getIsolationScope().setTag('runtime', 'worker');
  sentryEnvelopes = envelopes;
  return envelopes;
}

function attributeValue(value: unknown): unknown {
  return isRecord(value) && 'value' in value ? value.value : value;
}

function capturedItems(envelopes: readonly CapturedEnvelope[]): CapturedItem[] {
  return envelopes.flatMap(([, items]) =>
    items.map(([headers, payload]) => ({ type: headers.type, payload })),
  );
}

function decisionSpanObservations(
  envelopes: readonly CapturedEnvelope[],
): Array<Record<string, unknown>> {
  const observations: Array<Record<string, unknown>> = [];
  const addSpan = (span: unknown) => {
    if (!isRecord(span)) {
      return;
    }

    const name = attributeValue(span.name ?? span.description);
    if (name !== 'smart-filter.decision') {
      return;
    }

    const attributes = isRecord(span.attributes)
      ? span.attributes
      : isRecord(span.data)
        ? span.data
        : {};
    observations.push({
      name,
      op: attributeValue(attributes['sentry.op'] ?? span.op),
      outcome: attributeValue(attributes.outcome),
      provider: attributeValue(attributes.provider),
      model: attributeValue(attributes.model),
      status: attributeValue(attributes.status),
      runtime: attributeValue(attributes.runtime),
      spanStatus: attributeValue(span.status),
    });
  };

  for (const item of capturedItems(envelopes)) {
    if (item.type === 'span' && isRecord(item.payload)) {
      if (Array.isArray(item.payload.items)) {
        item.payload.items.forEach(addSpan);
      } else {
        addSpan(item.payload);
      }
    } else if (item.type === 'transaction' && isRecord(item.payload)) {
      if (item.payload.transaction === 'smart-filter.decision') {
        const tags = isRecord(item.payload.tags) ? item.payload.tags : {};
        const contexts = isRecord(item.payload.contexts) ? item.payload.contexts : {};
        const trace = isRecord(contexts.trace) ? contexts.trace : {};
        observations.push({
          name: item.payload.transaction,
          op: trace.op,
          outcome: tags.outcome,
          provider: tags.provider,
          model: tags.model,
          status: tags.status,
          runtime: tags.runtime,
          spanStatus: trace.status,
        });
      }
      if (Array.isArray(item.payload.spans)) {
        item.payload.spans.forEach(addSpan);
      }
    }
  }

  return observations;
}

function errorEvents(envelopes: readonly CapturedEnvelope[]): Event[] {
  return capturedItems(envelopes).flatMap(({ type, payload }) =>
    type === 'event' && isRecord(payload) ? [payload as Event] : [],
  );
}

test.afterEach(async () => {
  globalThis.fetch = originalFetch;
  if (originalApiKey === undefined) {
    delete process.env.OPENAI_API_KEY;
  } else {
    process.env.OPENAI_API_KEY = originalApiKey;
  }
  if (sentryEnvelopes !== undefined) {
    await Sentry.flush(1_000);
  }
});

test.after(async () => {
  if (sentryEnvelopes !== undefined) {
    await Sentry.close(1_000);
  }
});

const input: NaturalLanguageMuteInput = {
  condition: 'contains an image of a black cat',
  post: {
    bodyText: 'A cat outside.',
    contentWarning: 'Animal photo',
    imageUrls: ['https://media.example/post.png', 'data:image/png;base64,AA=='],
  },
  source: {
    bodyText: 'A quoted photo.',
    contentWarning: null,
    imageUrls: ['https://media.example/source.jpg'],
  },
};

function response(body: unknown, status = 200): Response {
  return new Response(typeof body === 'string' ? body : (JSON.stringify(body) ?? ''), { status });
}

test('sends every outer and direct source field and image to Decisions', async () => {
  process.env.OPENAI_API_KEY = 'test-openai-key';
  let sentUrl: string | undefined;
  let sentInit: RequestInit | undefined;
  globalThis.fetch = async (url, init) => {
    sentUrl = String(url);
    sentInit = init;
    return response({
      answers: [{ type: 'predicate', name: 'matches_mute_condition', probability: 0.8 }],
    });
  };

  assert.deepEqual(await evaluateNaturalLanguageMute(input), {
    decision: 'exclude',
    probability: 0.8,
  });
  assert.equal(sentUrl, 'https://api.openai.com/v1/decisions');
  assert.equal(sentInit?.method, 'POST');
  assert.equal(new Headers(sentInit?.headers).get('authorization'), 'Bearer test-openai-key');

  const body = JSON.parse(String(sentInit?.body)) as {
    readonly input: readonly {
      readonly content: readonly Record<string, unknown>[];
      readonly role: string;
    }[];
    readonly model: string;
    readonly questions: readonly {
      readonly instructions: readonly { readonly text: string; readonly type: string }[];
      readonly name: string;
      readonly type: string;
    }[];
  };
  assert.equal(body.model, 'gpt-6-luna');
  assert.deepEqual(body.input[0]?.content, [
    {
      type: 'input_text',
      text: JSON.stringify({
        role: 'outer post',
        bodyText: input.post.bodyText,
        contentWarning: input.post.contentWarning,
      })!,
    },
    { type: 'input_image', image_url: 'https://media.example/post.png' },
    { type: 'input_image', image_url: 'data:image/png;base64,AA==' },
    {
      type: 'input_text',
      text: JSON.stringify({
        role: 'direct quote/source post',
        bodyText: input.source?.bodyText,
        contentWarning: input.source?.contentWarning,
      })!,
    },
    { type: 'input_image', image_url: 'https://media.example/source.jpg' },
  ]);
  const question = body.questions[0];
  assert.equal(question?.type, 'predicate');
  assert.equal(question?.name, 'matches_mute_condition');
  const conditionInstruction = question?.instructions.at(-1);
  assert.equal(conditionInstruction?.type, 'input_text');
  assert.ok(conditionInstruction?.text.endsWith(JSON.stringify(input.condition)!));
});

test('includes a post below the 0.8 exclusion threshold and preserves its probability', async () => {
  process.env.OPENAI_API_KEY = 'test-openai-key';
  globalThis.fetch = async () =>
    response({
      answers: [{ type: 'predicate', name: 'matches_mute_condition', probability: 0.799999 }],
    });

  assert.deepEqual(await evaluateNaturalLanguageMute(input), {
    decision: 'include',
    probability: 0.799999,
  });
});

test('keeps provider results when Sentry has no initialized client', async () => {
  assert.equal(Sentry.getClient(), undefined);
  process.env.OPENAI_API_KEY = 'test-openai-key';
  globalThis.fetch = async () =>
    response({
      answers: [{ type: 'predicate', name: 'matches_mute_condition', probability: 0.5 }],
    });

  assert.deepEqual(await evaluateNaturalLanguageMute(input), {
    decision: 'include',
    probability: 0.5,
  });

  globalThis.fetch = async () => {
    throw new Error('provider failure');
  };
  assert.equal(await evaluateNaturalLanguageMute(input), null);
});

test('records a bounded Decision span without an error on success', async () => {
  process.env.OPENAI_API_KEY = 'test-openai-key';
  const envelopes = initializeSentry();
  globalThis.fetch = async () =>
    response({
      answers: [{ type: 'predicate', name: 'matches_mute_condition', probability: 0.8 }],
    });

  assert.deepEqual(await evaluateNaturalLanguageMute(input), {
    decision: 'exclude',
    probability: 0.8,
  });
  assert.equal(await Sentry.flush(1_000), true);

  const [decisionSpan] = decisionSpanObservations(envelopes);
  assert.ok(decisionSpan, 'the in-memory transport must receive the Decision span');
  assert.equal(decisionSpan.name, 'smart-filter.decision');
  assert.equal(decisionSpan.op, 'ai.decision');
  assert.equal(decisionSpan.provider, 'openai');
  assert.equal(decisionSpan.model, 'gpt-6-luna');
  assert.equal(decisionSpan.outcome, 'success');
  assert.equal(decisionSpan.status, 200);
  assert.equal(decisionSpan.runtime, 'worker');
  assert.equal(decisionSpan.spanStatus, 'ok');
  assert.equal(errorEvents(envelopes).length, 0);
});

test('returns failure without a key or when a required image URL is invalid', async () => {
  const envelopes = initializeSentry();
  let fetchCalls = 0;
  globalThis.fetch = async () => {
    fetchCalls += 1;
    return response({
      answers: [{ type: 'predicate', name: 'matches_mute_condition', probability: 1 }],
    });
  };

  delete process.env.OPENAI_API_KEY;
  assert.equal(await evaluateNaturalLanguageMute(input), null);

  process.env.OPENAI_API_KEY = 'test-openai-key';
  assert.equal(await evaluateNaturalLanguageMute({ ...input, condition: '   ' }), null);
  assert.equal(
    await evaluateNaturalLanguageMute({
      ...input,
      post: { ...input.post, imageUrls: ['file:///private/photo.png'] },
    }),
    null,
  );
  assert.equal(fetchCalls, 0);
  assert.equal(await Sentry.flush(1_000), true);
  assert.equal(
    capturedItems(envelopes).filter(
      ({ type }) => type === 'event' || type === 'span' || type === 'transaction',
    ).length,
    0,
  );
});

test('captures bounded outcomes and excludes inherited request data from telemetry', async () => {
  process.env.OPENAI_API_KEY = 'test-openai-key';
  const envelopes = initializeSentry();
  const secret = 'decision-sentry-sensitive-sentinel';
  const sensitiveInput: NaturalLanguageMuteInput = {
    ...input,
    condition: secret,
    post: { ...input.post, bodyText: secret },
    source: { ...input.source!, bodyText: secret },
  };
  const isolationScope = Sentry.getIsolationScope();
  const previousNormalizedRequest =
    isolationScope.getScopeData().sdkProcessingMetadata.normalizedRequest;
  const rateLimited = response(secret, 429);
  const serverError = response(secret, 503);
  const failureCases: Array<{
    readonly outcome: string;
    readonly status?: number;
    readonly fetch: (signal: AbortSignal | undefined) => Promise<Response>;
  }> = [
    { outcome: 'rate_limited', status: 429, fetch: async () => rateLimited },
    { outcome: 'http_error', status: 503, fetch: async () => serverError },
    {
      outcome: 'network_error',
      fetch: async () => {
        throw new Error(secret);
      },
    },
    { outcome: 'invalid_response', status: 200, fetch: async () => response(secret, 200) },
    { outcome: 'invalid_response', status: 200, fetch: async () => response({ answers: [] }) },
    {
      outcome: 'invalid_response',
      status: 200,
      fetch: async () =>
        response({ answers: [{ type: 'refusal', name: 'matches_mute_condition' }] }),
    },
    {
      outcome: 'invalid_response',
      status: 200,
      fetch: async () =>
        response({ answers: [{ type: 'predicate', name: 'unexpected', probability: 1 }] }),
    },
    {
      outcome: 'invalid_response',
      status: 200,
      fetch: async () =>
        response({
          answers: [{ type: 'predicate', name: 'matches_mute_condition', probability: null }],
        }),
    },
    {
      outcome: 'invalid_response',
      status: 200,
      fetch: async () =>
        response({
          answers: [{ type: 'predicate', name: 'matches_mute_condition', probability: 1.1 }],
        }),
    },
    {
      outcome: 'invalid_response',
      status: 200,
      fetch: async () =>
        response({
          answers: [
            { type: 'predicate', name: 'matches_mute_condition', probability: 1 },
            { type: 'predicate', name: 'matches_mute_condition', probability: 0 },
          ],
        }),
    },
    {
      outcome: 'timeout',
      fetch: async (signal) => {
        assert.ok(signal instanceof AbortSignal);
        return await new Promise<Response>((_resolve, reject) => {
          signal.addEventListener('abort', () => reject(signal.reason), { once: true });
          if (signal.aborted) {
            reject(signal.reason);
          }
        });
      },
    },
  ];

  for (const failureCase of failureCases) {
    globalThis.fetch = async (_url, init) => failureCase.fetch(init?.signal ?? undefined);
    if (failureCase.outcome === 'network_error') {
      try {
        await Sentry.withScope(async (scope) => {
          scope.setUser({ id: secret });
          scope.setExtra('private', secret);
          scope.setContext('private', { text: secret });
          scope.addBreadcrumb({ category: 'private', data: { text: secret } });
          scope.addAttachment({ filename: 'private.txt', data: Buffer.from(secret) });
          scope.addEventProcessor((event) => ({
            ...event,
            request: { url: `https://kosmo.invalid/${secret}`, data: secret },
            user: { id: secret },
            extra: { private: secret },
            tags: { ...event.tags, private: secret, runtime: 'worker' },
            contexts: {
              trace: {
                trace_id: 'a'.repeat(32),
                span_id: 'b'.repeat(16),
                op: 'ai.decision',
                status: 'internal_error',
                data: { private: secret },
              },
              private: { text: secret },
            },
            breadcrumbs: [{ category: 'private', data: { text: secret }, timestamp: 1 }],
            sdkProcessingMetadata: {
              normalizedRequest: { url: `https://kosmo.invalid/${secret}`, data: secret },
            },
          }));
          isolationScope.setSDKProcessingMetadata({
            normalizedRequest: {
              url: `https://kosmo.invalid/${secret}`,
              method: 'POST',
              data: secret,
            },
          });
          assert.equal(await evaluateNaturalLanguageMute(sensitiveInput), null);
        });
      } finally {
        isolationScope.setSDKProcessingMetadata({ normalizedRequest: previousNormalizedRequest });
      }
    } else {
      assert.equal(await evaluateNaturalLanguageMute(sensitiveInput), null);
    }
  }

  assert.equal(rateLimited.bodyUsed, false);
  assert.equal(serverError.bodyUsed, false);
  assert.equal(await Sentry.flush(1_000), true);

  const events = errorEvents(envelopes);
  const byOutcome = new Map(events.map((event) => [event.tags?.outcome, event]));
  const expectedStatuses = new Map(failureCases.map(({ outcome, status }) => [outcome, status]));
  for (const outcome of [
    'rate_limited',
    'http_error',
    'network_error',
    'invalid_response',
    'timeout',
  ]) {
    assert.ok(byOutcome.has(outcome), `an error event must report ${outcome}`);
  }

  for (const event of byOutcome.values()) {
    assert.equal(event.environment, 'test');
    assert.equal(event.release, 'kosmo@test');
    assert.equal(event.tags?.provider, 'openai');
    assert.equal(event.tags?.model, 'gpt-6-luna');
    assert.equal(event.tags?.runtime, 'worker');
    assert.equal(event.tags?.status, expectedStatuses.get(String(event.tags?.outcome)));
    assert.ok(
      Object.keys(event.tags ?? {}).every((key) =>
        ['outcome', 'provider', 'model', 'status', 'runtime'].includes(key),
      ),
    );
    assert.ok(
      event.exception?.values?.some(
        ({ value, stacktrace }) =>
          value?.startsWith('Smart Filter Decision request failed:') &&
          (stacktrace?.frames?.length ?? 0) > 0,
      ),
    );
    assert.ok(Object.keys(event.contexts ?? {}).every((key) => key === 'trace'));
    const trace = event.contexts?.trace;
    assert.ok(
      Object.keys(trace ?? {}).every((key) =>
        ['trace_id', 'span_id', 'op', 'status'].includes(key),
      ),
    );
    assert.ok(!JSON.stringify(event).includes(secret));
  }

  const spans = decisionSpanObservations(envelopes);
  assert.ok(spans.some(({ outcome }) => outcome === 'rate_limited'));
  assert.ok(spans.some(({ outcome }) => outcome === 'http_error'));
  assert.ok(spans.some(({ outcome }) => outcome === 'network_error'));
  assert.ok(spans.some(({ outcome }) => outcome === 'invalid_response'));
  assert.ok(spans.some(({ outcome }) => outcome === 'timeout'));
  assert.ok(spans.every(({ spanStatus }) => spanStatus === 'error'));
  assert.ok(
    spans.every(
      ({ provider, model, runtime }) =>
        provider === 'openai' && model === 'gpt-6-luna' && runtime === 'worker',
    ),
  );
  assert.ok(capturedItems(envelopes).every(({ type }) => type !== 'attachment'));
  assert.ok(!JSON.stringify(envelopes).includes(secret));
});

test('Sentry setup failures do not change success or fail-open results', async (context) => {
  process.env.OPENAI_API_KEY = 'test-openai-key';
  const envelopes = initializeSentry();
  let fetchCalls = 0;
  const setMetadata = context.mock.method(
    Sentry.Scope.prototype,
    'setSDKProcessingMetadata',
    () => {
      throw new Error('Sentry setup failed');
    },
  );

  globalThis.fetch = async () => {
    fetchCalls += 1;
    return response({
      answers: [{ type: 'predicate', name: 'matches_mute_condition', probability: 0.5 }],
    });
  };
  assert.deepEqual(await evaluateNaturalLanguageMute(input), {
    decision: 'include',
    probability: 0.5,
  });

  globalThis.fetch = async () => {
    fetchCalls += 1;
    throw new Error('provider failure');
  };
  assert.equal(await evaluateNaturalLanguageMute(input), null);
  assert.equal(fetchCalls, 2);
  setMetadata.mock.restore();
  assert.equal(await Sentry.flush(1_000), true);
  assert.equal(capturedItems(envelopes).length, 0);
});
