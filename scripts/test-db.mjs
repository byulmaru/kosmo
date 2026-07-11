import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

const composeFile = 'docker-compose.test.yml';
const serviceName = 'postgres';
const command = process.argv[2];
const extraArgs = process.argv.slice(3);

if (!command || !['down', 'reset', 'up'].includes(command)) {
  console.error('Usage: node scripts/test-db.mjs <down|reset|up> [compose args...]');
  process.exit(1);
}

loadEnvFile('.env.test');
const compose = findCompose();

if (command === 'down') {
  runCompose(['down', ...extraArgs]);
} else if (command === 'up') {
  runCompose(['up', '-d', ...extraArgs]);
  waitForHealthyService();
} else {
  runCompose(['down', '--volumes', '--remove-orphans']);
  runCompose(['up', '-d', '--force-recreate']);
  waitForHealthyService();
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
    process.env[key] = value;
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

  console.error('Neither `docker compose` nor `docker-compose` is available.');
  process.exit(1);
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

  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

function capture(command, args) {
  const result = spawnSync(command, args, {
    encoding: 'utf8',
    env: process.env,
    stdio: ['ignore', 'pipe', 'inherit'],
  });

  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }

  return result.stdout.trim();
}

function waitForHealthyService() {
  const containerId = capture(compose.bin, [
    ...compose.args,
    '-f',
    composeFile,
    'ps',
    '-q',
    serviceName,
  ]);
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

  console.error(`${serviceName} did not become healthy within 60 seconds.`);
  process.exit(1);
}
