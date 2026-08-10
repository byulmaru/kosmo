import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createOperationDatabase, db } from './index';

test('creates a bounded one-connection operation database with idempotent close', async () => {
  const owner = createOperationDatabase('postgres://127.0.0.1:1/kosmo_test');
  const clientOptions = (
    owner.db as unknown as {
      _: { session: { client: { options: { max: number; connect_timeout: number } } } };
    }
  )._.session.client.options;

  assert.notEqual(owner.db, db);
  assert.equal(clientOptions.max, 1);
  assert.equal(clientOptions.connect_timeout, 5);

  const firstClose = owner.close();
  assert.equal(owner.close(), firstClose);
  await firstClose;
});
