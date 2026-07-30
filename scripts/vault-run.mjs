import { spawnSync } from 'node:child_process';
import { chmodSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  argument,
  message,
  multiple,
  object,
  option,
  optional,
  string,
  withDefault,
} from '@optique/core';
import { run } from '@optique/run';

const config = run(
  object({
    env: withDefault(
      option('--env', string({ metavar: 'NAME' }), {
        description: message`Vault environment name under secret/kubernetes/kosmo/.`,
      }),
      'local',
    ),
    secretPath: optional(
      option('--secret-path', string({ metavar: 'PATH' }), {
        description: message`Full Vault KV path. Overrides --env.`,
      }),
    ),
    command: multiple(
      argument(string({ metavar: 'COMMAND' }), {
        description: message`Command to run with Vault values in the environment.`,
      }),
    ),
  }),
  {
    help: 'option',
    programName: 'vault-run',
  },
);
const command = config.command;
const secretPath = config.secretPath ?? `secret/kubernetes/kosmo/${config.env}`;

if (command.length === 0) {
  console.error('Usage: vault-run [--env <name>] [--secret-path <path>] -- <command> [args...]');
  process.exit(1);
}

function main() {
  const tokenLookup = spawnSync('vault', ['token', 'lookup', '-format=json'], {
    stdio: 'ignore',
  });

  if (tokenLookup.error) {
    console.error(`Failed to run vault: ${tokenLookup.error.message}`);
    return 1;
  }

  if (tokenLookup.status !== 0) {
    const login = spawnSync('vault', ['login', '-method=oidc'], { stdio: 'inherit' });

    if (login.error) {
      console.error(`Failed to run vault: ${login.error.message}`);
      return 1;
    }

    if (login.status !== 0) {
      return login.status ?? 1;
    }
  }

  const vault = spawnSync('vault', ['kv', 'get', '-format=json', secretPath], {
    encoding: 'utf8',
  });

  if (vault.error) {
    console.error(`Failed to run vault: ${vault.error.message}`);
    return 1;
  }

  if (vault.status !== 0) {
    process.stderr.write(vault.stderr);
    return vault.status ?? 1;
  }

  let payload;

  try {
    payload = JSON.parse(vault.stdout);
  } catch {
    console.error(`Vault returned invalid JSON for ${secretPath}.`);
    return 1;
  }

  const vaultData = payload.data ?? {};
  const data =
    typeof vaultData.data === 'object' && vaultData.data !== null && 'metadata' in vaultData
      ? vaultData.data
      : vaultData;
  const env = { ...process.env };

  for (const [key, value] of Object.entries(data)) {
    env[key] = String(value);
  }

  const pkiRole = env.DATABASE_PKI_ROLE;
  const pkiCommonName = env.DATABASE_PKI_COMMON_NAME;

  if (Boolean(pkiRole) !== Boolean(pkiCommonName)) {
    console.error('DATABASE_PKI_ROLE and DATABASE_PKI_COMMON_NAME must be configured together.');
    return 1;
  }

  let certificateDirectory;

  try {
    if (pkiRole && pkiCommonName) {
      const mount = env.DATABASE_PKI_MOUNT || 'pki';
      const pkiArguments = [
        'write',
        '-format=json',
        `${mount}/issue/${pkiRole}`,
        `common_name=${pkiCommonName}`,
      ];

      if (env.DATABASE_PKI_TTL) {
        pkiArguments.push(`ttl=${env.DATABASE_PKI_TTL}`);
      }

      const certificateResult = spawnSync('vault', pkiArguments, {
        encoding: 'utf8',
      });

      if (certificateResult.error) {
        console.error(`Failed to run vault: ${certificateResult.error.message}`);
        return 1;
      }

      if (certificateResult.status !== 0) {
        process.stderr.write(certificateResult.stderr);
        return certificateResult.status ?? 1;
      }

      let certificatePayload;

      try {
        certificatePayload = JSON.parse(certificateResult.stdout);
      } catch {
        console.error('Vault PKI returned invalid JSON.');
        return 1;
      }

      const certificate = certificatePayload.data?.certificate;
      const privateKey = certificatePayload.data?.private_key;
      const issuingCa = certificatePayload.data?.issuing_ca;

      if (
        typeof certificate !== 'string' ||
        typeof privateKey !== 'string' ||
        typeof issuingCa !== 'string'
      ) {
        console.error('Vault PKI response is missing certificate, private_key, or issuing_ca.');
        return 1;
      }

      certificateDirectory = mkdtempSync(join(tmpdir(), 'kosmo-postgres-tls-'));
      chmodSync(certificateDirectory, 0o700);

      const certificatePath = join(certificateDirectory, 'tls.crt');
      const privateKeyPath = join(certificateDirectory, 'tls.key');
      const rootCertificatePath = join(certificateDirectory, 'ca.crt');

      writeFileSync(certificatePath, certificate, { mode: 0o600 });
      writeFileSync(privateKeyPath, privateKey, { mode: 0o600 });
      writeFileSync(rootCertificatePath, issuingCa, { mode: 0o600 });

      env.PGSSLCERT = certificatePath;
      env.PGSSLKEY = privateKeyPath;
      env.PGSSLROOTCERT = rootCertificatePath;
    }

    const result = spawnSync(command[0], command.slice(1), {
      env,
      stdio: 'inherit',
    });

    if (result.error) {
      console.error(`Failed to run ${command[0]}: ${result.error.message}`);
      return 1;
    }

    return result.status ?? 1;
  } finally {
    if (certificateDirectory) {
      rmSync(certificateDirectory, { force: true, recursive: true });
    }
  }
}

process.exitCode = main();
