import assert from 'node:assert/strict';
import { after, mock, test } from 'node:test';
import { db, pg } from '@kosmo/core/db';
import { federation, fetchFederation } from './federation';
import type { Federation, FederationFetchOptions } from '@fedify/fedify';
import type { FedifyExecutionContext } from './fedify-execution';

const typedFederation = federation as unknown as Federation<FedifyExecutionContext>;

after(async () => {
  mock.restoreAll();
  await pg.end();
});

test('Web inbound adapter creates an isolated owner-handle context per invocation', async () => {
  const contexts: FedifyExecutionContext[] = [];
  mock.method(
    typedFederation,
    'fetch',
    async (_request: Request, options: FederationFetchOptions<FedifyExecutionContext>) => {
      contexts.push(options.contextData);
      return new Response('ok');
    },
  );

  const request = new Request('https://kos.moe/inbox');
  await fetchFederation(request, {});
  await fetchFederation(request, {});

  assert.equal(contexts.length, 2);
  assert.notEqual(contexts[0], contexts[1]);
  assert.equal(contexts[0]?.db, db);
  assert.equal(contexts[1]?.db, db);
});
