import '@kosmo/core/polyfill';

import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { Hono } from 'hono';
import type * as CoreDb from '@kosmo/core/db';
import type { deriveContext as DeriveContext, Env } from '../../../src/context';
import type { yoga as YogaRouter } from '../../../src/graphql';

process.env.NODE_ENV = 'production';

let pg: typeof CoreDb.pg;
let deriveContext: typeof DeriveContext;
let yoga: typeof YogaRouter;
let app: Hono<Env>;

before(async () => {
  ({ pg } = await import('@kosmo/core/db'));
  ({ deriveContext } = await import('../../../src/context'));
  ({ yoga } = await import('../../../src/graphql'));

  app = new Hono<Env>();
  app.use('*', async (c, next) => {
    c.set('context', await deriveContext(c));
    return next();
  });
  app.route('/graphql', yoga);
});

after(async () => {
  await pg.end();
});

test('does not execute a JSON array body as a batch', async () => {
  const response = await app.request('/graphql', {
    body: JSON.stringify([{ query: '{ __typename }' }, { query: '{ __typename }' }]),
    headers: { 'content-type': 'application/json' },
    method: 'POST',
  });

  assert.equal(response.status, 400);
  assert.match(JSON.stringify(await response.json()), /batch/i);
});
