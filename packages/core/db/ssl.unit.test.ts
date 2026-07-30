import assert from 'node:assert/strict';
import test from 'node:test';
import { getPostgresSsl } from './ssl';
import type { readFileSync } from 'node:fs';

test('keeps the existing connection when no TLS files are configured', () => {
  assert.equal(getPostgresSsl({ env: {} }), undefined);
});

test('loads a complete TLS client certificate configuration', () => {
  const requestedPaths: string[] = [];
  const ssl = getPostgresSsl({
    env: {
      PGSSLCERT: '/tls/tls.crt',
      PGSSLKEY: '/tls/tls.key',
      PGSSLROOTCERT: '/tls/ca.crt',
    },
    readFile: ((path: string) => {
      requestedPaths.push(path);
      return Buffer.from(path);
    }) as typeof readFileSync,
  });

  assert.deepEqual(requestedPaths, ['/tls/tls.crt', '/tls/tls.key', '/tls/ca.crt']);
  assert.deepEqual(ssl, {
    cert: Buffer.from('/tls/tls.crt'),
    key: Buffer.from('/tls/tls.key'),
    ca: Buffer.from('/tls/ca.crt'),
    rejectUnauthorized: true,
  });
});

for (const env of [
  { PGSSLCERT: '/tls/tls.crt' },
  { PGSSLKEY: '/tls/tls.key', PGSSLROOTCERT: '/tls/ca.crt' },
]) {
  test(`rejects a partial TLS configuration: ${Object.keys(env).join(', ')}`, () => {
    assert.throws(
      () => getPostgresSsl({ env }),
      /PostgreSQL TLS requires PGSSLCERT, PGSSLKEY, and PGSSLROOTCERT together/,
    );
  });
}

test('surfaces TLS file read failures before a database connection is created', () => {
  assert.throws(
    () =>
      getPostgresSsl({
        env: {
          PGSSLCERT: '/tls/tls.crt',
          PGSSLKEY: '/tls/tls.key',
          PGSSLROOTCERT: '/tls/ca.crt',
        },
        readFile: (() => {
          throw new Error('permission denied');
        }) as typeof readFileSync,
      }),
    /permission denied/,
  );
});
