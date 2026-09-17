import { spawnSync } from 'node:child_process';
import { setTimeout } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';

const rootDirectory = fileURLToPath(new URL('..', import.meta.url));
const postgresCompose = 'docker-compose.postgres.local.yml';
const queueDatabaseUrl = 'postgres://kosmo_fedify_queue@127.0.0.1:54328/kosmo_fedify_queue';
const temporalHealthUrl = 'http://127.0.0.1:8083/health';

const bootstrapSql = String.raw`
\getenv owner_password LOCAL_POSTGRES_OWNER_PASSWORD
\getenv runtime_password LOCAL_POSTGRES_RUNTIME_PASSWORD
\getenv queue_password FEDIFY_QUEUE_DATABASE_PASSWORD

SELECT pg_advisory_lock(1263489869, 1279545164);

SELECT format(
  'CREATE ROLE kosmo LOGIN INHERIT NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS PASSWORD %L',
  :'owner_password'
) WHERE NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'kosmo') \gexec
SELECT format(
  'ALTER ROLE kosmo LOGIN INHERIT NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS PASSWORD %L',
  :'owner_password'
) \gexec

SELECT format(
  'CREATE ROLE kosmo_runtime LOGIN INHERIT NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS PASSWORD %L',
  :'runtime_password'
) WHERE NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'kosmo_runtime') \gexec
SELECT format(
  'ALTER ROLE kosmo_runtime LOGIN INHERIT NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS PASSWORD %L',
  :'runtime_password'
) \gexec
SELECT format('REVOKE %I FROM kosmo_runtime', parent.rolname)
FROM pg_auth_members membership
JOIN pg_roles parent ON parent.oid = membership.roleid
JOIN pg_roles member ON member.oid = membership.member
WHERE member.rolname = 'kosmo_runtime' \gexec

SELECT 'CREATE ROLE kosmo_api NOLOGIN INHERIT NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS'
WHERE NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'kosmo_api') \gexec
SELECT 'CREATE ROLE kosmo_worker NOLOGIN INHERIT NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS'
WHERE NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'kosmo_worker') \gexec

SELECT format(
  'CREATE ROLE kosmo_fedify_queue LOGIN INHERIT NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS PASSWORD %L',
  :'queue_password'
) WHERE NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'kosmo_fedify_queue') \gexec
SELECT format(
  'ALTER ROLE kosmo_fedify_queue LOGIN INHERIT NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS PASSWORD %L',
  :'queue_password'
) \gexec
SELECT format('REVOKE %I FROM kosmo_fedify_queue', parent.rolname)
FROM pg_auth_members membership
JOIN pg_roles parent ON parent.oid = membership.roleid
JOIN pg_roles member ON member.oid = membership.member
WHERE member.rolname = 'kosmo_fedify_queue' \gexec

SELECT 'CREATE DATABASE kosmo OWNER kosmo'
WHERE NOT EXISTS (SELECT 1 FROM pg_database WHERE datname = 'kosmo') \gexec
ALTER DATABASE kosmo OWNER TO kosmo;
REVOKE CONNECT ON DATABASE kosmo FROM PUBLIC;
GRANT CONNECT ON DATABASE kosmo TO kosmo, kosmo_runtime;

SELECT 'CREATE DATABASE kosmo_fedify_queue OWNER kosmo_fedify_queue'
WHERE NOT EXISTS (SELECT 1 FROM pg_database WHERE datname = 'kosmo_fedify_queue') \gexec
ALTER DATABASE kosmo_fedify_queue OWNER TO kosmo_fedify_queue;
REVOKE CONNECT ON DATABASE kosmo_fedify_queue FROM PUBLIC;
GRANT CONNECT ON DATABASE kosmo_fedify_queue TO kosmo_fedify_queue;

SELECT pg_advisory_unlock(1263489869, 1279545164);
`;

function requireValue(environment, key) {
  if (!environment[key]?.trim()) {
    throw new Error(`${key} is required.`);
  }
}

