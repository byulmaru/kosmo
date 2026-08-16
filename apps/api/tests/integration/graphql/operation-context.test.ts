import '@kosmo/core/polyfill';

import assert from 'node:assert/strict';
import { after, test } from 'node:test';
import { pg } from '@kosmo/core/db';
import { Hono } from 'hono';
import { deriveContext } from '../../../src/context';
import { yoga } from '../../../src/graphql';
import type { Env } from '../../../src/context';

process.env.NODE_ENV = 'production';

after(async () => {
  await pg.end();
});

const app = new Hono<Env>();

app.use('*', async (c, next) => {
  c.set('context', await deriveContext(c));
  return next();
});

app.route('/graphql', yoga);

test('does not execute a JSON array body as a batch', async () => {
  const response = await app.request('/graphql', {
    body: JSON.stringify([{ query: '{ __typename }' }, { query: '{ __typename }' }]),
    headers: { 'content-type': 'application/json' },
    method: 'POST',
  });

  assert.equal(response.status, 400);
  assert.match(JSON.stringify(await response.json()), /batch/i);
});
