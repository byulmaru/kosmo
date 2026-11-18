import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { once } from 'node:events';
import { fileURLToPath } from 'node:url';
import type { ChildProcess } from 'node:child_process';

const rootDirectory = fileURLToPath(new URL('../../../', import.meta.url));
const workerDirectory = `${rootDirectory}/apps/worker`;
const defaultDatabaseUrl = 'postgres://kosmo:kosmo@localhost:54329/kosmo_test';
const startupTimeoutMs = 120_000;
const shutdownTimeoutMs = 30_000;
const forcedShutdownTimeoutMs = 5_000;

let runtimePromise: Promise<void> | undefined;
let stopPromise: Promise<void> | undefined;
let worker: ChildProcess | undefined;
let server: ChildProcess | undefined;
let stopping = false;
let shutdownSignal: NodeJS.Signals | undefined;
let onSigint: (() => void) | undefined;
let onSigterm: (() => void) | undefined;
let onBeforeExit: (() => void) | undefined;

/**
 * Start the same Temporal CLI server and production Worker entrypoint used by
 * Web E2E. This is intentionally a test-only composition helper: the Core,
 * API, and Fedify test processes keep their real Temporal client and only
 * replace unrelated post-commit `workflow.start` calls with their existing
 * no-op test seam.
 */
export const startTestTemporalRuntime = async (): Promise<void> => {
  runtimePromise ??= startRuntime();
  return runtimePromise;
};

export const stopTestTemporalRuntime = async (): Promise<void> => {
  stopPromise ??= stopRuntime();
  return stopPromise;
};

async function startRuntime(): Promise<void> {
  const host = '127.0.0.1';
  const sharedTemporalAddress = process.env.KOSMO_TEST_TEMPORAL_ADDRESS?.trim();
  const namespace = sharedTemporalAddress
    ? `kosmo-test-${randomUUID()}`
    : process.env.TEMPORAL_NAMESPACE?.trim() || 'test';
  const databaseUrl = process.env.DATABASE_URL ?? defaultDatabaseUrl;
  const workerEnvironment: NodeJS.ProcessEnv = {
    ...process.env,
    DATABASE_URL: databaseUrl,
    // Keep the Worker and Core Activities on the disposable test database even
    // when the parent shell has a development Fedify queue URL configured.
    FEDIFY_QUEUE_DATABASE_URL: databaseUrl,
    HOST: host,
    NODE_ENV: process.env.NODE_ENV ?? 'test',
    PORT: '0',
    PUBLIC_ORIGIN: process.env.PUBLIC_ORIGIN ?? 'http://127.0.0.1:4173',
    TEMPORAL_NAMESPACE: namespace,
  };
  server = spawn(process.execPath, ['--import', 'tsx', 'src/temporal-test-server.ts'], {
    cwd: workerDirectory,
    env: {
      ...workerEnvironment,
      TEMPORAL_PORT: undefined,
    },
    // Keep startup failures visible in CI and avoid keeping the parent alive
    // with a long-lived stderr pipe after the children are unref'ed.
    stdio: ['ignore', 'ignore', 'inherit', 'ipc'],
  });
  installShutdownHandlers();

  try {
    const healthPort = await waitForChildPort(server, startupTimeoutMs);
    workerEnvironment.TEMPORAL_ADDRESS = await waitForChildHealth(
      `http://${host}:${healthPort}/health`,
      server,
      startupTimeoutMs,
    );
    if (stopping) {
      throw new Error('Temporal test runtime stopped during startup.');
    }
    worker = spawn(process.execPath, ['--import', 'tsx', 'src/index.ts'], {
      cwd: workerDirectory,
      env: workerEnvironment,
      stdio: ['ignore', 'ignore', 'inherit', 'ipc'],
    });
    const workerPort = await waitForChildPort(worker, startupTimeoutMs);
    await waitForChildHealth(`http://${host}:${workerPort}/ready`, worker, startupTimeoutMs);
  } catch (error) {
    try {
      await stopTestTemporalRuntime();
    } catch (cleanupError) {
      throw new AggregateError(
        [error, cleanupError],
        'Temporal test runtime startup and cleanup failed.',
      );
    }
    throw error;
  }

  process.env.TEMPORAL_ADDRESS = workerEnvironment.TEMPORAL_ADDRESS;
  process.env.TEMPORAL_NAMESPACE = namespace;

  // The beforeExit hook performs awaited cleanup; the exit hook below is a last resort.
  server.unref();
  worker.unref();
}

async function stopRuntime(): Promise<void> {
  stopping = true;
  const cleanupErrors: unknown[] = [];
  try {
    for (const [child, label] of [
      [worker, 'Temporal test Worker'],
      [server, 'Temporal test server helper'],
    ] as const) {
      try {
        await stopChild(child, label);
      } catch (error) {
        cleanupErrors.push(error);
      }
    }
  } finally {
    if (!worker || worker.exitCode !== null || worker.signalCode !== null) {
      worker = undefined;
    }
    if (!server || server.exitCode !== null || server.signalCode !== null) {
      server = undefined;
    }
    if (!worker && !server) {
      if (onSigint) {
        process.off('SIGINT', onSigint);
      }
      if (onSigterm) {
        process.off('SIGTERM', onSigterm);
      }
      if (onBeforeExit) {
        process.off('beforeExit', onBeforeExit);
      }
      process.off('exit', emergencyTerminateChildren);
    }
  }
  if (cleanupErrors.length > 0) {
    throw new AggregateError(cleanupErrors, 'Temporal test runtime cleanup failed.');
  }
}

