import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import test from 'node:test';

const importClient = (environment: NodeJS.ProcessEnv) =>
  spawnSync(
    process.execPath,
    [
      '--import',
      'tsx',
      '--input-type=module',
      '--eval',
      `const [{ temporalClient }, { Client }] = await Promise.all([
        import('./client.ts'),
        import('@temporalio/client'),
      ]);
      if (!(temporalClient instanceof Client)) process.exit(2);`,
    ],
    {
      cwd: import.meta.dirname,
      encoding: 'utf8',
      env: environment,
    },
  );

test('Temporal address가 없으면 client module import에서 거부한다', () => {
  const environment = { ...process.env };
  delete environment.TEMPORAL_ADDRESS;
  environment.TEMPORAL_NAMESPACE = 'test';

  const result = importClient(environment);

  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /TEMPORAL_ADDRESS is required/);
});

test('Temporal namespace가 없으면 client module import에서 거부한다', () => {
  const environment = { ...process.env };
  environment.TEMPORAL_ADDRESS = '127.0.0.1:7233';
  delete environment.TEMPORAL_NAMESPACE;

  const result = importClient(environment);

  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /TEMPORAL_NAMESPACE is required/);
});

test('Temporal runtime 입력으로 실제 process-global Client를 export한다', () => {
  const result = importClient({
    ...process.env,
    TEMPORAL_ADDRESS: '127.0.0.1:7233',
    TEMPORAL_NAMESPACE: 'test',
  });

  assert.equal(result.status, 0, result.stderr);
});
