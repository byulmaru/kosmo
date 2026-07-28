import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';
import { ESLint } from 'eslint';

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const eslint = new ESLint({ cwd: repositoryRoot });

async function lintFixture(name, filePath) {
  const source = await readFile(resolve(repositoryRoot, 'scripts/fixtures', name), 'utf8');
  const [result] = await eslint.lintText(source, { filePath });
  assert.ok(result);
  return result.messages;
}

describe('@eslint-react/no-class-component', () => {
  it('rejects a React class component through the production ESLint config', async () => {
    const messages = await lintFixture(
      'react-class-component.tsx.txt',
      'scripts/fixtures/react-class-component.tsx',
    );

    assert.ok(
      messages.some(
        ({ ruleId, severity }) => ruleId === '@eslint-react/no-class-component' && severity === 2,
      ),
    );
  });

  it('rejects a class error boundary that the plugin intentionally exempts', async () => {
    const messages = await lintFixture(
      'react-class-error-boundary.tsx.txt',
      'scripts/fixtures/react-class-error-boundary.tsx',
    );

    assert.ok(
      messages.some(({ ruleId, severity }) => ruleId === 'no-restricted-syntax' && severity === 2),
    );
  });

  it('allows a non-React domain error class', async () => {
    const messages = await lintFixture(
      'domain-error-class.ts.txt',
      'scripts/fixtures/domain-error-class.ts',
    );

    assert.deepEqual(messages, []);
  });
});
