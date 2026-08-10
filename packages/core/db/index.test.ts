import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createOperationDatabase, db } from './index';

const getClientOptions = (owner: ReturnType<typeof createOperationDatabase>) =>
  (
    owner.db as unknown as {
      _: {
        session: {
          client: {
            options: {
              host: string[];
              max: number;
              connect_timeout: number;
            };
          };
        };
      };
    }
  )._.session.client.options;

test('creates a bounded one-connection operation database with idempotent close', async () => {
  const owner = createOperationDatabase('postgres://127.0.0.1:1/kosmo_test');
  const clientOptions = getClientOptions(owner);

  assert.notEqual(owner.db, db);
  assert.equal(clientOptions.max, 1);
  assert.equal(clientOptions.connect_timeout, 5);

  const firstClose = owner.close();
  assert.equal(owner.close(), firstClose);
  await firstClose;
});

test('prefers the operation endpoint and falls back to the direct endpoint', async () => {
  const previousOperationUrl = process.env.OPERATION_DATABASE_URL;
  const previousDatabaseUrl = process.env.DATABASE_URL;

  try {
    process.env.OPERATION_DATABASE_URL = 'postgres://kosmo@operation-pooler.example:5432/kosmo';
    process.env.DATABASE_URL = 'postgres://kosmo@direct.example:5432/kosmo';

    const operationOwner = createOperationDatabase();
    assert.deepEqual(getClientOptions(operationOwner).host, ['operation-pooler.example']);
    await operationOwner.close();

    delete process.env.OPERATION_DATABASE_URL;
    const fallbackOwner = createOperationDatabase();
    assert.deepEqual(getClientOptions(fallbackOwner).host, ['direct.example']);
    await fallbackOwner.close();
  } finally {
    if (previousOperationUrl === undefined) {
      delete process.env.OPERATION_DATABASE_URL;
    } else {
      process.env.OPERATION_DATABASE_URL = previousOperationUrl;
    }

    if (previousDatabaseUrl === undefined) {
      delete process.env.DATABASE_URL;
    } else {
      process.env.DATABASE_URL = previousDatabaseUrl;
    }
  }
});
