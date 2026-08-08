import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';
import { ESLint } from 'eslint';

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const eslint = new ESLint({ cwd: repositoryRoot });

async function lintFixture(name) {
  const source = await readFile(resolve(repositoryRoot, 'scripts/fixtures', name), 'utf8');
  const [result] = await eslint.lintText(source, {
    filePath: 'apps/api/src/graphql/resolvers/post/loader/fixture.ts',
  });
  assert.ok(result);
  return result.messages;
}

describe('Post GraphQL operation database handle boundary', () => {
  it('rejects importing the global database handle', async () => {
    const messages = await lintFixture('post-global-db-import.ts.txt');

    assert.ok(
      messages.some(({ ruleId, severity }) => ruleId === 'no-restricted-imports' && severity === 2),
    );
  });

  it('allows importing database tables without the global handle', async () => {
    const messages = await lintFixture('post-table-import.ts.txt');

    assert.deepEqual(messages, []);
  });

  it('rejects omitting handles from Post core and post-commit calls', async () => {
    const messages = await lintFixture('post-core-handle-omission.ts.txt');

    assert.equal(messages.filter(({ ruleId }) => ruleId === 'no-restricted-syntax').length, 2);
  });

  it('allows Post core and post-commit calls with the operation handle', async () => {
    const messages = await lintFixture('post-core-handle.ts.txt');

    assert.deepEqual(messages, []);
  });
});
