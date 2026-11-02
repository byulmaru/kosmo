import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { chmod, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import {
  buildApplicationEnvironment,
  buildBootstrapLoaderEnvironment,
  buildMigrationEnvironment,
  validateBootstrapEnvironment,
  validateRuntimeEnvironment,
  waitForTemporal,
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
const localDevelopmentScript = fileURLToPath(new URL('./local-development.mjs', import.meta.url));
const rootDirectory = fileURLToPath(new URL('..', import.meta.url));

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
  assert.equal(environment.REDIS_URL, 'redis://127.0.0.1:63798');
  assert.equal(environment.FEDIFY_QUEUE_DATABASE_PASSWORD, 'queue-secret');
  assert.equal(environment.DATABASE_URL, undefined);
  assert.equal(environment.LOCAL_POSTGRES_ADMIN_PASSWORD, undefined);
  assert.equal(environment.LOCAL_POSTGRES_OWNER_PASSWORD, undefined);
});

test('local Redis URL can be overridden by the caller', () => {
  const environment = buildApplicationEnvironment({
    ...runtimeEnvironment,
    REDIS_URL: 'redis://cache.example:6379',
  });

  assert.equal(environment.REDIS_URL, 'redis://cache.example:6379');
});

test('Redis startup failure does not block local application startup', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'kosmo-local-development-'));
  const binaryDirectory = join(directory, 'bin');
  const dockerPath = join(binaryDirectory, 'docker');
  const dockerCallsPath = join(directory, 'docker-calls.txt');

  try {
    await mkdir(binaryDirectory);
    await writeFile(
      dockerPath,
      [
        '#!/bin/sh',
        'printf "%s\\n" "$*" >> "$DOCKER_CALLS_FILE"',
        'case "$*" in',
        '  *"up -d redis") exit 1 ;;',
        'esac',
      ].join('\n'),
    );
    await chmod(dockerPath, 0o755);

    const result = spawnSync(process.execPath, [localDevelopmentScript, 'services-up'], {
      cwd: rootDirectory,
      encoding: 'utf8',
      env: {
        ...process.env,
        DOCKER_CALLS_FILE: dockerCallsPath,
        LOCAL_POSTGRES_ADMIN_PASSWORD: 'test-admin-secret',
        PATH: `${binaryDirectory}:${process.env.PATH ?? ''}`,
      },
    });

    assert.equal(result.status, 0, result.stderr);
    assert.match(
      result.stderr,
      /Local Redis could not be started; application startup will continue/,
    );

    const calls = (await readFile(dockerCallsPath, 'utf8')).trim().split('\n');
    assert.equal(calls.length, 2);
    assert.match(calls[0], /up -d --wait postgres$/);
    assert.match(calls[1], /up -d redis$/);
    assert.doesNotMatch(calls[1], /--wait/);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
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

test('Temporal readiness remains bounded when a health request hangs', async () => {
  const hangingFetch = (_url, { signal }) =>
    new Promise((_resolve, reject) => {
      signal.addEventListener('abort', () => reject(signal.reason), { once: true });
    });

  await assert.rejects(
    waitForTemporal({
      fetchImplementation: hangingFetch,
      requestTimeoutMilliseconds: 10,
      retryDelayMilliseconds: 1,
      timeoutMilliseconds: 25,
    }),
    /Local Temporal did not become ready/,
  );
});
