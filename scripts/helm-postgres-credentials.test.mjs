import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const chartPath = resolve(repositoryRoot, 'apps/helm');
const helm = process.env.HELM_BIN ?? 'helm';
const temporaryDirectory = mkdtempSync(resolve(tmpdir(), 'kosmo-helm-credentials-'));
// SHA-256 of the pre-selector chart rendered with Helm 4.2.2 and the args below.
const preCredentialDefaultSha256 =
  'a3c186bbac4ff8a3317656642c630445ed2d39d7b16dd9ef87fccc293f72566a';
let temporaryValuesCounter = 0;

const apiCredential = {
  databaseUrl: 'postgres://kosmo_api:$(DATABASE_PASSWORD)@api.example:5432/kosmo',
  name: 'kosmo-api',
  key: '123',
};
const systemCredential = {
  databaseUrl: 'postgres://kosmo_system:$(SYSTEM_DATABASE_PASSWORD)@system.example:5432/kosmo',
  name: 'kosmo-system',
  key: 'system_password',
};

try {
  runAssertions();
  console.log('Helm PostgreSQL credential selection regression passed.');
} finally {
  rmSync(temporaryDirectory, { force: true, recursive: true });
}

function runAssertions() {
  const defaultRender = render();
  const explicitEmptyRender = render(valuesFile());

  assert.equal(
    explicitEmptyRender.output,
    defaultRender.output,
    'empty selectors changed the default manifest',
  );
  assert.equal(
    createHash('sha256').update(defaultRender.output).digest('hex'),
    preCredentialDefaultSha256,
    'empty selectors changed the pre-credential default manifest',
  );
  assertDefaultRuntime(defaultRender.output);

  const apiOnlyRender = render(valuesFile({ api: apiCredential }));
  const systemOnlyRender = render(valuesFile({ system: systemCredential }));
  const bothRender = render(valuesFile({ api: apiCredential, system: systemCredential }));

  assertApiSource(apiOnlyRender.output, apiCredential);
  assert.doesNotMatch(
    environmentSection(workload(apiOnlyRender.output, 'web')),
    /SYSTEM_DATABASE_/,
  );
  assertApiSource(systemOnlyRender.output, null);
  assertSystemSource(systemOnlyRender.output, systemCredential);
  assertApiSource(bothRender.output, apiCredential);
  assertSystemSource(bothRender.output, systemCredential);

  for (const role of ['api', 'system']) {
    for (const partial of partialCredentials()) {
      const result = render(valuesFile({ [role]: partial }), { expectFailure: true });
      assert.match(
        `${result.output}\n${result.error}`,
        new RegExp(`postgres\\.credentials\\.${role}`),
        `partial ${role} selector did not identify the failing role`,
      );
    }
  }

  assertMigrationInvariant('dev');
  assertMigrationInvariant('prod');
}

function assertDefaultRuntime(output) {
  const apiEnvironment = environmentSection(workload(output, 'api'));
  const webEnvironment = environmentSection(workload(output, 'web'));
  const defaultUrl = 'postgres://kosmo:$(DATABASE_PASSWORD)@kosmo-postgres-rw:5432/kosmo';

  for (const environment of [apiEnvironment, webEnvironment]) {
    assert.match(environment, /name: "kosmo-postgres-app"/);
    assert.match(environment, /key: password/);
    assert.match(environment, new RegExp(`value: "${escapeRegExp(defaultUrl)}"`));
    assert.doesNotMatch(environment, /SYSTEM_DATABASE_/);
  }
}

function assertApiSource(output, credential) {
  const apiEnvironment = environmentSection(workload(output, 'api'));
  const webEnvironment = environmentSection(workload(output, 'web'));

  if (credential) {
    for (const environment of [apiEnvironment, webEnvironment]) {
      assert.match(environment, new RegExp(`name: "${escapeRegExp(credential.name)}"`));
      assert.match(environment, new RegExp(`key: "${escapeRegExp(credential.key)}"`));
      assert.match(environment, new RegExp(`value: "${escapeRegExp(credential.databaseUrl)}"`));
    }
  } else {
    const defaultUrl = 'postgres://kosmo:$(DATABASE_PASSWORD)@kosmo-postgres-rw:5432/kosmo';

    for (const environment of [apiEnvironment, webEnvironment]) {
      assert.match(environment, /name: "kosmo-postgres-app"/);
      assert.match(environment, /key: password/);
      assert.match(environment, new RegExp(`value: "${escapeRegExp(defaultUrl)}"`));
    }
  }
}

