import { spawn } from 'node:child_process';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { TestWorkflowEnvironment } from '@temporalio/testing';
import { bundleWorkflowCode } from '@temporalio/worker';
import { temporalTestExecutable } from './temporal-test-executable.js';
import { POST_REQUEST_TEST_SEARCH_ATTRIBUTES } from './temporal-test-search-attributes.js';

const workerDirectory = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const repositoryRoot = resolve(workerDirectory, '../..');
const workflowsPath = fileURLToPath(new URL('./workflows/index.ts', import.meta.url));
const temporalAddressKey = 'KOSMO_TEST_TEMPORAL_ADDRESS';
const workflowBundlePathKey = 'KOSMO_TEST_WORKFLOW_BUNDLE_PATH';

let child: ReturnType<typeof spawn> | undefined;
let requestedSignal: NodeJS.Signals | undefined;
let forceKillTimer: NodeJS.Timeout | undefined;
let signalForwardError: Error | undefined;
let signalForwardedChildPid: number | undefined;

const onSigint = () => forwardSignal('SIGINT');
const onSigterm = () => forwardSignal('SIGTERM');

function forwardSignal(signal: NodeJS.Signals): void {
  requestedSignal ??= signal;
  forwardSignalToChild();
}

const shutdownTimeoutMs = 30_000;
const forcedShutdownTimeoutMs = 5_000;
let forcedCommandGroupKill = false;

function applyChildResult(result: ChildResult): void {
  if (result.error) {
    console.error(result.error);
  }
  if (requestedSignal) {
    return;
  }
  if (result.signal) {
    process.kill(process.pid, result.signal);
  } else {
    process.exitCode = result.code === 0 && result.error ? 1 : (result.code ?? 1);
  }
}

type ChildResult = {
  code: number | null;
  signal: NodeJS.Signals | null;
  error?: Error;
};

function runCommand(command: string[], env: NodeJS.ProcessEnv): Promise<ChildResult> {
  return new Promise((resolvePromise) => {
    let spawnError: Error | undefined;
    try {
      child = spawn(command[0], command.slice(1), {
        cwd: repositoryRoot,
        detached: process.platform !== 'win32',
        env,
        stdio: 'inherit',
      });
    } catch (error) {
      resolvePromise({
        code: null,
        signal: null,
        error: error instanceof Error ? error : new Error(String(error)),
      });
      return;
    }

    child.once('error', (error) => {
      spawnError = error;
    });
    const commandChild = child;
    let signalForwarded = false;
    const forwardPendingSignal = () => {
      if (!signalForwarded && requestedSignal && commandChild.pid) {
        signalForwarded = true;
        beginChildShutdown(commandChild.pid, requestedSignal, commandChild);
      }
    };
    child.once('close', async (code, signal) => {
      const closedChild = commandChild;
      if (forceKillTimer) {
        clearTimeout(forceKillTimer);
        forceKillTimer = undefined;
      }

      let cleanupError: Error | undefined;
      try {
        if (await stopProcessGroup(closedChild?.pid, 'Temporal test command', closedChild)) {
          cleanupError = new Error(
            'Temporal test command process group required SIGKILL after its shutdown grace period.',
          );
        }
        if (forcedCommandGroupKill) {
          cleanupError = new Error(
            'Temporal test command process group required SIGKILL after its shutdown grace period.',
          );
        }
      } catch (error) {
        cleanupError = error instanceof Error ? error : new Error(String(error));
      }
      if (signalForwardError) {
        cleanupError = combineErrors(
          cleanupError,
          signalForwardError instanceof Error
            ? signalForwardError
            : new Error(String(signalForwardError)),
        );
        signalForwardError = undefined;
      }
      child = undefined;
      forcedCommandGroupKill = false;
      signalForwardedChildPid = undefined;
      resolvePromise({
        code,
        signal,
        error: combineErrors(spawnError, cleanupError),
      });
    });
    child.once('spawn', forwardPendingSignal);
    forwardPendingSignal();
  });
}