export function validateRuntimeEnvironment(environment) {
  const expected = {
    PGDATABASE: 'kosmo',
    PGHOST: '127.0.0.1',
    PGPORT: '54328',
    PGUSER: 'kosmo_runtime',
  };

  for (const [key, value] of Object.entries(expected)) {
    if (environment[key] !== value) {
      throw new Error(`${key} must be ${value} for local development.`);
    }
  }

  requireValue(environment, 'PGPASSWORD');
  requireValue(environment, 'FEDIFY_QUEUE_DATABASE_PASSWORD');
  requireValue(environment, 'FEDIFY_QUEUE_DATABASE_URL');
  requireValue(environment, 'PUBLIC_ORIGIN');

  let parsedQueueUrl;
  try {
    parsedQueueUrl = new URL(environment.FEDIFY_QUEUE_DATABASE_URL);
  } catch {
    throw new Error('FEDIFY_QUEUE_DATABASE_URL must be the approved local queue URL.');
  }

  if (parsedQueueUrl.password) {
    throw new Error('FEDIFY_QUEUE_DATABASE_URL must not contain a password.');
  }
  if (parsedQueueUrl.toString() !== queueDatabaseUrl) {
    throw new Error('FEDIFY_QUEUE_DATABASE_URL must be the approved local queue URL.');
  }
}

export function validateBootstrapEnvironment(environment) {
  validateRuntimeEnvironment(environment);
  requireValue(environment, 'LOCAL_POSTGRES_ADMIN_PASSWORD');
  requireValue(environment, 'LOCAL_POSTGRES_OWNER_PASSWORD');
}

function withoutKeys(environment, keys) {
  const result = { ...environment };
  for (const key of keys) {
    delete result[key];
  }
  return result;
}

export function buildApplicationEnvironment(environment) {
  validateRuntimeEnvironment(environment);
  return {
    ...withoutKeys(environment, [
      'DATABASE_URL',
      'LOCAL_POSTGRES_ADMIN_PASSWORD',
      'LOCAL_POSTGRES_OWNER_PASSWORD',
    ]),
    TEMPORAL_ADDRESS: '127.0.0.1:7233',
    TEMPORAL_NAMESPACE: 'default',
  };
}

export function buildBootstrapLoaderEnvironment(environment) {
  return withoutKeys(environment, [
    'LOCAL_POSTGRES_ADMIN_PASSWORD',
    'LOCAL_POSTGRES_OWNER_PASSWORD',
  ]);
}

function buildBootstrapExecutionEnvironment(environment) {
  validateBootstrapEnvironment(environment);
  return {
    ...environment,
    LOCAL_POSTGRES_RUNTIME_PASSWORD: environment.PGPASSWORD,
    PGPASSWORD: environment.LOCAL_POSTGRES_ADMIN_PASSWORD,
  };
}

export function buildMigrationEnvironment(environment) {
  validateBootstrapEnvironment(environment);
  return {
    ...withoutKeys(environment, [
      'DATABASE_URL',
      'FEDIFY_QUEUE_DATABASE_PASSWORD',
      'FEDIFY_QUEUE_DATABASE_URL',
      'LOCAL_POSTGRES_ADMIN_PASSWORD',
      'LOCAL_POSTGRES_OWNER_PASSWORD',
    ]),
    PGDATABASE: 'kosmo',
    PGHOST: '127.0.0.1',
    PGPASSWORD: environment.LOCAL_POSTGRES_OWNER_PASSWORD,
    PGPORT: '54328',
    PGUSER: 'kosmo',
  };
}

function buildLocalInstanceEnvironment(environment) {
  return withoutKeys(buildApplicationEnvironment(environment), [
    'FEDIFY_QUEUE_DATABASE_PASSWORD',
    'FEDIFY_QUEUE_DATABASE_URL',
  ]);
}

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: rootDirectory,
    env: process.env,
    stdio: 'inherit',
    ...options,
  });

  if (result.error) {
    throw result.error;
  }
  if (result.status !== 0) {
    throw new Error(`${command} failed with exit code ${result.status ?? 1}.`);
  }
}