function assertSystemSource(output, credential) {
  const apiEnvironment = environmentSection(workload(output, 'api'));
  const webEnvironment = environmentSection(workload(output, 'web'));

  assert.doesNotMatch(apiEnvironment, /SYSTEM_DATABASE_/);
  assert.match(webEnvironment, /name: SYSTEM_DATABASE_PASSWORD/);
  assert.match(webEnvironment, new RegExp(`name: "${escapeRegExp(credential.name)}"`));
  assert.match(webEnvironment, new RegExp(`key: "?${escapeRegExp(credential.key)}"?`));
  assert.match(webEnvironment, new RegExp(`value: "${escapeRegExp(credential.databaseUrl)}"`));
}

function assertMigrationInvariant(environment) {
  const scenarios = [
    {},
    { api: apiCredential },
    { system: systemCredential },
    { api: apiCredential, system: systemCredential },
  ];
  const baseline = migrationDocument(render(valuesFile({ environment })).output);

  assert.ok(baseline, `${environment} render did not include a migration Job`);

  for (const scenario of scenarios) {
    const rendered = migrationDocument(render(valuesFile({ environment, ...scenario })).output);
    assert.equal(rendered, baseline, `${environment} migration Job changed for runtime selector`);
  }
}

function partialCredentials() {
  return [
    { databaseUrl: apiCredential.databaseUrl },
    { name: apiCredential.name },
    { key: apiCredential.key },
    { databaseUrl: apiCredential.databaseUrl, name: apiCredential.name },
    { databaseUrl: apiCredential.databaseUrl, key: apiCredential.key },
    { name: apiCredential.name, key: apiCredential.key },
  ];
}

function valuesFile({ environment, api, system } = {}) {
  const lines = [];

  if (environment) {
    lines.push(`env: ${environment}`);
  }

  if (environment === 'prod') {
    lines.push('imageDigest: sha256:' + 'a'.repeat(64));
    lines.push('migration:', '  enabled: true');
  }

  lines.push('postgres:', '  credentials:');
  appendCredential(lines, 'api', api);
  appendCredential(lines, 'system', system);

  return `${lines.join('\n')}\n`;
}

function appendCredential(lines, role, credential = {}) {
  lines.push(`    ${role}:`);
  lines.push(`      databaseUrl: ${yamlString(credential.databaseUrl ?? '')}`);
  lines.push('      passwordSecret:');
  lines.push(`        name: ${yamlString(credential.name ?? '')}`);
  lines.push(`        key: ${yamlString(credential.key ?? '')}`);
}

function yamlString(value) {
  return JSON.stringify(value);
}

function render(values, { expectFailure = false } = {}) {
  const args = [
    'template',
    'kosmo',
    chartPath,
    '--namespace',
    'kosmo',
    '--set',
    'image=example/kosmo',
    '--set',
    'version=test',
  ];

  if (values) {
    const valuesPath = resolve(temporaryDirectory, `values-${temporaryValuesCounter++}.yaml`);
    writeFileSync(valuesPath, values);
    args.push('--values', valuesPath);
  }

  const result = spawnSync(helm, args, {
    cwd: repositoryRoot,
    encoding: 'utf8',
    env: process.env,
  });

  if (result.error) {
    throw result.error;
  }

  if (expectFailure) {
    assert.notEqual(result.status, 0, 'partial selector unexpectedly rendered successfully');
  } else {
    assert.equal(result.status, 0, `Helm render failed:\n${result.stdout}\n${result.stderr}`);
  }

  return { error: result.stderr, output: result.stdout };
}

function workload(output, name) {
  const document = documents(output).find(
    (candidate) =>
      candidate.includes('kind: Rollout') && candidate.includes(`app.kubernetes.io/name: ${name}`),
  );

  assert.ok(document, `missing ${name} Rollout`);
  return document;
}

function environmentSection(document) {
  const match = document.match(/\n\s+env:\n([\s\S]*?)\n\s+envFrom:/);

  assert.ok(match, 'workload does not contain an env section');
  return match[1];
}

function migrationDocument(output) {
  return documents(output).find(
    (candidate) =>
      candidate.includes('kind: Job') && candidate.includes('app.kubernetes.io/name: db-migrate'),
  );
}

function documents(output) {
  return output
    .split(/^---\s*$/m)
    .map((document) => document.trim())
    .filter(Boolean);
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
