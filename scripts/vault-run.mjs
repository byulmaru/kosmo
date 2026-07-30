import { spawnSync } from 'node:child_process';
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

const tokenLookup = spawnSync('vault', ['token', 'lookup', '-format=json'], {
  stdio: 'ignore',
});

if (tokenLookup.error) {
  console.error(`Failed to run vault: ${tokenLookup.error.message}`);
  process.exit(1);
}

if (tokenLookup.status !== 0) {
  const login = spawnSync('vault', ['login', '-method=oidc'], { stdio: 'inherit' });

  if (login.error) {
    console.error(`Failed to run vault: ${login.error.message}`);
    process.exit(1);
  }

  if (login.status !== 0) {
    process.exit(login.status ?? 1);
  }
}

const vault = spawnSync('vault', ['kv', 'get', '-format=json', secretPath], {
  encoding: 'utf8',
});

if (vault.error) {
  console.error(`Failed to run vault: ${vault.error.message}`);
  process.exit(1);
}

if (vault.status !== 0) {
  process.stderr.write(vault.stderr);
  process.exit(vault.status ?? 1);
}

const payload = JSON.parse(vault.stdout);
const vaultData = payload.data ?? {};
const data =
  typeof vaultData.data === 'object' && vaultData.data !== null && 'metadata' in vaultData
    ? vaultData.data
    : vaultData;
const env = { ...process.env };

for (const [key, value] of Object.entries(data)) {
  env[key] = String(value);
}

const result = spawnSync(command[0], command.slice(1), {
  env,
  stdio: 'inherit',
});

if (result.error) {
  console.error(`Failed to run ${command[0]}: ${result.error.message}`);
  process.exit(1);
}

process.exit(result.status ?? 1);
