import { readFileSync } from 'node:fs';

export interface PostgresTlsClientOptions {
  ssl?: {
    ca: string;
    cert: string;
    key: string;
    rejectUnauthorized: true;
  };
}

/**
 * Read the optional Postgres.js client-certificate configuration.
 *
 * The environment prefix is the part before `CERT`, `KEY`, and `ROOTCERT`.
 * For example, `WORKER_PGSSL` reads `WORKER_PGSSLCERT`, `WORKER_PGSSLKEY`,
 * and `WORKER_PGSSLROOTCERT`.
 */
export function getPostgresTlsOptions(
  prefix = 'PGSSL',
  environment: NodeJS.ProcessEnv = process.env,
): PostgresTlsClientOptions {
  const variables = {
    cert: `${prefix}CERT`,
    key: `${prefix}KEY`,
    ca: `${prefix}ROOTCERT`,
  } as const;

  const paths = {
    cert: environment[variables.cert],
    key: environment[variables.key],
    ca: environment[variables.ca],
  };
  const configured = Object.values(paths).filter(Boolean).length;

  if (configured === 0) {
    return {};
  }

  if (configured !== Object.keys(paths).length) {
    throw new Error(
      `${Object.values(variables).join(', ')} must be configured together for PostgreSQL TLS client authentication.`,
    );
  }

  const contents = {
    cert: readTlsFile(paths.cert!, variables.cert),
    key: readTlsFile(paths.key!, variables.key),
    ca: readTlsFile(paths.ca!, variables.ca),
  };

  return {
    ssl: {
      ...contents,
      rejectUnauthorized: true,
    },
  };
}

function readTlsFile(path: string, variable: string): string {
  try {
    return readFileSync(path, 'utf8');
  } catch {
    // Do not include the filesystem error: it may be supplied by a wrapper and
    // must never expose certificate or private-key contents.
    throw new Error(`Unable to read ${variable} for PostgreSQL TLS client authentication.`);
  }
}
