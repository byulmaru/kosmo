import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { fileURLToPath } from 'node:url';
import type { ChildProcess } from 'node:child_process';

const rootDirectory = fileURLToPath(new URL('../../../', import.meta.url));
const workerDirectory = `${rootDirectory}/apps/worker`;
const defaultDatabaseUrl = 'postgres://kosmo:kosmo@localhost:54329/kosmo_test';
const startupTimeoutMs = 120_000;

let runtimePromise: Promise<void> | undefined;

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

async function startRuntime(): Promise<void> {
  const host = '127.0.0.1';
  const namespace = process.env.TEMPORAL_NAMESPACE?.trim() || 'test';
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
  const server = spawn(process.execPath, ['--import', 'tsx', 'src/temporal-test-server.ts'], {
    cwd: workerDirectory,
    env: {
      ...workerEnvironment,
      TEMPORAL_PORT: undefined,
    },
    // Keep startup failures visible in CI and avoid keeping the parent alive
    // with a long-lived stderr pipe after the children are unref'ed.
    stdio: ['ignore', 'ignore', 'inherit', 'ipc'],
  });
  let worker: ChildProcess | undefined;

  try {
    const healthPort = await waitForChildPort(server, startupTimeoutMs);
    workerEnvironment.TEMPORAL_ADDRESS = await waitForChildHealth(
      `http://${host}:${healthPort}/health`,
      server,
      startupTimeoutMs,
    );
    worker = spawn(process.execPath, ['--import', 'tsx', 'src/index.ts'], {
      cwd: workerDirectory,
      env: workerEnvironment,
      stdio: ['ignore', 'ignore', 'inherit', 'ipc'],
    });
    const workerPort = await waitForChildPort(worker, startupTimeoutMs);
    await waitForChildHealth(`http://${host}:${workerPort}/ready`, worker, startupTimeoutMs);
  } catch (error) {
    terminate(server);
    if (worker) {
      terminate(worker);
    }
    throw error;
  }

  process.env.TEMPORAL_ADDRESS = workerEnvironment.TEMPORAL_ADDRESS;
  process.env.TEMPORAL_NAMESPACE = namespace;

  // Keep the test process from being held open by child handles. The exit
  // hook still sends SIGTERM so normal test completion tears both services
  // down; the child entrypoints perform their own async cleanup.
  server.unref();
  worker.unref();
  const terminateChildren = () => {
    terminate(worker);
    terminate(server);
  };
  process.once('exit', terminateChildren);
  process.once('SIGINT', () => {
    terminateChildren();
    process.exit(130);
  });
  process.once('SIGTERM', () => {
    terminateChildren();
    process.exit(143);
  });
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

function terminate(child: ChildProcess): void {
  if (child.exitCode === null && child.signalCode === null) {
    child.kill('SIGTERM');
  }
}
