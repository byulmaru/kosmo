import '@kosmo/core/polyfill';

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { createOperationContext, deriveContext } from './context';
import type { Context, ServerContext } from './context';

const createRequestContext = async (): Promise<Context> => {
  const context = await deriveContext({
    req: { header: () => undefined },
  } as unknown as ServerContext);
  context.session = { id: 'session', accountId: 'account', profileId: 'profile' };
  return context;
};

describe('GraphQL operation context', () => {
  it('copies identity and isolates loader registries per operation', async () => {
    const requestContext = await createRequestContext();
    const first = createOperationContext(requestContext);
    const second = createOperationContext(requestContext);

    assert.equal(first.db, requestContext.db);
    assert.notEqual(first.$loaders, second.$loaders);
    assert.notEqual(first.loader, second.loader);
    assert.notEqual(first.session, second.session);
    assert.deepEqual(first.session, second.session);

    first.session!.accountId = 'changed';
    assert.equal(second.session?.accountId, 'account');

    const firstLoader = first.loader({
      name: 'context-isolation',
      load: async (keys: string[]) => keys.map((key) => ({ key })),
      key: (row) => row.key,
    });
    const firstLoaderAgain = first.loader({
      name: 'context-isolation',
      load: async (keys: string[]) => keys.map((key) => ({ key })),
      key: (row) => row.key,
    });
    const secondLoader = second.loader({
      name: 'context-isolation',
      load: async (keys: string[]) => keys.map((key) => ({ key })),
      key: (row) => row.key,
    });

    assert.equal(firstLoader, firstLoaderAgain);
    assert.notEqual(firstLoader, secondLoader);
    assert.equal(first.$loaders.size, 1);
    assert.equal(second.$loaders.size, 1);
  });

  it('preserves an explicitly supplied database handle for each operation', async () => {
    const requestContext = await createRequestContext();
    const database = {} as Context['db'];
    const operation = createOperationContext({ ...requestContext, db: database });

    assert.equal(operation.db, database);
  });
});
