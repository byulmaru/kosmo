import { readFileSync } from 'node:fs';

const tlsEnvironmentKeys = ['PGSSLCERT', 'PGSSLKEY', 'PGSSLROOTCERT'] as const;

type TlsEnvironmentKey = (typeof tlsEnvironmentKeys)[number];
type TlsEnvironment = Record<string, string | undefined> &
  Partial<Record<TlsEnvironmentKey, string | undefined>>;

export function getPostgresSsl({
  env = process.env,
  readFile = readFileSync,
}: {
  env?: TlsEnvironment;
  readFile?: typeof readFileSync;
} = {}) {
  const configuredKeys = tlsEnvironmentKeys.filter((key) => env[key]);

  if (configuredKeys.length === 0) {
    return undefined;
  }

  if (configuredKeys.length !== tlsEnvironmentKeys.length) {
    const missingKeys = tlsEnvironmentKeys.filter((key) => !env[key]);
    throw new Error(
      `PostgreSQL TLS requires PGSSLCERT, PGSSLKEY, and PGSSLROOTCERT together. Missing: ${missingKeys.join(', ')}.`,
    );
  }

  return {
    cert: readFile(env.PGSSLCERT!),
    key: readFile(env.PGSSLKEY!),
    ca: readFile(env.PGSSLROOTCERT!),
    rejectUnauthorized: true,
  };
}
