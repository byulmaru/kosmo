import { spawn } from 'node:child_process';
import { globSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const testGroups = ['unit', 'workflow', 'database', 'native-database'] as const;
type TestGroup = (typeof testGroups)[number];

function getTestGroup(filePath: string): TestGroup {
  if (filePath.endsWith('.native-database.test.ts')) {
    return 'native-database';
  }

  if (filePath.endsWith('.database.test.ts')) {
    return 'database';
  }

  if (filePath.endsWith('.workflow.test.ts')) {
    return 'workflow';
  }

  return 'unit';
}

export function discoverTestFiles(sourceDirectory: string): Record<TestGroup, string[]> {
  const testFiles: Record<TestGroup, string[]> = {
    unit: [],
    workflow: [],
    database: [],
    'native-database': [],
  };

  for (const filePath of globSync('**/*.test.ts', { cwd: sourceDirectory }).sort()) {
    testFiles[getTestGroup(filePath)].push(filePath);
  }

  return testFiles;
}

function isTestGroup(value: unknown): value is TestGroup {
  return testGroups.some((group) => group === value);
}

function runTestGroup(group: TestGroup): Promise<void> {
  const workerDirectory = resolve(dirname(fileURLToPath(import.meta.url)), '..');
  const sourceDirectory = join(workerDirectory, 'src');
  const testFiles = discoverTestFiles(sourceDirectory)[group];

  if (testFiles.length === 0) {
    console.error('No Worker test files found for group: ' + group);
    process.exitCode = 1;
    return Promise.resolve();
  }

  const args = ['--import', 'tsx'];
  const environment = { ...process.env };

  if (group === 'database') {
    args.push('--import', '../../packages/core/temporal/test-client.ts');
    environment.KOSMO_TEST_TEMPORAL_RUNTIME = '0';
  }

  if (group === 'native-database') {
    delete environment.KOSMO_TEST_TEMPORAL_RUNTIME;
  }

  args.push('--test');

  if (group === 'database' || group === 'native-database') {
    args.push('--test-concurrency=1');
  }

  args.push(...testFiles.map((filePath) => join('src', filePath)));

  return new Promise((resolvePromise) => {
    const child = spawn(process.execPath, args, {
      cwd: workerDirectory,
      env: environment,
      stdio: 'inherit',
    });

    const forwardSignal = (signal: 'SIGINT' | 'SIGTERM') => {
      if (child.exitCode === null && child.signalCode === null) {
        child.kill(signal);
      }
    };
    const onSigint = () => forwardSignal('SIGINT');
    const onSigterm = () => forwardSignal('SIGTERM');

    const cleanup = () => {
      process.off('SIGINT', onSigint);
      process.off('SIGTERM', onSigterm);
      child.off('error', onError);
      child.off('exit', onExit);
    };

    const onError = (error: Error) => {
      cleanup();
      console.error(error);
      process.exitCode = 1;
      resolvePromise();
    };

    const onExit = (code: number | null, signal: NodeJS.Signals | null) => {
      cleanup();

      if (signal) {
        process.kill(process.pid, signal);
      } else {
        process.exitCode = code ?? 1;
      }

      resolvePromise();
    };

    child.once('error', onError);
    child.once('exit', onExit);
    process.on('SIGINT', onSigint);
    process.on('SIGTERM', onSigterm);
  });
}

const [requestedGroup, ...extraArguments] = process.argv.slice(2);

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  if (!isTestGroup(requestedGroup) || extraArguments.length > 0) {
    console.error(
      'Usage: node --import tsx src/test-runner.ts <unit|workflow|database|native-database>',
    );
    process.exitCode = 2;
  } else {
    void runTestGroup(requestedGroup).catch((error: unknown) => {
      console.error(error);
      process.exitCode = 1;
    });
  }
}
