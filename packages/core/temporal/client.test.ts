import assert from 'node:assert/strict';
import test from 'node:test';
import { temporalClient } from './client';

test('Temporal runtime 입력이 없으면 global client 접근을 연결 전에 거부한다', () => {
  const previousAddress = process.env.TEMPORAL_ADDRESS;
  const previousNamespace = process.env.TEMPORAL_NAMESPACE;
  delete process.env.TEMPORAL_ADDRESS;
  delete process.env.TEMPORAL_NAMESPACE;

  try {
    assert.throws(() => temporalClient.workflow, /TEMPORAL_ADDRESS is required/);
  } finally {
    if (previousAddress === undefined) {
      delete process.env.TEMPORAL_ADDRESS;
    } else {
      process.env.TEMPORAL_ADDRESS = previousAddress;
    }
    if (previousNamespace === undefined) {
      delete process.env.TEMPORAL_NAMESPACE;
    } else {
      process.env.TEMPORAL_NAMESPACE = previousNamespace;
    }
  }
});
