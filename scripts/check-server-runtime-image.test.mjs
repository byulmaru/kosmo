import assert from 'node:assert/strict';
import test from 'node:test';
import { parseArguments, RUNTIME_IMAGE_CONTRACTS } from './check-server-runtime-image.mjs';

test('runtime image contracts cover exactly the five split targets', () => {
  assert.deepEqual(Object.keys(RUNTIME_IMAGE_CONTRACTS), [
    'web',
    'api',
    'worker',
    'fedify-consumer',
    'migration',
  ]);
  assert.deepEqual(
    Object.values(RUNTIME_IMAGE_CONTRACTS).map(({ entrypoint }) => entrypoint),
    [
      '/app/server-dist/web/index.mjs',
      '/app/server-dist/api/index.mjs',
      '/app/server-dist/worker/index.mjs',
      '/app/server-dist/fedify-consumer/index.mjs',
      '/app/server-dist/migration/index.mjs',
    ],
  );
});

test('only the Worker contract requires the Temporal native runtime', () => {
  assert.equal(RUNTIME_IMAGE_CONTRACTS.worker.worker, true);
  for (const [runtime, contract] of Object.entries(RUNTIME_IMAGE_CONTRACTS)) {
    if (runtime !== 'worker') {
      assert.equal(contract.worker, undefined);
    }
  }
});

test('argument parser requires a known runtime and image', () => {
  assert.deepEqual(parseArguments(['--runtime', 'api', '--image', 'example/api:local']), {
    docker: 'docker',
    platform: 'linux/arm64',
    runtime: 'api',
    image: 'example/api:local',
  });
  assert.throws(
    () => parseArguments(['--runtime', 'unknown', '--image', 'example:local']),
    /must be one of/,
  );
  assert.throws(() => parseArguments(['--runtime', 'api']), /--image is required/);
});
