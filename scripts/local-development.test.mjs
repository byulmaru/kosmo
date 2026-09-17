import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  buildApplicationEnvironment,
  buildBootstrapLoaderEnvironment,
  buildMigrationEnvironment,
  preflightRuntime,
  validateBootstrapEnvironment,
  validateRuntimeEnvironment,
} from './local-development.mjs';

const runtimeEnvironment = {
  DATABASE_URL: 'postgres://must-not-be-used.example.invalid/legacy',
  FEDIFY_QUEUE_DATABASE_PASSWORD: 'queue-secret',
  FEDIFY_QUEUE_DATABASE_URL: 'postgres://kosmo_fedify_queue@127.0.0.1:54328/kosmo_fedify_queue',
  LOCAL_POSTGRES_ADMIN_PASSWORD: 'admin-secret',
  LOCAL_POSTGRES_OWNER_PASSWORD: 'owner-secret',
  PGDATABASE: 'kosmo',
  PGHOST: '127.0.0.1',
  PGPASSWORD: 'runtime-secret',
  PGPORT: '54328',
  PGUSER: 'kosmo_runtime',
  PUBLIC_ORIGIN: 'http://localhost:5173',
};

test('accepts only the approved local runtime database boundaries', () => {
  assert.doesNotThrow(() => validateRuntimeEnvironment(runtimeEnvironment));

  assert.throws(
    () => validateRuntimeEnvironment({ ...runtimeEnvironment, PGHOST: 'dev-db.internal' }),
    /PGHOST must be 127\.0\.0\.1/,
  );
  assert.throws(
    () =>
      validateRuntimeEnvironment({
        ...runtimeEnvironment,
        FEDIFY_QUEUE_DATABASE_URL:
          'postgres://kosmo_fedify_queue:embedded@127.0.0.1:54328/kosmo_fedify_queue',
      }),
    /must not contain a password/,
  );
});

test('requires local bootstrap secrets without exposing their values', () => {
  assert.doesNotThrow(() => validateBootstrapEnvironment(runtimeEnvironment));

  assert.throws(
    () =>
      validateBootstrapEnvironment({ ...runtimeEnvironment, LOCAL_POSTGRES_OWNER_PASSWORD: '' }),
    (error) => {
      assert.match(error.message, /LOCAL_POSTGRES_OWNER_PASSWORD is required/);
      assert.doesNotMatch(error.message, /owner-secret|runtime-secret|queue-secret|admin-secret/);
      return true;
    },
  );
});

test('bootstrap Vault loading cannot inherit privileged values from the runtime path', () => {
  const environment = buildBootstrapLoaderEnvironment(runtimeEnvironment);

  assert.equal(environment.LOCAL_POSTGRES_ADMIN_PASSWORD, undefined);
  assert.equal(environment.LOCAL_POSTGRES_OWNER_PASSWORD, undefined);
  assert.equal(environment.PGPASSWORD, 'runtime-secret');
});

test('application children receive runtime credentials but no privileged fallback', () => {
  const environment = buildApplicationEnvironment(runtimeEnvironment);

  assert.equal(environment.PGUSER, 'kosmo_runtime');
  assert.equal(environment.PGPASSWORD, 'runtime-secret');
  assert.equal(environment.TEMPORAL_ADDRESS, '127.0.0.1:7233');
  assert.equal(environment.TEMPORAL_NAMESPACE, 'default');
  assert.equal(environment.FEDIFY_QUEUE_DATABASE_PASSWORD, 'queue-secret');
  assert.equal(environment.DATABASE_URL, undefined);
  assert.equal(environment.LOCAL_POSTGRES_ADMIN_PASSWORD, undefined);
  assert.equal(environment.LOCAL_POSTGRES_OWNER_PASSWORD, undefined);
});

test('migration children use the owner PG principal and receive no runtime or admin credential', () => {
  const environment = buildMigrationEnvironment(runtimeEnvironment);

  assert.equal(environment.PGHOST, '127.0.0.1');
  assert.equal(environment.PGPORT, '54328');
  assert.equal(environment.PGDATABASE, 'kosmo');
  assert.equal(environment.PGUSER, 'kosmo');
  assert.equal(environment.PGPASSWORD, 'owner-secret');
  assert.equal(environment.DATABASE_URL, undefined);
  assert.equal(environment.LOCAL_POSTGRES_ADMIN_PASSWORD, undefined);
  assert.equal(environment.LOCAL_POSTGRES_OWNER_PASSWORD, undefined);
  assert.equal(environment.FEDIFY_QUEUE_DATABASE_PASSWORD, undefined);
});

test('runtime preflight authenticates both principals before service startup', async () => {
  const calls = [];
  await preflightRuntime(runtimeEnvironment, (...args) => calls.push(args));

  assert.equal(calls.length, 2);
  assert.equal(calls[0][0].username, 'kosmo_runtime');
  assert.equal(calls[0][0].password, 'runtime-secret');
  assert.equal(calls[1][0].username, 'kosmo_fedify_queue');
  assert.equal(calls[1][0].password, 'queue-secret');
  assert.equal(calls[0][1].includes('runtime-secret'), false);
  assert.equal(calls[1][1].includes('queue-secret'), false);
});

test('runtime preflight stops on an authentication or boundary failure', async () => {
  await assert.rejects(
    preflightRuntime(runtimeEnvironment, () => {
      throw new Error('database authentication failed');
    }),
    /database authentication failed/,
  );
});
