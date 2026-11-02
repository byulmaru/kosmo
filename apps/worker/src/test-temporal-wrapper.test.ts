import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { access, mkdtemp, readFile, rm } from 'node:fs/promises';
import { createConnection } from 'node:net';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { after, test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { Connection } from '@temporalio/client';

const workerDirectory = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const repositoryRoot = resolve(workerDirectory, '../..');
const wrapperPath = join(workerDirectory, 'src/test-temporal.ts');
const probePath = join(workerDirectory, 'src/test-temporal-wrapper-probe.ts');
const tsxLoaderPath = join(workerDirectory, 'node_modules/tsx/dist/loader.mjs');
const temporalAddressKey = 'KOSMO_TEST_TEMPORAL_ADDRESS';
const workflowBundlePathKey = 'KOSMO_TEST_WORKFLOW_BUNDLE_PATH';
const inheritedAddress = process.env[temporalAddressKey]?.trim();
const inheritedBundlePath = process.env[workflowBundlePathKey]?.trim();
const hasParentRuntime = Boolean(inheritedAddress && inheritedBundlePath);

after(async () => {
  if (!hasParentRuntime) {
    return;
  }
  await access(inheritedBundlePath!);
  await assertTemporalServerAvailable(inheritedAddress!);
});

if (hasParentRuntime) {
  test('nested Temporal test wrapper reuses its parent runtime', async () => {
    await withMarkerDirectory(async (markerDirectory) => {
      const nestedMarker = join(markerDirectory, 'nested.json');
      const nested = await runWrapper(['success', nestedMarker], { ...process.env }, false);
      assert.equal(nested.code, 0, nested.output);
      assert.equal(nested.signal, null, nested.output);
      const capture = await readCapture(nestedMarker);
      assert.equal(capture.address, inheritedAddress);
      assert.equal(capture.bundlePath, inheritedBundlePath);
      assert.equal(capture.cwd, repositoryRoot);
      await waitForProcessGroupUnavailable(capture.processGroupId);
      await access(inheritedBundlePath!);
      await assertTemporalServerAvailable(inheritedAddress!);
    });
  });
} else {
  test('Temporal test wrapper succeeds with a nested wrapper sharing its runtime', async () => {
    await withMarkerDirectory(async (markerDirectory) => {
      const successMarker = join(markerDirectory, 'success.json');
      const success = await runWrapper(['nested', successMarker]);
      assert.equal(success.code, 0, success.output);
      assert.equal(success.signal, null, success.output);
      await assertCleanedUp(await readCapture(successMarker));
    });
  });

  test('Temporal test wrapper forwards a child exit code and cleans up', async () => {
    await withMarkerDirectory(async (markerDirectory) => {
      const failureMarker = join(markerDirectory, 'failure.json');
      const failure = await runWrapper(['failure', failureMarker]);
      assert.equal(failure.code, 17, failure.output);
      assert.equal(failure.signal, null, failure.output);
      await assertCleanedUp(await readCapture(failureMarker));
    });
  });

  test('Temporal test wrapper drains a SIGTERM process group before cleanup', async () => {
    await withMarkerDirectory(async (markerDirectory) => {
      const signalMarker = join(markerDirectory, 'signal.json');
      const signalRun = startWrapper(['wait', signalMarker]);
      const signalCapture = await waitForCapture(signalMarker, signalRun.child);
      assert.ok(signalCapture.grandchildPid && signalCapture.grandchildPid > 0);
      signalRun.child.kill('SIGTERM');
      const signalResult = await signalRun.result;
      assert.equal(signalResult.signal, 'SIGTERM', signalResult.output);
      assert.equal(signalResult.code, null, signalResult.output);
      assert.match(signalResult.output, /required SIGKILL/);
      await assertCleanedUp(signalCapture);
    });
  });
}

type Capture = {
  address: string;
  bundlePath: string;
  cwd: string;
  processGroupId: number;
  grandchildPid?: number;
};

type ChildResult = {
  code: number | null;
  signal: NodeJS.Signals | null;
  output: string;
};

async function withMarkerDirectory(run: (directory: string) => Promise<void>): Promise<void> {
  const markerDirectory = await mkdtemp(join(tmpdir(), 'kosmo-temporal-wrapper-test-'));
  try {
    await run(markerDirectory);
  } finally {
    await rm(markerDirectory, { force: true, recursive: true });
  }
}

function startWrapper(
  probeArgs: string[],
  env: NodeJS.ProcessEnv = { ...process.env },
  clearInheritedRuntime = true,
): { child: ReturnType<typeof spawn>; result: Promise<ChildResult> } {
  const command = [process.execPath, '--import', tsxLoaderPath, probePath, ...probeArgs];
  const childEnvironment = { ...env };
  if (clearInheritedRuntime) {
    delete childEnvironment[temporalAddressKey];
    delete childEnvironment[workflowBundlePathKey];
  }
  const child = spawn(
    process.execPath,
    ['--import', tsxLoaderPath, wrapperPath, '--', ...command],
    {
      cwd: repositoryRoot,
      env: childEnvironment,
      stdio: ['ignore', 'pipe', 'pipe'],
    },
  );
  const output: string[] = [];
  child.stdout?.on('data', (chunk: Buffer) => output.push(chunk.toString()));
  child.stderr?.on('data', (chunk: Buffer) => output.push(chunk.toString()));

  const result = new Promise<ChildResult>((resolvePromise, reject) => {
    child.once('error', reject);
    child.once('close', (code, signal) => {
      resolvePromise({ code, signal, output: output.join('') });
    });
  });
  return { child, result };
}

async function runWrapper(
  probeArgs: string[],
  env: NodeJS.ProcessEnv = { ...process.env },
  clearInheritedRuntime = true,
): Promise<ChildResult> {
  return startWrapper(probeArgs, env, clearInheritedRuntime).result;
}

async function waitForCapture(
  markerPath: string,
  child: ReturnType<typeof spawn>,
): Promise<Capture> {
  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline) {
    try {
      return await readCapture(markerPath);
    } catch {
      if (child.exitCode !== null || child.signalCode !== null) {
        throw new Error(`Temporal wrapper exited before writing ${markerPath}.`);
      }
      await new Promise((resolvePromise) => setTimeout(resolvePromise, 25));
    }
  }
  const closed = once(child, 'close');
  child.kill('SIGTERM');
  const closeResult = await Promise.race([
    closed.then(() => true),
    new Promise<boolean>((resolvePromise) => setTimeout(() => resolvePromise(false), 40_000)),
  ]);
  if (!closeResult) {
    child.kill('SIGKILL');
    await closed;
  }
  throw new Error(`Timed out waiting for Temporal wrapper to write ${markerPath}.`);
}

