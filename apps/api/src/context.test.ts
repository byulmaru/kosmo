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
});
