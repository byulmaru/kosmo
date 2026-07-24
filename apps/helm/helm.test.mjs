import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { test } from 'node:test';

const render = (...args) =>
  execFileSync('helm', ['template', 'kosmo', 'apps/helm', '--namespace', 'kosmo-dev', ...args], {
    encoding: 'utf8',
  });

const occurrences = (manifest, pattern) => manifest.match(pattern)?.length ?? 0;

test('the default chart keeps password authentication', () => {
  const manifest = render('--set', 'env=dev');

  assert.equal(occurrences(manifest, /kind: VaultPKISecret/g), 0);
  assert.equal(occurrences(manifest, /name: DATABASE_PASSWORD/g), 3);
  assert.equal(occurrences(manifest, /name: PGSSLCERT/g), 0);
  assert.match(
    manifest,
    /postgres:\/\/kosmo:\$\(DATABASE_PASSWORD\)@kosmo-postgres-rw:5432\/kosmo/,
  );
});

test('the PKI chart renders server and workload certificates', () => {
  const manifest = render('-f', 'apps/helm/test-values/postgres-pki.yaml');

  assert.equal(occurrences(manifest, /kind: VaultPKISecret/g), 5);
  assert.equal(occurrences(manifest, /name: DATABASE_PASSWORD/g), 0);
  assert.equal(occurrences(manifest, /name: PGSSLCERT/g), 3);
  assert.equal(occurrences(manifest, /rolloutRestartTargets:/g), 3);
  assert.match(manifest, /commonName: "kosmo-dev-postgres"/);
  assert.match(manifest, /- "kosmo-postgres-rw\.kosmo-dev\.svc\.cluster\.local"/);
  assert.match(manifest, /- "kosmo-dev-postgres"/);
  assert.match(manifest, /- "postgres\.dev\.example\.test"/);
  assert.match(manifest, /clientCASecret: kosmo-postgres-server/);
  assert.match(manifest, /replicationTLSSecret: kosmo-replication-postgres-client/);
  assert.match(manifest, /serverTLSSecret: kosmo-postgres-server/);
  assert.match(manifest, /hostssl kosmo kosmo_api all cert/);
  assert.match(manifest, /hostssl kosmo kosmo_web all cert/);
  assert.match(manifest, /hostssl kosmo kosmo_migration all cert/);
  assert.match(manifest, /secretName: "kosmo-api-postgres-client"/);
  assert.match(manifest, /secretName: "kosmo-web-postgres-client"/);
  assert.match(manifest, /secretName: "kosmo-migration-postgres-client"/);
  assert.match(manifest, /commonName: "streaming_replica"/);
});
