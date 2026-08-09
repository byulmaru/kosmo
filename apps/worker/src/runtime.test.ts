import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readWorkerEnvironment } from './runtime';

test('Worker environment를 읽는다', () => {
  assert.deepEqual(
    readWorkerEnvironment({
      HOST: '127.0.0.1',
      PORT: '9090',
      TEMPORAL_ADDRESS: 'temporal.test:7233',
      TEMPORAL_NAMESPACE: 'kosmo-test',
    }),
    {
      healthHost: '127.0.0.1',
      healthPort: 9090,
      temporalAddress: 'temporal.test:7233',
      temporalNamespace: 'kosmo-test',
    },
  );
});

test('필수 Temporal environment가 없으면 실패한다', () => {
  assert.throws(
    () => readWorkerEnvironment({ TEMPORAL_NAMESPACE: 'kosmo-test' }),
    /TEMPORAL_ADDRESS is required/,
  );
  assert.throws(
    () => readWorkerEnvironment({ TEMPORAL_ADDRESS: 'temporal.test:7233' }),
    /TEMPORAL_NAMESPACE is required/,
  );
});

test('유효하지 않은 health port를 거부한다', () => {
  assert.throws(
    () =>
      readWorkerEnvironment({
        PORT: '0',
        TEMPORAL_ADDRESS: 'temporal.test:7233',
        TEMPORAL_NAMESPACE: 'kosmo-test',
      }),
    /PORT must be an integer/,
  );
});
