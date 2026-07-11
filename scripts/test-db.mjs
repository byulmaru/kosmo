import { spawnSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';

const composeFile = 'docker-compose.test.yml';
const serviceName = 'postgres';
const command = process.argv[2];
const args = process.argv.slice(3);
const providedDatabaseUrl = process.env.DATABASE_URL;

if (!command || !['down', 'drop', 'reset', 'run', 'up'].includes(command)) {
  console.error('Usage: node scripts/test-db.mjs <down|drop|reset|run|up> [-- command...]');
  process.exit(1);
}

loadEnvFile('.env.test');
const compose = findCompose();

try {
  process.exitCode = main();
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
}

function main() {
  if (command === 'down') {
    runCompose(['down', ...args]);
    return 0;
  }

  if (command === 'up') {
    ensurePostgres();
    return 0;
  }

  if (command === 'reset') {
    const databaseUrl = getDefaultDatabaseUrl();
    assertSafeTestDatabaseUrl(databaseUrl);
    ensurePostgres();
    recreateDatabase(getDatabaseName(databaseUrl));
    return 0;
  }

  const databaseUrl = getRunDatabaseUrl();
  assertSafeTestDatabaseUrl(databaseUrl, { isolated: true });

  if (command === 'drop') {
    if (getContainerId()) {
      dropDatabase(getDatabaseName(databaseUrl));
    }

    return 0;
  }

  const delimiter = args.indexOf('--');
  const childCommand = delimiter === -1 ? [] : args.slice(delimiter + 1);

  if (childCommand.length === 0) {
    throw new Error('`run` requires a command after `--`.');
  }

  ensurePostgres();
  recreateDatabase(getDatabaseName(databaseUrl));

  let childStatus = 1;
  let cleanupError;

  try {
    childStatus = runChild(childCommand, databaseUrl);
  } finally {
    try {
      dropDatabase(getDatabaseName(databaseUrl));
    } catch (error) {
      cleanupError = error;
    }
  }

  if (cleanupError) {
    console.error(cleanupError instanceof Error ? cleanupError.message : cleanupError);

    if (childStatus === 0) {
      return 1;
    }
  }

  return childStatus;
}

function loadEnvFile(path) {
  for (const line of readFileSync(path, 'utf8').split(/\r?\n/)) {
    const trimmed = line.trim();

    if (!trimmed || trimmed.startsWith('#')) {
      continue;
    }

    const separator = trimmed.indexOf('=');
    if (separator === -1) {
      continue;
    }

    const key = trimmed.slice(0, separator);
    const value = trimmed.slice(separator + 1);

    if (process.env[key] === undefined) {
      process.env[key] = value;
    }
  }
}

function getDefaultDatabaseUrl() {
  return new URL(process.env.DATABASE_URL ?? '');
}

function getRunDatabaseUrl() {
  if (providedDatabaseUrl) {
    return new URL(providedDatabaseUrl);
  }

  const url = getDefaultDatabaseUrl();
  const runId = process.env.GITHUB_RUN_ID;
  const runAttempt = process.env.GITHUB_RUN_ATTEMPT ?? '1';
  const suffix = runId
    ? `${runId}_${runAttempt}`
    : `${process.pid}_${randomUUID().replaceAll('-', '').slice(0, 8)}`;

  url.pathname = `/kosmo_test_${suffix}`;
  return url;
}

function getDatabaseName(databaseUrl) {
  return decodeURIComponent(databaseUrl.pathname.slice(1));
}

function getPortOffset(databaseName) {
  if (process.env.KOSMO_TEST_PORT_OFFSET !== undefined) {
    const offset = Number(process.env.KOSMO_TEST_PORT_OFFSET);

    if (!Number.isInteger(offset) || offset < 0 || offset > 60_000) {
      throw new Error('KOSMO_TEST_PORT_OFFSET must be an integer from 0 to 60000.');
    }

    return offset;
  }

  let hash = 0;

  for (const character of databaseName) {
    hash = (Math.imul(hash, 31) + character.charCodeAt(0)) >>> 0;
  }

  return (hash % 5_000) * 10;
}

function assertSafeTestDatabaseUrl(databaseUrl, { isolated = false } = {}) {
  const loopbackHosts = new Set(['127.0.0.1', '[::1]', 'localhost']);
  const databaseName = getDatabaseName(databaseUrl);
  const databasePattern = isolated ? /^kosmo_test_[a-z0-9_]+$/ : /^kosmo_test(?:_[a-z0-9_]+)?$/;

  if (!loopbackHosts.has(databaseUrl.hostname) || !databasePattern.test(databaseName)) {
    throw new Error(
      `Refusing destructive test database operation for ${databaseUrl.hostname}/${databaseName}.`,
    );
  }
}

function findCompose() {
  const candidates = [['docker', 'compose'], ['docker-compose']];

  for (const candidate of candidates) {
    const [bin, ...args] = candidate;
    const result = spawnSync(bin, [...args, 'version'], { stdio: 'ignore' });

    if (result.status === 0) {
      return { args, bin };
    }
  }

  throw new Error('Neither `docker compose` nor `docker-compose` is available.');
}

function ensurePostgres() {
  runCompose(['up', '-d']);
  waitForHealthyService();
}

function recreateDatabase(databaseName) {
  dropDatabase(databaseName);
  runPostgresCommand([
    'createdb',
    '--username',
    process.env.POSTGRES_USER ?? 'kosmo',
    databaseName,
  ]);
}

function dropDatabase(databaseName) {
  runPostgresCommand([
    'dropdb',
    '--if-exists',
    '--force',
    '--username',
    process.env.POSTGRES_USER ?? 'kosmo',
    databaseName,
  ]);
}

function runPostgresCommand(args) {
  runCompose(['exec', '-T', serviceName, ...args]);
}

function runCompose(args) {
  run(compose.bin, [...compose.args, '-f', composeFile, ...args]);
}

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    env: process.env,
    stdio: 'inherit',
    ...options,
  });

  if (result.error) {
    throw result.error;
  }

  if (result.status !== 0) {
    throw new Error(`Command failed (${result.status ?? 1}): ${command} ${args.join(' ')}`);
  }
}

function runChild([childCommand, ...childArgs], databaseUrl) {
  const databaseName = getDatabaseName(databaseUrl);
  const result = spawnSync(childCommand, childArgs, {
    env: {
      ...process.env,
      DATABASE_URL: databaseUrl.toString(),
      KOSMO_TEST_PORT_OFFSET: String(getPortOffset(databaseName)),
    },
    stdio: 'inherit',
  });

  if (result.error) {
    console.error(result.error);
    return 1;
  }

  return result.status ?? 1;
}

function capture(command, args) {
  const result = spawnSync(command, args, {
    encoding: 'utf8',
    env: process.env,
    stdio: ['ignore', 'pipe', 'inherit'],
  });

  if (result.error) {
    throw result.error;
  }

  if (result.status !== 0) {
    throw new Error(`Command failed (${result.status ?? 1}): ${command} ${args.join(' ')}`);
  }

  return result.stdout.trim();
}

function getContainerId() {
  return capture(compose.bin, [...compose.args, '-f', composeFile, 'ps', '-q', serviceName]);
}

function waitForHealthyService() {
  const containerId = getContainerId();
  const deadline = Date.now() + 60_000;

  while (Date.now() < deadline) {
    const status = capture('docker', [
      'inspect',
      '--format',
      '{{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}}',
      containerId,
    ]);

    if (status === 'healthy' || status === 'running') {
      return;
    }

    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 1_000);
  }

  throw new Error(`${serviceName} did not become healthy within 60 seconds.`);
}
