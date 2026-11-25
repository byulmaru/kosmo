import assert from 'node:assert/strict';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { ESLint } from 'eslint';

const eslint = new ESLint({ cwd: fileURLToPath(new URL('..', import.meta.url)) });
const e2ePath = 'apps/web/e2e/example.e2e.ts';
const fixedWait = 'export const wait = (page) => page.waitForTimeout(200);';

async function lintErrors(source, filePath = e2ePath) {
  const [result] = await eslint.lintText(source, { filePath });
  assert.equal(result.fatalErrorCount, 0);
  return result.messages.filter(({ severity }) => severity === 2).map(({ ruleId }) => ruleId);
}

test('rejects fixed waits in Web E2E, including computed member access', async () => {
  assert.deepEqual(await lintErrors(fixedWait), ['no-restricted-syntax']);
  assert.deepEqual(await lintErrors("export const wait = (page) => page['waitForTimeout'](200);"), [
    'no-restricted-syntax',
  ]);
});

test('blocks an inline disable of the Web E2E rule', async () => {
  assert.deepEqual(await lintErrors(`/* eslint-disable no-restricted-syntax */\n${fixedWait}`), [
    'no-restricted-syntax',
  ]);
});

test('allows observable waits and the Playwright Clock in Web E2E', async () => {
  assert.deepEqual(
    await lintErrors(`export async function wait(page) {
      await page.waitForResponse('**/graphql');
      await page.getByRole('alert').waitFor();
      await page.clock.runFor(3600);
    }`),
    [],
  );
});

test('does not restrict similarly named members outside Web E2E', async () => {
  assert.deepEqual(await lintErrors(fixedWait, 'apps/web/src/example.ts'), []);
});
