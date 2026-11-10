import assert from 'node:assert/strict';
import { test } from 'node:test';
import { fetchLinkPreview } from './link-preview-client.js';

const normalizedUrl = 'https://preview.example/article?source=a%20b#summary';
const originalEmbedApiKey = process.env.EMBED_API_KEY;

function setEmbedApiKey(value: string | undefined): void {
  if (value === undefined) {
    delete process.env.EMBED_API_KEY;
  } else {
    process.env.EMBED_API_KEY = value;
  }
}

function restoreEmbedApiKey(): void {
  setEmbedApiKey(originalEmbedApiKey);
}

test('requests metadata with the Bearer key and keeps the requested normalized URL', async (t) => {
  t.after(restoreEmbedApiKey);
  setEmbedApiKey('  test-embed-key  ');

  let requestUrl: URL | undefined;
  let requestInit: RequestInit | undefined;
  t.mock.method(globalThis, 'fetch', async (input: string | URL | Request, init?: RequestInit) => {
    requestUrl = new URL(String(input));
    requestInit = init;
    return new Response(
      JSON.stringify({
        url: 'https://embed.byulmaru.co/requested-url',
        canonicalUrl: 'https://publisher.example/canonical',
        title: '  Example title  ',
        description: '   ',
        image: 'https://CDN.EXAMPLE:443/card.png',
        imageWidth: 1200,
        imageHeight: 630,
        siteName: 42,
        type: 'article',
        favicon: 'https://cdn.example/favicon.ico',
      }),
      { headers: { 'content-type': 'application/json; charset=utf-8' } },
    );
  });

  const preview = await fetchLinkPreview(
    'HTTPS://PREVIEW.EXAMPLE:443/article?source=a%20b#summary',
  );

  assert.equal(requestUrl?.origin, 'https://embed.byulmaru.co');
  assert.equal(requestUrl?.pathname, '/api/metadata');
  assert.equal(requestUrl?.searchParams.get('url'), normalizedUrl);
  assert.equal(requestInit?.method, 'GET');
  assert.equal(new Headers(requestInit?.headers).get('accept'), 'application/json');
  assert.equal(new Headers(requestInit?.headers).get('authorization'), 'Bearer test-embed-key');
  assert.equal(requestInit?.redirect, 'error');
  assert.ok(requestInit?.signal);
  assert.deepEqual(preview, {
    url: normalizedUrl,
    title: 'Example title',
    description: null,
    imageUrl: 'https://cdn.example/card.png',
    imageWidth: 1200,
    imageHeight: 630,
  });
});

test('does not request metadata when the API key is missing or blank', async (t) => {
  t.after(restoreEmbedApiKey);
  let requests = 0;
  t.mock.method(globalThis, 'fetch', async () => {
    requests += 1;
    return new Response(null);
  });

  for (const key of [undefined, '   ']) {
    setEmbedApiKey(key);
    assert.equal(await fetchLinkPreview(normalizedUrl), null);
  }

  assert.equal(requests, 0);
});

test('returns null for invalid JSON, non-JSON, HTTP errors, and malformed metadata', async (t) => {
  t.after(restoreEmbedApiKey);
  setEmbedApiKey('test-embed-key');

  const responses = [
    new Response('{', { headers: { 'content-type': 'application/json' } }),
    new Response('{"url":"https://preview.example/","title":"Title"}', {
      headers: { 'content-type': 'text/html' },
    }),
    new Response('{"title":"Title"}', {
      headers: { 'content-type': 'application/json' },
    }),
    new Response('{"url":"https://preview.example/","title":"Title"}', {
      status: 503,
      headers: { 'content-type': 'application/json' },
    }),
    new Response(JSON.stringify({ url: normalizedUrl, title: 42 }), {
      headers: { 'content-type': 'application/json' },
    }),
  ];
  t.mock.method(globalThis, 'fetch', async () => responses.shift()!);

  for (let index = 0; index < 5; index += 1) {
    assert.equal(await fetchLinkPreview(normalizedUrl), null);
  }
});

test('cancels an HTTP error response without reading its body', async (t) => {
  t.after(restoreEmbedApiKey);
  setEmbedApiKey('test-embed-key');
  let bodyCanceled = false;
  t.mock.method(
    globalThis,
    'fetch',
    async () =>
      new Response(
        new ReadableStream({
          cancel() {
            bodyCanceled = true;
          },
        }),
        { status: 503, headers: { 'content-type': 'application/json' } },
      ),
  );

  assert.equal(await fetchLinkPreview(normalizedUrl), null);
  assert.equal(bodyCanceled, true);
});

