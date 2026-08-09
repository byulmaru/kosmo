import assert from 'node:assert/strict';
import { test } from 'node:test';
import { NO_WORKER_REGISTRATION_MESSAGE, runWorkerApplication } from './application';
import type { WorkerApplicationDependencies } from './application';
import type { HealthServer } from './health';
import type { WorkerRegistration } from './registration';
import type { TemporalWorkerHandle, WorkerEnvironment } from './runtime';

const environment: WorkerEnvironment = {
  healthHost: '127.0.0.1',
  healthPort: 8080,
  temporalAddress: 'temporal.test:7233',
  temporalNamespace: 'kosmo-test',
};

test('registration이 없으면 dependency를 호출하기 전에 실패한다', async () => {
  let dependencyCalled = false;
  const unavailable = () => {
    dependencyCalled = true;
    throw new Error('must not be called');
  };

  await assert.rejects(
    runWorkerApplication(undefined, {
      createHealthServer: unavailable,
      createTemporalWorker: unavailable,
      onSignal: unavailable,
      readEnvironment: unavailable,
    }),
    new Error(NO_WORKER_REGISTRATION_MESSAGE),
  );
  assert.equal(dependencyCalled, false);
});

test('handler가 없는 예약 task queue도 dependency 호출 전에 거부한다', async () => {
  let dependencyCalled = false;
  const unavailable = () => {
    dependencyCalled = true;
    throw new Error('must not be called');
  };

  await assert.rejects(
    runWorkerApplication(
      { taskQueue: 'reserved-but-empty' },
      {
        createHealthServer: unavailable,
        createTemporalWorker: unavailable,
        onSignal: unavailable,
        readEnvironment: unavailable,
      },
    ),
    new Error(NO_WORKER_REGISTRATION_MESSAGE),
  );
  assert.equal(dependencyCalled, false);
});

test('RUNNING 뒤 ready가 되고 SIGTERM에서 ready를 내린 뒤 종료한다', async () => {
  let resolveRun!: () => void;
  let state: ReturnType<TemporalWorkerHandle['getState']> = 'INITIALIZED';
  let signalHandler: (() => void) | undefined;
  let shutdownCount = 0;
  let closeCount = 0;
  let healthCloseCount = 0;
  const readiness: boolean[] = [];

  const worker: TemporalWorkerHandle = {
    async close() {
      closeCount += 1;
    },
    getState: () => state,
    run() {
      state = 'RUNNING';
      return new Promise<void>((resolve) => {
        resolveRun = resolve;
      });
    },
    shutdown() {
      shutdownCount += 1;
      state = 'STOPPING';
      resolveRun();
    },
  };
  const healthServer: HealthServer = {
    async close() {
      healthCloseCount += 1;
    },
    port: environment.healthPort,
    setReady(ready) {
      readiness.push(ready);
    },
  };
  const dependencies: WorkerApplicationDependencies = {
    createHealthServer: async () => healthServer,
    createTemporalWorker: async () => worker,
    onSignal(handler) {
      signalHandler = handler;
      return () => {
        signalHandler = undefined;
      };
    },
    readEnvironment: () => environment,
  };
  const registration: WorkerRegistration = {
    activities: { example: () => undefined },
    taskQueue: 'test',
  };

  const running = runWorkerApplication(registration, dependencies);
  await new Promise<void>((resolve) => setImmediate(resolve));

  assert.deepEqual(readiness, [true]);
  assert.ok(signalHandler);
  signalHandler();
  await running;

  assert.equal(shutdownCount, 1);
  assert.equal(closeCount, 1);
  assert.equal(healthCloseCount, 1);
  assert.deepEqual(readiness, [true, false, false]);
  assert.equal(signalHandler, undefined);
});

test('RUNNING 상태에 진입하지 않으면 ready를 올리지 않는다', async () => {
  const readiness: boolean[] = [];
  const dependencies: WorkerApplicationDependencies = {
    createHealthServer: async () => ({
      close: async () => undefined,
      port: environment.healthPort,
      setReady: (ready) => readiness.push(ready),
    }),
    createTemporalWorker: async () => ({
      close: async () => undefined,
      getState: () => 'INITIALIZED',
      run: async () => undefined,
      shutdown: () => undefined,
    }),
    onSignal: () => () => undefined,
    readEnvironment: () => environment,
  };

  await assert.rejects(
    runWorkerApplication(
      { activities: { example: () => undefined }, taskQueue: 'test' },
      dependencies,
    ),
    /did not enter RUNNING/,
  );
  assert.deepEqual(readiness, [false]);
});
