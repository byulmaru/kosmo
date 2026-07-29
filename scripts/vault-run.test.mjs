import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { chmod, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { delimiter, join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const vaultRunPath = fileURLToPath(new URL('./vault-run.mjs', import.meta.url));

const createFakeVault = async () => {
  const directory = await mkdtemp(join(tmpdir(), 'kosmo-vault-run-'));
  const executable = join(directory, 'vault');
  await writeFile(
    executable,
    `#!/usr/bin/env node
const args = process.argv.slice(2);
if (args[0] === 'token' && args[1] === 'lookup') process.exit(0);
if (args[0] !== 'kv' || args[1] !== 'get') process.exit(1);
const path = args.at(-1);
if (!path.endsWith('/api')) {
  process.stdout.write(JSON.stringify({ data: { data: { PRIMARY: 'value' }, metadata: {} } }));
  process.exit(0);
}
const mode = process.env.FAKE_VAULT_MODE;
if (mode === 'missing') console.error('No value found at secret/data/kubernetes/kosmo/local/api');
if (mode === 'permission') console.error('Error making API request.\\n\\nCode: 403. Errors:\\n\\n* permission denied');
if (mode === 'tls') console.error('Error making API request.\\n\\n* TLS handshake timeout');
if (mode === 'api') console.error('Error making API request.\\n\\nCode: 500. Errors:\\n\\n* internal error');
if (mode === 'connection') console.error('Error making API request.\\n\\n* connection refused');
process.exit(2);
`,
  );
  await chmod(executable, 0o755);
  return directory;
};

const runVaultWrapper = (directory, mode) =>
  spawnSync(
    process.execPath,
    [
      vaultRunPath,
      '--secret-path',
      'secret/kubernetes/kosmo/local',
      '--optional-secret-path',
      'secret/kubernetes/kosmo/local/api',
      '--',
      process.execPath,
      '-e',
      "process.stdout.write(process.env.PRIMARY ?? 'missing')",
    ],
    {
      encoding: 'utf8',
      env: {
        ...process.env,
        FAKE_VAULT_MODE: mode,
        PATH: `${directory}${delimiter}${process.env.PATH ?? ''}`,
      },
    },
  );

test('optional Vault 경로의 실제 Secret 미존재만 빈 overlay로 처리한다', async (t) => {
  const directory = await createFakeVault();
  t.after(() => rm(directory, { force: true, recursive: true }));

  const result = runVaultWrapper(directory, 'missing');

  assert.equal(result.status, 0);
  assert.equal(result.stdout, 'value');
  assert.equal(result.stderr, '');
});

test('optional Vault 경로의 원격 오류는 숨기지 않는다', async (t) => {
  const directory = await createFakeVault();
  t.after(() => rm(directory, { force: true, recursive: true }));

  for (const [mode, diagnostic] of [
    ['permission', 'permission denied'],
    ['tls', 'TLS handshake timeout'],
    ['api', 'internal error'],
    ['connection', 'connection refused'],
  ]) {
    const result = runVaultWrapper(directory, mode);
    assert.equal(result.status, 2);
    assert.match(result.stderr, new RegExp(diagnostic, 'u'));
    assert.equal(result.stdout, '');
  }
});
