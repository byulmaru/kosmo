import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { getWorkflowRegistration } from './workflow-bundle';

test('local Worker registration keeps the TypeScript workflowsPath fallback', () => {
  assert.deepEqual(getWorkflowRegistration({ NODE_ENV: 'development' }), {
    workflowsPath: new URL('./workflows/index.ts', import.meta.url).pathname,
  });
});

test('production Worker registration uses the prebuilt workflow bundle', async (t) => {
  const directory = await mkdtemp(join(tmpdir(), 'kosmo-worker-bundle-'));
  t.after(() => rm(directory, { force: true, recursive: true }));
  const bundlePath = join(directory, 'workflow-bundle.js');
  await writeFile(bundlePath, 'var __TEMPORAL__ = {};');

  assert.deepEqual(
    getWorkflowRegistration({
      NODE_ENV: 'production',
      TEMPORAL_WORKFLOW_BUNDLE_PATH: bundlePath,
    }),
    { workflowBundle: { codePath: bundlePath } },
  );
});

test('production Worker registration fails before connect when its bundle is missing', () => {
  assert.throws(
    () =>
      getWorkflowRegistration({
        NODE_ENV: 'production',
        TEMPORAL_WORKFLOW_BUNDLE_PATH: '/tmp/kosmo-workflow-bundle-does-not-exist.js',
      }),
    /Temporal Workflow bundle is missing/,
  );
});
