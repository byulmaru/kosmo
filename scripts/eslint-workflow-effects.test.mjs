import assert from 'node:assert/strict';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { ESLint } from 'eslint';

const cwd = fileURLToPath(new URL('..', import.meta.url));
const eslint = new ESLint({ cwd });
const workflowPath = 'apps/worker/src/workflows/example.ts';
const ignoredAllSettled = 'await Promise.allSettled([]);';

test('rejects discarded Workflow settlement results despite an inline disable', async () => {
  const [{ messages }] = await eslint.lintText(
    `/* eslint-disable no-restricted-syntax */
${ignoredAllSettled}
void Promise['allSettled']([]);
Promise.allSettled([]);`,
    { filePath: workflowPath },
  );

  assert.deepEqual(
    messages
      .filter(({ ruleId, severity }) => ruleId === 'no-restricted-syntax' && severity === 2)
      .map(({ line }) => line),
    [2, 3, 4],
  );
});

test('allows Workflow code to check settlement results', async () => {
  const [{ messages }] = await eslint.lintText(
    `const [result] = await Promise.allSettled([Promise.resolve()]);
if (result.status === 'rejected') {
  throw result.reason;
}`,
    { filePath: workflowPath },
  );

  assert.deepEqual(messages, []);
});

test('leaves settlement calls outside Workflow source alone', async () => {
  const [{ messages }] = await eslint.lintText(ignoredAllSettled, {
    filePath: 'apps/worker/src/activities/example.ts',
  });

  assert.deepEqual(messages, []);
});
