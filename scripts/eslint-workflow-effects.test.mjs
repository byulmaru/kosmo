import assert from 'node:assert/strict';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { ESLint } from 'eslint';

const cwd = fileURLToPath(new URL('..', import.meta.url));
const eslint = new ESLint({ cwd });
const workflowPath = 'apps/worker/src/workflows/example.ts';
const discardedSettlement = `export async function workflow(effects: Promise<void>[]) {
  await Promise.allSettled(effects);
}`;

async function lintErrorCount(source, filePath = workflowPath) {
  const [result] = await eslint.lintText(source, { filePath });
  assert.equal(result.fatalErrorCount, 0);
  return result.errorCount;
}

test('rejects a Workflow that discards settlement results', async () => {
  assert.ok((await lintErrorCount(discardedSettlement)) > 0);
});

test('rejects the same Workflow with an inline disable', async () => {
  assert.ok((await lintErrorCount(`/* eslint-disable */\n${discardedSettlement}`)) > 0);
});

test('allows Workflow code to check settlement results', async () => {
  const source = `export async function workflow(effect: Promise<void>) {
  const [result] = await Promise.allSettled([effect]);
  if (result.status === 'rejected') {
    throw result.reason;
  }
}`;

  assert.equal(await lintErrorCount(source), 0);
});

test('allows discarded results outside Workflow source', async () => {
  assert.equal(
    await lintErrorCount(discardedSettlement, 'apps/worker/src/activities/example.ts'),
    0,
  );
});
