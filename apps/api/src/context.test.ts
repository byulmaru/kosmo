import '@kosmo/core/polyfill';

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { deriveContext } from './context';
import type { Context, ServerContext } from './context';

const createRequestContext = async (): Promise<Context> => {
  return deriveContext({
    req: { header: () => undefined },
  } as unknown as ServerContext);
};

describe('GraphQL request context', () => {
  it('creates one request-scoped loader registry without a database handle', async () => {
    const context = await createRequestContext();

    assert.equal('db' in context, false);

    const loader = context.loader({
      name: 'request-context',
      load: async (keys: string[]) => keys.map((key) => ({ key })),
      key: (row) => row.key,
    });
    const loaderAgain = context.loader({
      name: 'request-context',
      load: async (keys: string[]) => keys.map((key) => ({ key })),
      key: (row) => row.key,
    });

    assert.equal(loader, loaderAgain);
    assert.equal(context.$loaders.size, 1);
  });

  it('keeps loader caching disabled by default and supports opt-in caching', async () => {
    const context = await createRequestContext();
    let defaultLoadCount = 0;
    const uncachedLoader = context.loader({
      name: 'uncached-request-context',
      load: async (keys: string[]) => {
        defaultLoadCount += 1;
        return keys.map((key) => ({ key }));
      },
      key: (row) => row.key,
    });

    await uncachedLoader.load('same-key');
    await uncachedLoader.load('same-key');
    assert.equal(defaultLoadCount, 2);

    let cachedLoadCount = 0;
    const cachedLoader = context.loader({
      name: 'cached-request-context',
      cache: true,
      load: async (keys: string[]) => {
        cachedLoadCount += 1;
        return keys.map((key) => ({ key }));
      },
      key: (row) => row.key,
    });

    await cachedLoader.load('same-key');
    await cachedLoader.load('same-key');
    assert.equal(cachedLoadCount, 1);
  });
});
