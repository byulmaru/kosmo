import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import {
  createFedifyQueueRuntime,
  FedifyRuntimeConfigurationError,
  readFedifyRuntimeConfig,
} from './queue';

describe('Fedify queue runtime configuration', () => {
  test('defaults to direct mode and never constructs a queue from a URL alone', () => {
    const config = readFedifyRuntimeConfig({
      FEDIFY_QUEUE_DATABASE_URL: 'postgres://queue.example/fedify',
    });

    assert.deepEqual(config, {
      mode: 'direct',
      queueDatabaseUrl: 'postgres://queue.example/fedify',
    });
    assert.deepEqual(createFedifyQueueRuntime(config), {
      config,
      queue: undefined,
      sql: undefined,
    });
  });

  test('requires an explicit supported runtime mode', () => {
    assert.throws(
      () => readFedifyRuntimeConfig({ FEDIFY_RUNTIME_MODE: 'worker' }),
      (error: unknown) =>
        error instanceof FedifyRuntimeConfigurationError &&
        /FEDIFY_RUNTIME_MODE/.test(error.message),
    );
  });

  for (const mode of ['producer', 'consumer'] as const) {
    test(`${mode} mode fails closed without a queue URL`, () => {
      assert.throws(
        () => readFedifyRuntimeConfig({ FEDIFY_RUNTIME_MODE: mode }),
        (error: unknown) =>
          error instanceof FedifyRuntimeConfigurationError &&
          error.message ===
            `FEDIFY_QUEUE_DATABASE_URL is required when FEDIFY_RUNTIME_MODE=${mode}.`,
      );
    });
  }

  test('preserves the optional password override without using the owner database URL', () => {
    const config = readFedifyRuntimeConfig({
      FEDIFY_RUNTIME_MODE: 'producer',
      FEDIFY_QUEUE_DATABASE_PASSWORD: 'queue password',
      FEDIFY_QUEUE_DATABASE_URL: 'postgres://queue.example/fedify',
      DATABASE_URL: 'postgres://owner.example/kosmo',
    });

    assert.equal(config.mode, 'producer');
    assert.equal(config.queueDatabaseUrl, 'postgres://queue.example/fedify');
    assert.equal(config.queueDatabasePassword, 'queue password');

    const runtime = createFedifyQueueRuntime(config);
    assert.ok(runtime.queue);
    assert.ok(runtime.sql);
    return runtime.sql?.end();
  });

  test('accepts a URL-embedded password when no override is provided', () => {
    const config = readFedifyRuntimeConfig({
      FEDIFY_RUNTIME_MODE: 'producer',
      FEDIFY_QUEUE_DATABASE_URL: 'postgres://queue:embedded%20password@queue.example/fedify',
    });

    assert.equal(config.queueDatabasePassword, undefined);
    const runtime = createFedifyQueueRuntime(config);
    assert.ok(runtime.queue);
    return runtime.sql?.end();
  });

  test('rejects a queue URL that would fall back to an owner password', () => {
    assert.throws(
      () =>
        readFedifyRuntimeConfig({
          FEDIFY_RUNTIME_MODE: 'producer',
          FEDIFY_QUEUE_DATABASE_URL: 'postgres://queue.example/fedify',
          DATABASE_PASSWORD: 'owner password',
        }),
      (error: unknown) =>
        error instanceof FedifyRuntimeConfigurationError &&
        /FEDIFY_QUEUE_DATABASE_PASSWORD/.test(error.message),
    );
  });
});