function compose(args, options) {
  run('docker', ['compose', '-p', 'kosmo-local-postgres', '-f', postgresCompose, ...args], options);
}

function startPostgres(environment) {
  requireValue(environment, 'LOCAL_POSTGRES_ADMIN_PASSWORD');
  compose(['up', '-d', '--wait'], { env: environment });
}

function prepare(environment) {
  validateBootstrapEnvironment(environment);
  startPostgres(environment);
  const bootstrapEnvironment = buildBootstrapExecutionEnvironment(environment);
  compose(
    [
      'exec',
      '-T',
      '-e',
      'LOCAL_POSTGRES_OWNER_PASSWORD',
      '-e',
      'LOCAL_POSTGRES_RUNTIME_PASSWORD',
      '-e',
      'PGPASSWORD',
      '-e',
      'FEDIFY_QUEUE_DATABASE_PASSWORD',
      'postgres',
      'psql',
      '--no-psqlrc',
      '--set=ON_ERROR_STOP=1',
      '--host=127.0.0.1',
      '--username=postgres',
      '--dbname=postgres',
    ],
    {
      env: bootstrapEnvironment,
      input: bootstrapSql,
      stdio: ['pipe', 'inherit', 'inherit'],
    },
  );
  run('pnpm', ['--filter', '@kosmo/core', 'db:migrate'], {
    env: buildMigrationEnvironment(environment),
  });
  run('pnpm', ['--filter', '@kosmo/api', 'db:bootstrap-local-instance'], {
    env: buildLocalInstanceEnvironment(environment),
  });
}

function prepareWithBootstrapSecret(environment) {
  run(
    process.execPath,
    [
      'scripts/vault-run.mjs',
      '--secret-path',
      'secret/kubernetes/kosmo/local/postgres-bootstrap',
      '--',
      process.execPath,
      'scripts/local-development.mjs',
      'prepare',
    ],
    { env: buildBootstrapLoaderEnvironment(environment) },
  );
}

export async function waitForTemporal({
  fetchImplementation = fetch,
  requestTimeoutMilliseconds = 1_000,
  retryDelayMilliseconds = 250,
  timeoutMilliseconds = 120_000,
} = {}) {
  const deadline = Date.now() + timeoutMilliseconds;
  while (Date.now() < deadline) {
    try {
      const response = await fetchImplementation(temporalHealthUrl, {
        signal: AbortSignal.timeout(
          Math.min(requestTimeoutMilliseconds, Math.max(1, deadline - Date.now())),
        ),
      });
      if (response.ok) {
        return;
      }
    } catch {
      // The local server may still be starting.
    }
    await setTimeout(Math.min(retryDelayMilliseconds, Math.max(0, deadline - Date.now())));
  }
  throw new Error(`Local Temporal did not become ready at ${temporalHealthUrl}.`);
}

function usage() {
  console.error(
    'Usage: local-development <services-up|prepare|prepare-with-bootstrap-secret|run|wait-temporal|services-down> [-- command ...]',
  );
}

async function main() {
  const [action, separator, ...command] = process.argv.slice(2);
  try {
    switch (action) {
      case 'services-up':
        startPostgres(process.env);
        break;
      case 'prepare':
        prepare(process.env);
        break;
      case 'prepare-with-bootstrap-secret':
        prepareWithBootstrapSecret(process.env);
        break;
      case 'run': {
        if (separator !== undefined && separator !== '--') {
          throw new Error('Custom run commands must follow --.');
        }
        const environment = buildApplicationEnvironment(process.env);
        run(
          command[0] ?? 'pnpm',
          command.length > 0
            ? command.slice(1)
            : ['--workspace-root', 'run', '--parallel', '/^local-dev:(temporal|services)$/'],
          { env: environment },
        );
        break;
      }
      case 'wait-temporal':
        await waitForTemporal();
        break;
      case 'services-down':
        compose(['down']);
        break;
      default:
        usage();
        process.exitCode = 1;
    }
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  }
}

if (import.meta.main) {
  await main();
}
