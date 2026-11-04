import assert from 'node:assert/strict';
import test from 'node:test';
import { evaluateNaturalLanguageMute } from './decision';
import type { NaturalLanguageMuteInput } from './decision';

const originalFetch = globalThis.fetch;
const originalApiKey = process.env.OPENAI_API_KEY;

test.afterEach(() => {
  globalThis.fetch = originalFetch;
  if (originalApiKey === undefined) {
    delete process.env.OPENAI_API_KEY;
  } else {
    process.env.OPENAI_API_KEY = originalApiKey;
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

  assert.equal(await evaluateNaturalLanguageMute(input), 'exclude');
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

test('includes a post below the 0.8 exclusion threshold', async () => {
  process.env.OPENAI_API_KEY = 'test-openai-key';
  globalThis.fetch = async () =>
    response({
      answers: [{ type: 'predicate', name: 'matches_mute_condition', probability: 0.799999 }],
    });

  assert.equal(await evaluateNaturalLanguageMute(input), 'include');
});

test('returns failure without a key or when a required image URL is invalid', async () => {
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
  assert.equal(
    await evaluateNaturalLanguageMute({
      ...input,
      post: { ...input.post, imageUrls: ['file:///private/photo.png'] },
    }),
    null,
  );
  assert.equal(fetchCalls, 0);
});

test('returns failure for network, HTTP, malformed, refusal, and invalid-answer results', async () => {
  process.env.OPENAI_API_KEY = 'test-openai-key';
  const failingFetches: Array<() => Promise<Response>> = [
    async () => {
      throw new Error('network error');
    },
    async () => response({ answers: [] }, 503),
    async () => response('not JSON'),
    async () => response({ answers: [{ type: 'refusal', name: 'matches_mute_condition' }] }),
    async () => response({ answers: [{ type: 'predicate', name: 'unexpected', probability: 1 }] }),
    async () =>
      response({
        answers: [{ type: 'predicate', name: 'matches_mute_condition', probability: null }],
      }),
    async () =>
      response({
        answers: [{ type: 'predicate', name: 'matches_mute_condition', probability: 1.1 }],
      }),
    async () =>
      response({
        answers: [
          { type: 'predicate', name: 'matches_mute_condition', probability: 1 },
          { type: 'predicate', name: 'matches_mute_condition', probability: 0 },
        ],
      }),
  ];

  for (const fetchResponse of failingFetches) {
    globalThis.fetch = async () => fetchResponse();
    assert.equal(await evaluateNaturalLanguageMute(input), null);
  }
});

test('returns failure when the request reaches its five-second deadline', async () => {
  process.env.OPENAI_API_KEY = 'test-openai-key';
  let timedOut = false;
  globalThis.fetch = async (_url, init) => {
    const signal = init?.signal;
    assert.ok(signal instanceof AbortSignal);

    return await new Promise<Response>((_resolve, reject) => {
      signal.addEventListener(
        'abort',
        () => {
          timedOut = true;
          reject(signal.reason);
        },
        { once: true },
      );
      if (signal.aborted) {
        timedOut = true;
        reject(signal.reason);
      }
    });
  };

  assert.equal(await evaluateNaturalLanguageMute(input), null);
  assert.equal(timedOut, true);
});
