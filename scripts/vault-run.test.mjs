import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const repositoryRoot = fileURLToPath(new URL('..', import.meta.url));
const vaultRunPath = join(repositoryRoot, 'scripts/vault-run.mjs');

function withFakeVault(data, callback, options = {}) {
  const testDirectory = mkdtempSync(join(tmpdir(), 'kosmo-vault-run-test-'));
  const binDirectory = join(testDirectory, 'bin');
  const vaultPath = join(binDirectory, 'vault');
  const outputPath = join(testDirectory, 'child-output.json');

  try {
    mkdirSync(binDirectory);

    writeFileSync(
      vaultPath,
      `#!/usr/bin/env node
const args = process.argv.slice(2);
if (args[0] === 'token') process.exit(0);
if (args[0] === 'kv') {
  process.stdout.write(JSON.stringify({
    data: { data: JSON.parse(process.env.FAKE_VAULT_DATA), metadata: {} }
  }));
  process.exit(0);
}
if (args[0] === 'write') {
  if (process.env.FAKE_PKI_FAILURE === 'true') {
    process.stderr.write('Vault PKI request denied.\\n');
    process.exit(3);
  }
  process.stdout.write(process.env.FAKE_PKI_RESPONSE);
  process.exit(0);
}
process.stderr.write('Unexpected Vault arguments.\\n');
process.exit(2);
`,
      { mode: 0o700 },
    );
    chmodSync(vaultPath, 0o700);

    const childScript = `
const fs = require('node:fs');
const paths = [process.env.PGSSLCERT, process.env.PGSSLKEY, process.env.PGSSLROOTCERT];
const files = paths.map((path) => path && ({
  path,
  content: fs.readFileSync(path, 'utf8'),
  mode: fs.statSync(path).mode & 0o777
}));
fs.writeFileSync(process.env.TEST_OUTPUT, JSON.stringify({
  databaseUrl: process.env.DATABASE_URL,
  paths,
  files
}));
process.exit(Number(process.env.CHILD_EXIT_STATUS || 0));
`;
    const result = spawnSync(
      process.execPath,
      [vaultRunPath, '--', process.execPath, '-e', childScript],
      {
        cwd: repositoryRoot,
        encoding: 'utf8',
        env: {
          ...process.env,
          PATH: `${binDirectory}:${process.env.PATH}`,
          FAKE_VAULT_DATA: JSON.stringify(data),
          FAKE_PKI_FAILURE: options.pkiFailure ? 'true' : 'false',
          FAKE_PKI_RESPONSE:
            options.pkiResponse ??
            JSON.stringify({
              data: {
                certificate: 'CLIENT CERTIFICATE',
                private_key: 'TOP-SECRET-PRIVATE-KEY',
                issuing_ca: 'ISSUING CA',
              },
            }),
          TEST_OUTPUT: outputPath,
          CHILD_EXIT_STATUS: String(options.childExitStatus ?? 0),
        },
      },
    );

    return callback({ outputPath, result });
  } finally {
    rmSync(testDirectory, { force: true, recursive: true });
  }
}

test('keeps the existing KV-only execution when PKI is not configured', () => {
  withFakeVault({ DATABASE_URL: 'postgres://local.example/kosmo' }, ({ outputPath, result }) => {
    assert.equal(result.status, 0, result.stderr);
    const childOutput = JSON.parse(readFileSync(outputPath, 'utf8'));
    assert.equal(childOutput.databaseUrl, 'postgres://local.example/kosmo');
    assert.deepEqual(childOutput.paths, [null, null, null]);
  });
});

test('renders PKI material for the child and removes it afterward', () => {
  withFakeVault(
    {
      DATABASE_URL: 'postgres://kosmo_app@postgres.example/kosmo',
      DATABASE_PKI_MOUNT: 'postgres-pki',
      DATABASE_PKI_ROLE: 'kosmo-client',
      DATABASE_PKI_COMMON_NAME: 'kosmo_app',
      DATABASE_PKI_TTL: '12h',
    },
    ({ outputPath, result }) => {
      assert.equal(result.status, 0, result.stderr);
      assert.doesNotMatch(result.stdout + result.stderr, /TOP-SECRET-PRIVATE-KEY/);

      const childOutput = JSON.parse(readFileSync(outputPath, 'utf8'));
      assert.deepEqual(
        childOutput.files.map(({ content }) => content),
        ['CLIENT CERTIFICATE', 'TOP-SECRET-PRIVATE-KEY', 'ISSUING CA'],
      );

      for (const file of childOutput.files) {
        assert.equal(file.mode, 0o600);
        assert.equal(existsSync(file.path), false);
      }

      assert.equal(existsSync(join(childOutput.paths[0], '..')), false);
    },
  );
});

test('preserves a failing child status and still removes PKI material', () => {
  withFakeVault(
    {
      DATABASE_PKI_ROLE: 'kosmo-client',
      DATABASE_PKI_COMMON_NAME: 'kosmo_app',
    },
    ({ outputPath, result }) => {
      assert.equal(result.status, 7);
      const childOutput = JSON.parse(readFileSync(outputPath, 'utf8'));

      for (const path of childOutput.paths) {
        assert.equal(existsSync(path), false);
      }
    },
    { childExitStatus: 7 },
  );
});

test('rejects partial PKI configuration before running the child', () => {
  withFakeVault({ DATABASE_PKI_ROLE: 'kosmo-client' }, ({ outputPath, result }) => {
    assert.equal(result.status, 1);
    assert.match(result.stderr, /DATABASE_PKI_ROLE and DATABASE_PKI_COMMON_NAME/);
    assert.equal(existsSync(outputPath), false);
  });
});

test('does not run the child when Vault PKI issuance fails', () => {
  withFakeVault(
    {
      DATABASE_PKI_ROLE: 'kosmo-client',
      DATABASE_PKI_COMMON_NAME: 'kosmo_app',
    },
    ({ outputPath, result }) => {
      assert.equal(result.status, 3);
      assert.match(result.stderr, /Vault PKI request denied/);
      assert.equal(existsSync(outputPath), false);
    },
    { pkiFailure: true },
  );
});

test('rejects an incomplete Vault PKI response without exposing it', () => {
  withFakeVault(
    {
      DATABASE_PKI_ROLE: 'kosmo-client',
      DATABASE_PKI_COMMON_NAME: 'kosmo_app',
    },
    ({ outputPath, result }) => {
      assert.equal(result.status, 1);
      assert.match(result.stderr, /missing certificate, private_key, or issuing_ca/);
      assert.doesNotMatch(result.stdout + result.stderr, /TOP-SECRET/);
      assert.equal(existsSync(outputPath), false);
    },
    {
      pkiResponse: JSON.stringify({
        data: { certificate: 'CLIENT CERTIFICATE', private_key: 'TOP-SECRET' },
      }),
    },
  );
});