async function run(): Promise<void> {
  const command = process.argv.slice(2);
  if (command[0] === '--') {
    command.shift();
  }
  if (command.length === 0) {
    console.error('Usage: pnpm test:temporal -- <command> [args...]');
    process.exitCode = 2;
    return;
  }

  const inheritedAddress = process.env[temporalAddressKey]?.trim();
  const inheritedBundlePath = process.env[workflowBundlePathKey]?.trim();
  if (Boolean(inheritedAddress) !== Boolean(inheritedBundlePath)) {
    throw new Error(
      `${temporalAddressKey} and ${workflowBundlePathKey} must be inherited together.`,
    );
  }

  process.once('SIGINT', onSigint);
  process.once('SIGTERM', onSigterm);

  let result: ChildResult | undefined;
  let testEnvironment: TestWorkflowEnvironment | undefined;
  let bundleDirectory: string | undefined;
  let startupError: unknown;
  let cleanupError: unknown;

  try {
    if (inheritedAddress && inheritedBundlePath) {
      result = await runCommand(command, { ...process.env });
    } else {
      bundleDirectory = await mkdtemp(join(tmpdir(), 'kosmo-temporal-test-'));
      const bundlePath = join(bundleDirectory, 'workflows.js');
      const workflowBundle = await bundleWorkflowCode({ workflowsPath });
      await writeFile(bundlePath, workflowBundle.code, { mode: 0o600 });

      if (!requestedSignal) {
        testEnvironment = await TestWorkflowEnvironment.createLocal({
          server: {
            executable: temporalTestExecutable,
            ip: '127.0.0.1',
            namespace: process.env.TEMPORAL_NAMESPACE?.trim() || 'test',
            searchAttributes: [...POST_REQUEST_TEST_SEARCH_ATTRIBUTES],
            ui: false,
          },
        });
      }

      if (!requestedSignal && testEnvironment) {
        result = await runCommand(command, {
          ...process.env,
          [temporalAddressKey]: testEnvironment.address,
          [workflowBundlePathKey]: bundlePath,
        });
      }
    }
  } catch (error) {
    startupError = error;
  } finally {
    try {
      await testEnvironment?.teardown();
    } catch (error) {
      cleanupError = error;
    }

    if (bundleDirectory) {
      try {
        await rm(bundleDirectory, { force: true, recursive: true });
      } catch (error) {
        cleanupError = cleanupError
          ? new AggregateError([cleanupError, error], 'Temporal wrapper cleanup failed.')
          : error;
      }
    }

    process.off('SIGINT', onSigint);
    process.off('SIGTERM', onSigterm);
    if (forceKillTimer) {
      clearTimeout(forceKillTimer);
      forceKillTimer = undefined;
    }
  }

  if (startupError) {
    console.error(startupError);
  }
  if (cleanupError) {
    console.error(cleanupError);
  }

  if (requestedSignal) {
    if (result?.error) {
      console.error(result.error);
    }
    process.kill(process.pid, requestedSignal);
  }
  if (startupError || cleanupError) {
    process.exitCode = 1;
    return;
  }
  if (result) {
    applyChildResult(result);
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  void run().catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  });
}

function combineErrors(first: Error | undefined, second: Error | undefined): Error | undefined {
  if (first && second) {
    return new AggregateError([first, second], 'Temporal test command and process cleanup failed.');
  }
  return first ?? second;
}

function forwardSignalToChild(): void {
  if (child?.pid && requestedSignal) {
    beginChildShutdown(child.pid, requestedSignal, child);
  }
}

function beginChildShutdown(
  processId: number,
  signal: NodeJS.Signals,
  directChild: ReturnType<typeof spawn>,
): void {
  if (signalForwardedChildPid === processId) {
    return;
  }
  signalForwardedChildPid = processId;
  try {
    signalProcessGroup(processId, signal, directChild);
  } catch (error) {
    signalForwardError = error instanceof Error ? error : new Error(String(error));
  }
  forceKillTimer ??= setTimeout(() => {
    try {
      if (processGroupExists(processId)) {
        signalProcessGroup(processId, 'SIGKILL', directChild);
        forcedCommandGroupKill = true;
      }
    } catch (error) {
      signalForwardError = combineErrors(
        signalForwardError,
        error instanceof Error ? error : new Error(String(error)),
      );
    }
  }, shutdownTimeoutMs);
}

function signalProcessGroup(
  processId: number,
  signal: NodeJS.Signals,
  directChild: ReturnType<typeof spawn> | undefined,
): void {
  try {
    if (process.platform === 'win32') {
      directChild?.kill(signal);
    } else {
      process.kill(-processId, signal);
    }
  } catch (error) {
    if (!(error instanceof Error) || !('code' in error) || error.code !== 'ESRCH') {
      throw error;
    }
  }
}

function processGroupExists(processId: number | undefined): boolean {
  if (!processId) {
    return false;
  }
  if (process.platform === 'win32') {
    return child?.pid === processId && child.exitCode === null && child.signalCode === null;
  }
  try {
    process.kill(-processId, 0);
    return true;
  } catch (error) {
    if (error instanceof Error && 'code' in error && error.code === 'ESRCH') {
      return false;
    }
    if (error instanceof Error && 'code' in error && error.code === 'EPERM') {
      return true;
    }
    throw error;
  }
}

async function stopProcessGroup(
  processId: number | undefined,
  label: string,
  directChild: ReturnType<typeof spawn> | undefined,
): Promise<boolean> {
  if (!processId || !processGroupExists(processId)) {
    return false;
  }

  signalProcessGroup(processId, 'SIGTERM', directChild);
  if (await waitForProcessGroupExit(processId, shutdownTimeoutMs)) {
    return false;
  }

  signalProcessGroup(processId, 'SIGKILL', directChild);
  if (!(await waitForProcessGroupExit(processId, forcedShutdownTimeoutMs))) {
    throw new Error(`${label} did not exit after SIGTERM or SIGKILL.`);
  }
  return true;
}

async function waitForProcessGroupExit(processId: number, timeoutMs: number): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;
  while (processGroupExists(processId) && Date.now() < deadline) {
    await new Promise((resolvePromise) => setTimeout(resolvePromise, 50));
  }
  return !processGroupExists(processId);
}