test('returns null when the response body exceeds the received-byte limit', async (t) => {
  t.after(restoreEmbedApiKey);
  setEmbedApiKey('test-embed-key');
  const encoder = new TextEncoder();
  const bodyChunks = [
    encoder.encode(`{"url":"${normalizedUrl}","title":"A usable title","description":"`),
    encoder.encode('x'.repeat(512 * 1024)),
    encoder.encode('"}'),
  ];
  t.mock.method(
    globalThis,
    'fetch',
    async () =>
      new Response(
        new ReadableStream<Uint8Array>({
          start(controller) {
            for (const chunk of bodyChunks) {
              controller.enqueue(chunk);
            }
            controller.close();
          },
        }),
        { headers: { 'content-type': 'application/json' } },
      ),
  );

  assert.equal(await fetchLinkPreview(normalizedUrl), null);
});

test('returns null when the API request exceeds its deadline', async (t) => {
  t.after(restoreEmbedApiKey);
  setEmbedApiKey('test-embed-key');
  t.mock.timers.enable({ apis: ['setTimeout'] });
  let signal: AbortSignal | null | undefined;
  t.mock.method(globalThis, 'fetch', async (_input: string | URL | Request, init?: RequestInit) => {
    signal = init?.signal;
    return await new Promise<Response>((_resolve, reject) => {
      assert.ok(signal);
      signal.addEventListener('abort', () => reject(new Error('request aborted')), {
        once: true,
      });
      if (signal.aborted) {
        reject(new Error('request aborted'));
      }
    });
  });

  const request = fetchLinkPreview(normalizedUrl);
  t.mock.timers.tick(6_000);

  assert.equal(await request, null);
  assert.equal(signal?.aborted, true);
});

test('requires a usable title and valid image dimensions', async (t) => {
  t.after(restoreEmbedApiKey);
  setEmbedApiKey('test-embed-key');
  const imageUrl = 'https://cdn.example/card.png';
  const cases = [
    {
      input: {
        title: 'Boundary dimensions',
        image: imageUrl,
        imageWidth: 1,
        imageHeight: 2_147_483_647,
      },
      output: { imageUrl, imageWidth: 1, imageHeight: 2_147_483_647 },
    },
    {
      input: { title: 'Dimensions without an image', imageWidth: 1, imageHeight: 2_147_483_647 },
      output: { imageUrl: null, imageWidth: null, imageHeight: null },
    },
    {
      input: { title: 'Partial dimensions', image: imageUrl, imageWidth: 1200 },
      output: { imageUrl, imageWidth: null, imageHeight: null },
    },
    {
      input: { title: 'Zero dimension', image: imageUrl, imageWidth: 0, imageHeight: 630 },
      output: { imageUrl, imageWidth: null, imageHeight: null },
    },
    {
      input: {
        title: 'Fractional dimension',
        image: imageUrl,
        imageWidth: 1200,
        imageHeight: 630.5,
      },
      output: { imageUrl, imageWidth: null, imageHeight: null },
    },
    {
      input: {
        title: 'Dimension above Int32',
        image: imageUrl,
        imageWidth: 2_147_483_648,
        imageHeight: 630,
      },
      output: { imageUrl, imageWidth: null, imageHeight: null },
    },
    {
      input: { title: 'String dimension', image: imageUrl, imageWidth: '1200', imageHeight: 630 },
      output: { imageUrl, imageWidth: null, imageHeight: null },
    },
    {
      input: { title: 'Missing dimensions', image: imageUrl },
      output: { imageUrl, imageWidth: null, imageHeight: null },
    },
  ];
  const responses = [
    new Response(
      JSON.stringify({ url: normalizedUrl, title: '  ', image: 'javascript:alert(1)' }),
      { headers: { 'content-type': 'application/json' } },
    ),
    new Response(JSON.stringify({ url: normalizedUrl, image: 'javascript:alert(1)' }), {
      headers: { 'content-type': 'application/json' },
    }),
    new Response(
      JSON.stringify({
        url: normalizedUrl,
        title: 'Title',
        image: 'javascript:alert(1)',
        imageWidth: 1200,
        imageHeight: 630,
      }),
      { headers: { 'content-type': 'application/json' } },
    ),
    ...cases.map(
      ({ input }) =>
        new Response(JSON.stringify({ url: normalizedUrl, ...input }), {
          headers: { 'content-type': 'application/json' },
        }),
    ),
  ];
  t.mock.method(globalThis, 'fetch', async () => responses.shift()!);

  assert.equal(await fetchLinkPreview(normalizedUrl), null);
  assert.equal(await fetchLinkPreview(normalizedUrl), null);
  assert.deepEqual(await fetchLinkPreview(normalizedUrl), {
    url: normalizedUrl,
    title: 'Title',
    description: null,
    imageUrl: null,
    imageWidth: null,
    imageHeight: null,
  });

  for (const { input, output } of cases) {
    assert.deepEqual(await fetchLinkPreview(normalizedUrl), {
      url: normalizedUrl,
      title: input.title,
      description: null,
      ...output,
    });
  }
});
