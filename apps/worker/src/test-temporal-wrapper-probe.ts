import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { access, readFile, stat, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Connection } from '@temporalio/client';

const [mode, markerPath] = process.argv.slice(2);
const address = process.env.KOSMO_TEST_TEMPORAL_ADDRESS?.trim();
const bundlePath = process.env.KOSMO_TEST_WORKFLOW_BUNDLE_PATH?.trim();
const workerDirectory = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const repositoryRoot = resolve(workerDirectory, '../..');
const wrapperPath = join(workerDirectory, 'src/test-temporal.ts');
const probePath = fileURLToPath(import.meta.url);
const tsxLoaderPath = join(workerDirectory, 'node_modules/tsx/dist/loader.mjs');

assert.ok(address, 'Expected the Temporal test address from the wrapper.');
assert.ok(bundlePath, 'Expected the Workflow bundle path from the wrapper.');
const bundleStats = await stat(bundlePath);
assert.ok(bundleStats.size > 0, 'Expected the compiled Workflow bundle to be nonempty.');
await access(bundlePath);

const connection = await Connection.connect({ address, connectTimeout: 5_000 });
try {
  await connection.workflowService.getSystemInfo({});
} finally {
  await connection.close();
}

let grandchildPid: number | undefined;
if (mode === 'nested') {
  const nestedMarkerPath = `${markerPath}.nested`;
  const nested = spawn(
    process.execPath,
    [
      '--import',
      tsxLoaderPath,
      wrapperPath,
      '--',
      process.execPath,
      '--import',
      tsxLoaderPath,
      probePath,
      'success',
      nestedMarkerPath,
    ],
    { cwd: repositoryRoot, env: { ...process.env }, stdio: 'inherit' },
  );
  const [nestedCode, nestedSignal] = await once(nested, 'close');
  assert.equal(nestedCode, 0, 'Expected the nested wrapper command to succeed.');
  assert.equal(nestedSignal, null, 'Expected the nested wrapper command to exit normally.');
  const nestedCapture = JSON.parse(await readFile(nestedMarkerPath, 'utf8')) as {
    address: string;
    bundlePath: string;
  };
  assert.equal(nestedCapture.address, address);
  assert.equal(nestedCapture.bundlePath, bundlePath);
  await access(bundlePath);

  const afterNested = await Connection.connect({ address, connectTimeout: 5_000 });
  try {
    await afterNested.workflowService.getSystemInfo({});
  } finally {
    await afterNested.close();
  }
}

if (mode === 'wait') {
  process.on('SIGTERM', () => {});
  const grandchild = spawn(
    process.execPath,
    [
      '-e',
      "process.on('SIGTERM', () => {}); process.stdout.write('ready'); setInterval(() => {}, 1000)",
    ],
    { stdio: ['ignore', 'pipe', 'ignore'] },
  );
  await once(grandchild.stdout!, 'data');
  grandchildPid = grandchild.pid;
}

await writeFile(
  markerPath,
  JSON.stringify({
    address,
    bundlePath,
    cwd: process.cwd(),
    processGroupId: process.pid,
    grandchildPid,
  }),
);

if (mode === 'failure') {
  process.exitCode = 17;
} else if (mode === 'wait') {
  setInterval(() => {}, 1_000);
} else {
  assert.ok(mode === 'success' || mode === 'nested');
}
