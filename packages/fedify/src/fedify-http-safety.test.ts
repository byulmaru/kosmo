import assert from 'node:assert/strict';
import { test } from 'node:test';
import { getDocumentLoader } from '@fedify/fedify';
import { lookupObject } from '@fedify/vocab';
import { federation, remoteActorLookupMaxResponseSize } from './federation';
import type { LookupObjectOptions } from '@fedify/vocab';

const testResponseLimit = 1024;

const sleep = (milliseconds: number) =>
  new Promise<void>((resolve) => setTimeout(resolve, milliseconds));

const createSlowResponse = (signal?: AbortSignal | null, chunkSize = testResponseLimit) => {
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      signal?.addEventListener('abort', () => controller.error(signal.reason), {
        once: true,
      });
    },
    async pull(controller) {
      await sleep(20);
      controller.enqueue(new Uint8Array(chunkSize));
    },
  });

  return new Response(stream, {
    headers: { 'content-type': 'application/activity+json' },
  });
};

test('rejects a streamed document that exceeds the configured response limit', async () => {
  const abortController = new AbortController();
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (_input, init) => createSlowResponse(init?.signal);

  try {
    const loader = getDocumentLoader({
      allowPrivateAddress: true,
      maxResponseSize: testResponseLimit,
    });
    const result = await Promise.race([
      loader('https://remote.example/actor', { signal: abortController.signal }).then(
        () => 'fulfilled',
        () => 'rejected',
      ),
      sleep(150).then(() => 'timed out'),
    ]);

    assert.equal(result, 'rejected');
  } finally {
    abortController.abort();
    globalThis.fetch = originalFetch;
  }
});

test('federation document and context loaders enforce the remote actor response limit', async () => {
  const abortController = new AbortController();
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (_input, init) =>
    createSlowResponse(init?.signal, remoteActorLookupMaxResponseSize);

  try {
    const context = federation.createContext(new URL('https://kosmo.example'));

    for (const loader of [context.documentLoader, context.contextLoader]) {
      const result = await Promise.race([
        loader('https://remote.example/actor', { signal: abortController.signal }).then(
          () => 'fulfilled',
          () => 'rejected',
        ),
        sleep(150).then(() => 'timed out'),
      ]);

      assert.equal(result, 'rejected');
    }
  } finally {
    abortController.abort();
    globalThis.fetch = originalFetch;
  }
});

test('propagates the lookup signal to an alternate document fetch', async () => {
  const abortController = new AbortController();
  const originalFetch = globalThis.fetch;
  let alternateFetchSignal: AbortSignal | null | undefined;
  let startAlternateFetch!: () => void;
  const alternateFetchStarted = new Promise<void>((resolve) => {
    startAlternateFetch = resolve;
  });

  globalThis.fetch = async (input, init) => {
    const url = input instanceof Request ? input.url : input.toString();
    if (url === 'https://remote.example/document') {
      return new Response('not an ActivityPub document', {
        headers: {
          'content-type': 'text/plain',
          link: '<https://remote.example/alternate>; rel="alternate"; type="application/activity+json"',
        },
      });
    }

    assert.equal(url, 'https://remote.example/alternate');
    alternateFetchSignal = init?.signal;
    startAlternateFetch();
    return await new Promise<Response>((resolve, reject) => {
      init?.signal?.addEventListener('abort', () => reject(init.signal?.reason), {
        once: true,
      });
      setTimeout(
        () =>
          resolve(
            new Response('{}', {
              headers: { 'content-type': 'application/activity+json' },
            }),
          ),
        20,
      );
    });
  };

  try {
    const loader = getDocumentLoader({ allowPrivateAddress: true });
    const loading = loader('https://remote.example/document', {
      signal: abortController.signal,
    });
    await alternateFetchStarted;
    abortController.abort(new Error('lookup cancelled'));

    await assert.rejects(loading);
    assert.equal(alternateFetchSignal, abortController.signal);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('stops an oversized streamed WebFinger response before it drains', async () => {
  const abortController = new AbortController();
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (_input, init) => createSlowResponse(init?.signal);

  try {
    const lookupOptions: LookupObjectOptions & { allowPrivateAddress: true } = {
      allowPrivateAddress: true,
      maxResponseSize: testResponseLimit,
      signal: abortController.signal,
    };
    const result = await Promise.race([
      lookupObject('acct:alice@remote.example', lookupOptions).then(
        (object) => ({ kind: 'resolved' as const, object }),
        (error) => ({ kind: 'rejected' as const, error }),
      ),
      sleep(150).then(() => ({ kind: 'timed out' as const })),
    ]);

    assert.deepEqual(result, { kind: 'resolved', object: null });
  } finally {
    abortController.abort();
    globalThis.fetch = originalFetch;
  }
});