function installShutdownHandlers(): void {
  const onSignal = (signal: NodeJS.Signals) => {
    if (shutdownSignal) {
      return;
    }
    shutdownSignal = signal;
    if (onSigint) {
      process.off('SIGINT', onSigint);
    }
    if (onSigterm) {
      process.off('SIGTERM', onSigterm);
    }
    void stopTestTemporalRuntime()
      .catch((error: unknown) => {
        console.error(error);
        process.exitCode = 1;
      })
      .finally(() => {
        process.kill(process.pid, shutdownSignal ?? signal);
      });
  };
  onSigint = () => onSignal('SIGINT');
  onSigterm = () => onSignal('SIGTERM');
  onBeforeExit = () => {
    void stopTestTemporalRuntime().catch((error: unknown) => {
      console.error(error);
      process.exitCode = 1;
    });
  };

  process.once('SIGINT', onSigint);
  process.once('SIGTERM', onSigterm);
  process.once('beforeExit', onBeforeExit);
  process.once('exit', emergencyTerminateChildren);
}

function emergencyTerminateChildren(): void {
  terminate(worker);
  terminate(server);
}

async function stopChild(child: ChildProcess | undefined, label: string): Promise<void> {
  if (!child || child.exitCode !== null || child.signalCode !== null) {
    return;
  }

  child.ref();
  child.kill('SIGTERM');
  const exitedDuringGrace = await waitForChildExit(child, shutdownTimeoutMs);
  const exitCodeAfterGrace = child.exitCode;
  const signalCodeAfterGrace = child.signalCode;
  if (exitedDuringGrace || exitCodeAfterGrace !== null || signalCodeAfterGrace !== null) {
    return;
  }

  const forcedShutdownRequested = child.kill('SIGKILL');
  const exitedAfterForce = await waitForChildExit(child, forcedShutdownTimeoutMs);
  const exitCodeAfterForce = child.exitCode;
  const signalCodeAfterForce = child.signalCode;
  if (!exitedAfterForce && exitCodeAfterForce === null && signalCodeAfterForce === null) {
    throw new Error(`${label} did not exit after SIGTERM or SIGKILL (${formatChildExit(child)}).`);
  }
  if (signalCodeAfterForce === 'SIGKILL') {
    throw new Error(`${label} exceeded its shutdown grace period and required SIGKILL.`);
  }
  if (forcedShutdownRequested) {
    throw new Error(
      `${label} exceeded its shutdown grace period before exiting (${formatChildExit(child)}).`,
    );
  }
}

async function waitForChildExit(child: ChildProcess, timeoutMs: number): Promise<boolean> {
  if (child.exitCode !== null || child.signalCode !== null) {
    return true;
  }

  const controller = new AbortController();
  let timeout: NodeJS.Timeout | undefined;
  try {
    return await Promise.race([
      once(child, 'exit', { signal: controller.signal }).then(() => true),
      new Promise<boolean>((resolve) => {
        timeout = setTimeout(() => resolve(false), timeoutMs);
      }),
    ]);
  } finally {
    if (timeout) {
      clearTimeout(timeout);
    }
    controller.abort();
  }
}

async function waitForHealth(url: string, child: ChildProcess, timeoutMs: number): Promise<string> {
  const deadline = Date.now() + timeoutMs;
  let lastError: unknown;

  while (Date.now() < deadline) {
    if (child.exitCode !== null || child.signalCode !== null) {
      throw new Error(
        `Temporal test process exited before becoming ready: ${url} (${formatChildExit(child)})`,
      );
    }

    try {
      const response = await fetch(url);
      if (response.ok) {
        return (await response.text()).trim();
      }
      lastError = new Error(`HTTP ${response.status}`);
    } catch (error) {
      lastError = error;
    }

    await new Promise((resolve) => setTimeout(resolve, 100));
  }

  throw new Error(
    `Timed out waiting for Temporal test process at ${url}: ${
      lastError instanceof Error ? lastError.message : String(lastError)
    } (${formatChildExit(child)})`,
  );
}

async function waitForChildPort(child: ChildProcess, timeoutMs: number): Promise<number> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const message = await Promise.race([
      once(child, 'message', { signal: controller.signal }).then(([value]) => value),
      once(child, 'exit', { signal: controller.signal }).then(() => {
        throw new Error(`Child process exited before binding a port (${formatChildExit(child)})`);
      }),
    ]);
    if (
      typeof message !== 'number' ||
      !Number.isInteger(message) ||
      message < 1 ||
      message > 65_535
    ) {
      throw new Error(`Child process sent an invalid listening port (${formatChildExit(child)})`);
    }
    return message;
  } catch (error) {
    if (controller.signal.aborted) {
      throw new Error(
        `Timed out waiting for child process to bind a port (${formatChildExit(child)})`,
        { cause: error },
      );
    }
    throw error;
  } finally {
    clearTimeout(timeout);
    controller.abort();
    if (child.connected) {
      child.disconnect();
    }
  }
}

async function waitForChildHealth(
  url: string,
  child: ChildProcess,
  timeoutMs: number,
): Promise<string> {
  return Promise.race([
    waitForHealth(url, child, timeoutMs),
    new Promise<never>((_, reject) => {
      child.once('error', (error) => {
        reject(
          new Error(
            `Unable to start Temporal test process at ${url}: ${
              error instanceof Error ? error.message : String(error)
            } (${formatChildExit(child)})`,
            { cause: error },
          ),
        );
      });
    }),
  ]);
}

function formatChildExit(child: ChildProcess): string {
  return `exitCode=${child.exitCode ?? 'null'}, signal=${child.signalCode ?? 'null'}`;
}

function terminate(child: ChildProcess | undefined): void {
  if (child && child.exitCode === null && child.signalCode === null) {
    child.kill('SIGTERM');
  }
}