async function readCapture(path: string): Promise<Capture> {
  return JSON.parse(await readFile(path, 'utf8')) as Capture;
}

async function assertCleanedUp(capture: Capture): Promise<void> {
  assert.ok(capture.address);
  assert.ok(capture.bundlePath);
  assert.equal(capture.cwd, repositoryRoot);
  assert.ok(capture.processGroupId > 0);
  await assert.rejects(access(capture.bundlePath));
  await waitForProcessGroupUnavailable(capture.processGroupId);
  await waitForTemporalServerUnavailable(capture.address);
}

async function waitForProcessGroupUnavailable(processGroupId: number): Promise<void> {
  const deadline = Date.now() + 5_000;
  while (Date.now() < deadline) {
    try {
      process.kill(-processGroupId, 0);
    } catch (error) {
      if (error instanceof Error && 'code' in error && error.code === 'ESRCH') {
        return;
      }
      throw error;
    }
    await new Promise((resolvePromise) => setTimeout(resolvePromise, 50));
  }
  assert.fail(`Process group ${processGroupId} remained alive after wrapper exit.`);
}

async function assertTemporalServerAvailable(address: string): Promise<void> {
  const connection = await Connection.connect({ address, connectTimeout: 5_000 });
  try {
    await connection.workflowService.getSystemInfo({});
  } finally {
    await connection.close();
  }
}

async function waitForTemporalServerUnavailable(address: string): Promise<void> {
  const match = /^(?:\[([^\]]+)\]|([^:]+)):(\d+)$/.exec(address);
  assert.ok(match, `Unexpected Temporal address: ${address}`);
  const host = match[1] ?? match[2];
  const port = Number(match[3]);
  const deadline = Date.now() + 5_000;
  while (Date.now() < deadline) {
    if (!(await canConnect(host, port))) {
      return;
    }
    await new Promise((resolvePromise) => setTimeout(resolvePromise, 50));
  }
  assert.fail(`Temporal server at ${address} remained reachable after wrapper exit.`);
}

async function canConnect(host: string, port: number): Promise<boolean> {
  return new Promise((resolvePromise) => {
    const socket = createConnection({ host, port });
    const timeout = setTimeout(() => {
      socket.destroy();
      resolvePromise(false);
    }, 500);
    socket.once('connect', () => {
      clearTimeout(timeout);
      socket.destroy();
      resolvePromise(true);
    });
    socket.once('error', () => {
      clearTimeout(timeout);
      resolvePromise(false);
    });
  });
}
