import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { describe, it } from 'node:test';

const envModuleUrl = new URL('./env.ts', import.meta.url).href;
const apiEntryUrl = new URL('./index.ts', import.meta.url).href;
const workingDirectory = fileURLToPath(new URL('.', import.meta.url));
const configuredInstanceIds = [
  '019f8ed1-0000-7000-8000-000000000a01',
  '019f8ed1-0000-7000-8000-000000000a02',
];

const importInChild = (
  moduleUrl: string,
  configuration: string | undefined,
  importApiEntry = false,
) => {
  const env = { ...process.env };
  delete env.KOSMO_LOCAL_TIMELINE_INSTANCE_IDS;

  if (configuration !== undefined) {
    env.KOSMO_LOCAL_TIMELINE_INSTANCE_IDS = configuration;
  }

  if (importApiEntry) {
    Object.assign(env, {
      DATABASE_URL: 'postgres://kosmo@127.0.0.1:1/kosmo',
      ENVIRONMENT: '',
      EXPO_PUBLIC_SENTRY_DSN: '',
      NODE_ENV: 'production',
      PGDATABASE: 'kosmo',
      PGHOST: '127.0.0.1',
      PGPASSWORD: '',
      PGPORT: '1',
      PGUSER: 'kosmo',
      PUBLIC_ORIGIN: 'http://127.0.0.1:4173',
      SENTRY_RELEASE: '',
      TEMPORAL_ADDRESS: '127.0.0.1:7233',
      TEMPORAL_NAMESPACE: 'test',
    });
  }

  const source = importApiEntry
    ? `try {
        await import(${JSON.stringify(moduleUrl)});
        process.exit(42);
      } catch (error) {
        console.error(error);
        process.exit(1);
      }`
    : `try {
        const { additionalLocalTimelineInstanceIds } = await import(${JSON.stringify(moduleUrl)});
        console.log(JSON.stringify(additionalLocalTimelineInstanceIds));
      } catch (error) {
        console.error(error);
        process.exit(1);
      }`;

  return spawnSync(process.execPath, ['--import', 'tsx', '--input-type=module', '-e', source], {
    cwd: workingDirectory,
    encoding: 'utf8',
    env,
    timeout: 15_000,
  });
};

describe('API startup environment', () => {
  for (const [label, value, expected] of [
    ['absent', undefined, []],
    ['empty', '', []],
    ['blank CSV entries', ' \t, , \n', []],
    [
      'trimmed UUID CSV entries',
      ` , ${configuredInstanceIds[0].toUpperCase()} , , ${configuredInstanceIds[1]} , `,
      [configuredInstanceIds[0].toUpperCase(), configuredInstanceIds[1]],
    ],
  ] as const) {
    it(`parses ${label} in a fresh process`, () => {
      const result = importInChild(envModuleUrl, value);

      assert.equal(result.error, undefined, result.error?.message);
      assert.equal(result.status, 0, result.stderr);
      assert.deepEqual(JSON.parse(result.stdout.trim()), expected);
    });
  }

  it('rejects malformed UUIDs while importing the environment module', () => {
    const result = importInChild(envModuleUrl, `${configuredInstanceIds[0]}, not-a-uuid`);

    assert.equal(result.error, undefined, result.error?.message);
    assert.equal(result.status, 1, result.stdout);
    assert.match(result.stderr, /KOSMO_LOCAL_TIMELINE_INSTANCE_IDS/);
  });

  it('rejects malformed UUIDs while importing the API entry before startup work', () => {
    const result = importInChild(apiEntryUrl, `${configuredInstanceIds[0]}, not-a-uuid`, true);

    assert.equal(result.error, undefined, result.error?.message);
    assert.equal(result.status, 1, result.stdout);
    assert.match(result.stderr, /KOSMO_LOCAL_TIMELINE_INSTANCE_IDS/);
    assert.match(result.stderr, /must contain only UUIDs/);
  });
});
