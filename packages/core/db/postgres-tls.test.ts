import assert from 'node:assert/strict';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { getPostgresTlsOptions } from './postgres-tls';

test('returns no ssl option when client certificate paths are disabled', () => {
  assert.deepEqual(getPostgresTlsOptions('PGSSL', {}), {});
});

test('reads a complete client certificate configuration before returning ssl options', async () => {
  const root = await mkdtemp(join(tmpdir(), 'kosmo-postgres-tls-'));

  try {
    const paths = {
      cert: join(root, 'client.crt'),
      key: join(root, 'client.key'),
      ca: join(root, 'ca.crt'),
    };
    await Promise.all([
      writeFile(paths.cert, 'certificate contents'),
      writeFile(paths.key, 'private key contents'),
      writeFile(paths.ca, 'root certificate contents'),
    ]);

    assert.deepEqual(
      getPostgresTlsOptions('PGSSL', {
        PGSSLCERT: paths.cert,
        PGSSLKEY: paths.key,
        PGSSLROOTCERT: paths.ca,
      }),
      {
        ssl: {
          cert: 'certificate contents',
          key: 'private key contents',
          ca: 'root certificate contents',
          rejectUnauthorized: true,
        },
      },
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('rejects partial client certificate configuration before reading files', () => {
  assert.throws(
    () =>
      getPostgresTlsOptions('PGSSL', {
        PGSSLCERT: '/path/that/is/not/read',
      }),
    (error: unknown) => {
      assert.match(
        error instanceof Error ? error.message : '',
        /PGSSLCERT, PGSSLKEY, PGSSLROOTCERT.*configured together/,
      );
      assert.doesNotMatch(error instanceof Error ? error.message : '', /not read/);
      return true;
    },
  );
});

test('rejects unreadable files without exposing their contents', async () => {
  const root = await mkdtemp(join(tmpdir(), 'kosmo-postgres-tls-'));

  try {
    const cert = join(root, 'client.crt');
    const key = join(root, 'client.key');
    const ca = join(root, 'ca.crt');
    await Promise.all([
      writeFile(cert, 'certificate contents'),
      writeFile(key, 'private key contents'),
      mkdir(ca),
    ]);

    assert.throws(
      () =>
        getPostgresTlsOptions('PGSSL', {
          PGSSLCERT: cert,
          PGSSLKEY: key,
          PGSSLROOTCERT: ca,
        }),
      (error: unknown) => {
        assert.match(error instanceof Error ? error.message : '', /Unable to read PGSSLROOTCERT/);
        assert.doesNotMatch(
          error instanceof Error ? error.message : '',
          /certificate contents|private key contents/,
        );
        return true;
      },
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('supports a separate environment prefix without mixing credentials', async () => {
  const root = await mkdtemp(join(tmpdir(), 'kosmo-postgres-tls-'));

  try {
    const paths = {
      cert: join(root, 'worker.crt'),
      key: join(root, 'worker.key'),
      ca: join(root, 'worker-ca.crt'),
    };
    await Promise.all([
      writeFile(paths.cert, 'worker certificate'),
      writeFile(paths.key, 'worker key'),
      writeFile(paths.ca, 'worker ca'),
    ]);

    assert.deepEqual(
      getPostgresTlsOptions('WORKER_PGSSL', {
        WORKER_PGSSLCERT: paths.cert,
        WORKER_PGSSLKEY: paths.key,
        WORKER_PGSSLROOTCERT: paths.ca,
        PGSSLCERT: '/different/api/certificate',
        PGSSLKEY: '/different/api/key',
        PGSSLROOTCERT: '/different/api/ca',
      }),
      {
        ssl: {
          cert: 'worker certificate',
          key: 'worker key',
          ca: 'worker ca',
          rejectUnauthorized: true,
        },
      },
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
