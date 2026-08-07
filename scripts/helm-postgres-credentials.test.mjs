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
const fedifyCredential = {
  databaseUrl: 'postgres://kosmo_fedify:$(FEDIFY_DATABASE_PASSWORD)@fedify.example:5432/kosmo',
  name: 'kosmo-fedify',
  key: 'fedify_password',
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
  const fedifyOnlyRender = render(valuesFile({ fedify: fedifyCredential }));
  const bothRender = render(valuesFile({ api: apiCredential, fedify: fedifyCredential }));

  assertApiSource(apiOnlyRender.output, apiCredential);
  assertFedifySource(apiOnlyRender.output, null);
  assertApiSource(fedifyOnlyRender.output, null);
  assertFedifySource(fedifyOnlyRender.output, fedifyCredential);
  assertApiSource(bothRender.output, apiCredential);
  assertFedifySource(bothRender.output, fedifyCredential);

  for (const [role, credential] of [
    ['api', apiCredential],
    ['fedify', fedifyCredential],
  ]) {
    for (const partial of partialCredentials(credential)) {
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
    assert.doesNotMatch(environment, /FEDIFY_DATABASE_/);
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

function assertFedifySource(output, credential) {
  const apiEnvironment = environmentSection(workload(output, 'api'));
  const webEnvironment = environmentSection(workload(output, 'web'));

  assert.doesNotMatch(apiEnvironment, /FEDIFY_DATABASE_/);

  if (!credential) {
    assert.doesNotMatch(webEnvironment, /FEDIFY_DATABASE_/);
    return;
  }

  assert.match(webEnvironment, /name: FEDIFY_DATABASE_PASSWORD/);
  assert.match(webEnvironment, new RegExp(`name: "${escapeRegExp(credential.name)}"`));
  assert.match(webEnvironment, new RegExp(`key: "?${escapeRegExp(credential.key)}"?`));
  assert.match(webEnvironment, new RegExp(`value: "${escapeRegExp(credential.databaseUrl)}"`));
}

function assertMigrationInvariant(environment) {
  const scenarios = [
    {},
    { api: apiCredential },
    { fedify: fedifyCredential },
    { api: apiCredential, fedify: fedifyCredential },
  ];
  const baseline = migrationDocument(render(valuesFile({ environment })).output);

  assert.ok(baseline, `${environment} render did not include a migration Job`);

  for (const scenario of scenarios) {
    const rendered = migrationDocument(render(valuesFile({ environment, ...scenario })).output);
    assert.equal(rendered, baseline, `${environment} migration Job changed for runtime selector`);
  }
}

function partialCredentials(credential) {
  return [
    { databaseUrl: credential.databaseUrl },
    { name: credential.name },
    { key: credential.key },
    { databaseUrl: credential.databaseUrl, name: credential.name },
    { databaseUrl: credential.databaseUrl, key: credential.key },
    { name: credential.name, key: credential.key },
  ];
}

function valuesFile({ environment, api, fedify } = {}) {
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
  appendCredential(lines, 'fedify', fedify);

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
