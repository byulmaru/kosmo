import assert from 'node:assert/strict';
import { mock, test } from 'node:test';
import { createOperationDatabase, db } from './index';

type OperationClient = {
  options: {
    host: string[];
    max: number;
    connection: Record<string, unknown>;
  };
  end: (options?: { timeout?: number }) => Promise<void>;
};

const getClient = (owner: ReturnType<typeof createOperationDatabase>) =>
  (owner.db as unknown as { _: { session: { client: OperationClient } } })._.session.client;

test('keeps operation client bounded and isolated from direct startup parameters', async () => {
  const owner = createOperationDatabase('postgres://127.0.0.1:1/kosmo_test');
  const end = mock.method(getClient(owner), 'end', async () => {});

  assert.notEqual(owner.db, db);
  assert.equal(getClient(owner).options.max, 1);
  assert.equal('idle_in_transaction_session_timeout' in getClient(owner).options.connection, false);
  assert.equal('lock_timeout' in getClient(owner).options.connection, false);
  assert.equal('statement_timeout' in getClient(owner).options.connection, false);

  const firstClose = owner.close();
  assert.equal(owner.close(), firstClose);
  await firstClose;
  assert.deepEqual(end.mock.calls[0]?.arguments, []);
  assert.equal(end.mock.calls.length, 1);

  const forceOwner = createOperationDatabase('postgres://127.0.0.1:1/kosmo_test');
  const forceEnd = mock.method(getClient(forceOwner), 'end', async () => {});
  const firstForceClose = forceOwner.close({ force: true });
  assert.equal(forceOwner.close(), firstForceClose);
  await firstForceClose;
  assert.deepEqual(forceEnd.mock.calls[0]?.arguments, [{ timeout: 0 }]);
  assert.equal(forceEnd.mock.calls.length, 1);
});

test('prefers the operation endpoint and falls back to the direct endpoint', async () => {
  const previousOperationUrl = process.env.OPERATION_DATABASE_URL;
  const previousDatabaseUrl = process.env.DATABASE_URL;

  try {
    process.env.OPERATION_DATABASE_URL = 'postgres://kosmo@operation-pooler.example:5432/kosmo';
    process.env.DATABASE_URL = 'postgres://kosmo@direct.example:5432/kosmo';

    const operationOwner = createOperationDatabase();
    assert.deepEqual(getClient(operationOwner).options.host, ['operation-pooler.example']);
    await operationOwner.close();

    delete process.env.OPERATION_DATABASE_URL;
    const fallbackOwner = createOperationDatabase();
    assert.deepEqual(getClient(fallbackOwner).options.host, ['direct.example']);
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

test('passes operation URL connection parameters through unchanged', async () => {
  const owner = createOperationDatabase(
    'postgres://kosmo@operation-pooler.example:5432/kosmo?idle_in_transaction_session_timeout=configured-idle&lock_timeout=configured-lock&statement_timeout=configured-statement&application_name=graphql-operation',
  );
  const { connection } = getClient(owner).options;

  assert.equal(connection.idle_in_transaction_session_timeout, 'configured-idle');
  assert.equal(connection.lock_timeout, 'configured-lock');
  assert.equal(connection.statement_timeout, 'configured-statement');
  assert.equal(connection.application_name, 'graphql-operation');

  await owner.close();
});
