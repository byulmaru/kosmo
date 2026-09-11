import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import test, { mock } from 'node:test';
import { setImmediate } from 'node:timers/promises';
import {
  ActivityFailure,
  ApplicationFailure,
  CancelledFailure,
  ServiceError,
  TimeoutFailure,
  WorkflowFailedError,
} from '@temporalio/client';
import type { WorkflowHandleWithStartDetails } from '@temporalio/client';
import type { WorkflowDefinition } from './client';
import type { RemoteProfileLookupInput } from './remote-profile';

process.env.TEMPORAL_ADDRESS ??= '127.0.0.1:7233';
process.env.TEMPORAL_NAMESPACE ??= 'test';

const { runWorkflow, temporalClient } = await import('./client');
const { remoteProfileLookupWorkflow } = await import('./remote-profile');

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

test('execute mode는 실제 args로 ID callback을 한 번 호출하고 완료된 native result를 반환한다', async () => {
  type TwoArgumentWorkflow = (
    profileId: string,
    refresh: boolean,
  ) => Promise<{ profileId: string; refresh: boolean }>;
  const callbackArguments: Array<readonly [string, boolean]> = [];
  const workflowIdFromArgs = (profileId: string, refresh: boolean) => {
    callbackArguments.push([profileId, refresh]);
    return 'opaque-execute-id';
  };
  const definition: WorkflowDefinition<TwoArgumentWorkflow> = {
    workflow: 'profileWorkflow',
    workflowIdFromArgs,
  };
  let releaseExecution!: () => void;
  const executionReleased = new Promise<void>((resolve) => {
    releaseExecution = resolve;
  });
  let signalExecuteCall!: () => void;
  const executeCall = new Promise<void>((resolve) => {
    signalExecuteCall = resolve;
  });
  const execute = mock.method(temporalClient.workflow, 'execute', async () => {
    signalExecuteCall();
    await executionReleased;
    return { profileId: 'profile-1', refresh: true } as never;
  });
  const deadline = mock.method(
    temporalClient,
    'withDeadline',
    async (_deadline: number | Date, callback: () => Promise<unknown>) => callback(),
  );
  const retry = { maximumAttempts: 3 };

  const callerResult = runWorkflow(definition, {
    args: ['profile-1', true],
    mode: 'execute',
    workflowIdConflictPolicy: 'USE_EXISTING',
    workflowIdReusePolicy: 'ALLOW_DUPLICATE',
    retry,
  });
  let callerSettled = false;
  void callerResult.then(
    () => {
      callerSettled = true;
    },
    () => {
      callerSettled = true;
    },
  );

  try {
    await executeCall;
    await setImmediate();
    assert.equal(callerSettled, false);
    releaseExecution();

    const result: { profileId: string; refresh: boolean } = await callerResult;
    assert.deepEqual(result, { profileId: 'profile-1', refresh: true });
    assert.deepEqual(callbackArguments, [['profile-1', true]]);

    const call = execute.mock.calls[0];
    assert.ok(call);
    assert.equal(call.arguments[0], 'profileWorkflow');
    const options = call.arguments[1];
    assert.ok(options);
    assert.equal(options.workflowId, 'opaque-execute-id');
    assert.deepEqual(options.args, ['profile-1', true]);
    assert.equal(options.taskQueue, 'kosmo');
    assert.equal(options.workflowIdConflictPolicy, 'USE_EXISTING');
    assert.equal(options.workflowIdReusePolicy, 'ALLOW_DUPLICATE');
    assert.deepEqual(options.retry, retry);
    assert.equal('workflowIdFromArgs' in options, false);
    assert.equal('mode' in options, false);
    assert.equal('workflow' in options, false);
    assert.equal(execute.mock.calls.length, 1);
    assert.equal(deadline.mock.calls.length, 1);
  } finally {
    releaseExecution();
    deadline.mock.restore();
    execute.mock.restore();
  }
});

test('start mode는 zero-args callback을 호출하고 start acknowledgement 뒤 native handle을 반환한다', async () => {
  type ZeroArgumentWorkflow = () => Promise<{ started: true }>;
  let callbackCallCount = 0;
  let callbackArguments: unknown[] | undefined;
  const workflowIdFromArgs = (...args: Parameters<ZeroArgumentWorkflow>) => {
    callbackCallCount += 1;
    callbackArguments = args;
    return 'opaque-start-id';
  };
  const definition: WorkflowDefinition<ZeroArgumentWorkflow> = {
    workflow: 'zeroArgumentWorkflow',
    workflowIdFromArgs,
  };
  let releaseStart!: () => void;
  const startReleased = new Promise<void>((resolve) => {
    releaseStart = resolve;
  });
  let signalStartCall!: () => void;
  const startCall = new Promise<void>((resolve) => {
    signalStartCall = resolve;
  });
  let resultCalled = false;
  const handle = {
    workflowId: 'opaque-start-id',
    firstExecutionRunId: 'run-1',
    result: async () => {
      resultCalled = true;
      throw new Error('start mode must not wait for the Workflow result');
    },
  } as never;
  const start = mock.method(temporalClient.workflow, 'start', async () => {
    signalStartCall();
    await startReleased;
    return handle;
  });
  const deadline = mock.method(
    temporalClient,
    'withDeadline',
    async (_deadline: number | Date, callback: () => Promise<unknown>) => callback(),
  );

  const callerResult = runWorkflow(definition, {
    mode: 'start',
  });
  let callerSettled = false;
  void callerResult.then(
    () => {
      callerSettled = true;
    },
    () => {
      callerSettled = true;
    },
  );

  try {
    await startCall;
    await setImmediate();
    assert.equal(callerSettled, false);
    releaseStart();

    const startedHandle: WorkflowHandleWithStartDetails<ZeroArgumentWorkflow> = await callerResult;
    assert.equal(startedHandle, handle);
    assert.equal(callbackCallCount, 1);
    assert.deepEqual(callbackArguments, []);
    assert.equal(resultCalled, false);

    const call = start.mock.calls[0];
    assert.ok(call);
    assert.equal(call.arguments[0], 'zeroArgumentWorkflow');
    const options = call.arguments[1];
    assert.ok(options);
    assert.equal(options.workflowId, 'opaque-start-id');
    assert.equal(options.args, undefined);
    assert.equal(options.taskQueue, 'kosmo');
    assert.equal('workflowIdFromArgs' in options, false);
    assert.equal('mode' in options, false);
    assert.equal('workflow' in options, false);
    assert.equal(start.mock.calls.length, 1);
    assert.equal(deadline.mock.calls.length, 1);
  } finally {
    releaseStart();
    deadline.mock.restore();
    start.mock.restore();
  }
});

test('서로 다른 Workflow는 각자의 ID callback과 native 결과 타입을 보존한다', async () => {
  const objectWorkflow = async (profileId: string): Promise<{ profileId: string }> => ({
    profileId,
  });
  const numberWorkflow = async (count: number): Promise<number> => count * 2;
  const objectWorkflowId = (profileId: string) => `object:${profileId}`;
  const numberWorkflowId = (count: number) => `number:${count}`;
  const objectDefinition = { workflow: objectWorkflow, workflowIdFromArgs: objectWorkflowId };
  const numberDefinition = { workflow: numberWorkflow, workflowIdFromArgs: numberWorkflowId };
  let executionCount = 0;
  const execute = mock.method(temporalClient.workflow, 'execute', async () =>
    executionCount++ === 0 ? ({ profileId: 'profile-1' } as never) : (42 as never),
  );
  const deadline = mock.method(
    temporalClient,
    'withDeadline',
    async (_deadline: number | Date, callback: () => Promise<unknown>) => callback(),
  );

  try {
    const firstResult: { profileId: string } = await runWorkflow(objectDefinition, {
      args: ['profile-1'],
      mode: 'execute',
    });
    const secondResult: number = await runWorkflow(numberDefinition, {
      args: [21],
      mode: 'execute',
    });

    assert.deepEqual(firstResult, { profileId: 'profile-1' });
    assert.equal(secondResult, 42);
    const firstCall = execute.mock.calls[0];
    assert.ok(firstCall);
    const secondCall = execute.mock.calls[1];
    assert.ok(secondCall);
    assert.equal(firstCall.arguments[0], objectWorkflow);
    assert.equal(secondCall.arguments[0], numberWorkflow);
    const firstOptions = firstCall.arguments[1];
    assert.ok(firstOptions);
    const secondOptions = secondCall.arguments[1];
    assert.ok(secondOptions);
    assert.equal(firstOptions.workflowId, 'object:profile-1');
    assert.equal(secondOptions.workflowId, 'number:21');
  } finally {
    deadline.mock.restore();
    execute.mock.restore();
  }
});

test('remote Profile Workflow builder는 normalized handle과 profileId를 실행 ID에 보존한다', async () => {
  const domain = 'remote.example';
  const configuredLocalInput = {
    domain,
    handle: ' Alice ',
  } satisfies RemoteProfileLookupInput;
  const profileInput = {
    domain,
    handle: 'alice',
    profileId: '00000000-0000-8000-8000-000000000001',
  } satisfies RemoteProfileLookupInput;
  const execute = mock.method(temporalClient.workflow, 'execute', async () => 'profile-1' as never);
  const deadline = mock.method(
    temporalClient,
    'withDeadline',
    async (_deadline: number | Date, callback: () => Promise<unknown>) => callback(),
  );
  const workflowName = remoteProfileLookupWorkflow.workflow;

  try {
    await runWorkflow(remoteProfileLookupWorkflow, {
      args: [configuredLocalInput],
      mode: 'execute',
    });
    await runWorkflow(remoteProfileLookupWorkflow, {
      args: [configuredLocalInput],
      mode: 'execute',
    });
    await runWorkflow(remoteProfileLookupWorkflow, {
      args: [profileInput],
      mode: 'execute',
    });

    const workflowIds = execute.mock.calls.map((call) => {
      const options = call.arguments[1];
      assert.ok(options);
      return options.workflowId;
    });
    assert.deepEqual(workflowIds, [
      `${workflowName}:["${domain}","alice","configured-local"]`,
      `${workflowName}:["${domain}","alice","configured-local"]`,
      `${workflowName}:["${domain}","alice","00000000-0000-8000-8000-000000000001"]`,
    ]);
  } finally {
    deadline.mock.restore();
    execute.mock.restore();
  }
});

test('공용 task queue와 5초 deadline을 적용한다', async () => {
  const workflow = async (): Promise<string> => 'ok';
  const definition = { workflow, workflowIdFromArgs: () => 'deadline-id' };
  const execute = mock.method(temporalClient.workflow, 'execute', async () => 'ok' as never);
  const deadlines: Array<number | Date> = [];
  const deadline = mock.method(
    temporalClient,
    'withDeadline',
    async (value: number | Date, callback: () => Promise<unknown>) => {
      deadlines.push(value);
      return callback();
    },
  );
  const before = Date.now();

  try {
    await runWorkflow(definition, {
      mode: 'execute',
    });

    const after = Date.now();
    const executeCall = execute.mock.calls[0];
    assert.ok(executeCall);
    const executeOptions = executeCall.arguments[1];
    assert.ok(executeOptions);
    assert.equal(executeOptions.taskQueue, 'kosmo');
    assert.equal(deadlines.length, 1);
    const deadlineValue = deadlines[0];
    assert.ok(deadlineValue !== undefined);
    const deadlineTimestamp =
      deadlineValue instanceof Date ? deadlineValue.getTime() : deadlineValue;
    assert.ok(deadlineTimestamp >= before + 4_900);
    assert.ok(deadlineTimestamp <= after + 5_000);
  } finally {
    deadline.mock.restore();
    execute.mock.restore();
  }
});

for (const mode of ['start', 'execute'] as const) {
  test(`${mode} mode는 ApplicationFailure를 해석하고 그 외 native 오류는 원본으로 전파한다`, async () => {
    type FailureWorkflow = () => Promise<string>;
    const definition: WorkflowDefinition<FailureWorkflow> = {
      workflow: 'profileWorkflow',
      workflowIdFromArgs: () => `failure-boundary-${mode}`,
    };
    const nestedApplicationFailure = ApplicationFailure.create({
      message: 'Remote actor could not be materialized',
      type: 'RemoteActorMaterializationError',
      nonRetryable: true,
      details: [{ actorUri: 'https://remote.example/users/alice' }],
    });
    const activityFailure = new ActivityFailure(
      'Activity failed',
      'materializeRemoteProfileActor',
      'activity-id',
      'NON_RETRYABLE_FAILURE',
      'worker-id',
      nestedApplicationFailure,
    );
    const nativeWorkflowFailure = new WorkflowFailedError(
      'Workflow execution failed',
      activityFailure,
      'NON_RETRYABLE_FAILURE',
    );
    const directApplicationFailure = ApplicationFailure.nonRetryable(
      'Remote actor was not found',
      'NotFoundError',
      { actorUri: 'https://remote.example/users/alice' },
    );
    const timeoutCause = new TimeoutFailure(
      'Workflow execution timed out',
      undefined,
      'START_TO_CLOSE',
    );
    const nativeTimeoutFailure = new WorkflowFailedError(
      'Workflow execution failed',
      timeoutCause,
      'TIMEOUT',
    );
    const transportFailure = new ServiceError('Temporal transport unavailable');
    const cancellationCause = new CancelledFailure('Workflow execution cancelled');
    const nativeCancellationFailure = new WorkflowFailedError(
      'Workflow execution cancelled',
      cancellationCause,
      'NON_RETRYABLE_FAILURE',
    );
    const plainFailure = new Error('Temporal unavailable');
    const failures = [
      { failure: nativeWorkflowFailure, expected: nestedApplicationFailure },
      { failure: directApplicationFailure, expected: directApplicationFailure },
      { failure: nativeTimeoutFailure, expected: nativeTimeoutFailure },
      { failure: transportFailure, expected: transportFailure },
      { failure: nativeCancellationFailure, expected: nativeCancellationFailure },
      { failure: plainFailure, expected: plainFailure },
    ];
    let failureIndex = 0;
    const nativeCall =
      mode === 'start'
        ? mock.method(temporalClient.workflow, 'start', async () => {
            const testCase = failures[failureIndex++];
            assert.ok(testCase);
            throw testCase.failure;
          })
        : mock.method(temporalClient.workflow, 'execute', async () => {
            const testCase = failures[failureIndex++];
            assert.ok(testCase);
            throw testCase.failure;
          });
    const deadline = mock.method(
      temporalClient,
      'withDeadline',
      async (_deadline: number | Date, callback: () => Promise<unknown>) => callback(),
    );

    try {
      for (const { expected } of failures) {
        await assert.rejects(runWorkflow(definition, { mode }), (error: unknown) => {
          assert.strictEqual(error, expected);
          return true;
        });
      }
      assert.equal(nestedApplicationFailure.type, 'RemoteActorMaterializationError');
      assert.deepEqual(nestedApplicationFailure.details, [
        { actorUri: 'https://remote.example/users/alice' },
      ]);
      assert.equal(nativeCall.mock.calls.length, failures.length);
    } finally {
      deadline.mock.restore();
      nativeCall.mock.restore();
    }
  });
}

test('Workflow ID callback 오류는 SDK 실행 전에 그대로 전파한다', async () => {
  type CallbackFailureWorkflow = (profileId: string) => Promise<string>;
  const failure = new Error('invalid workflow identity');
  const definition: WorkflowDefinition<CallbackFailureWorkflow> = {
    workflow: 'profileWorkflow',
    workflowIdFromArgs: () => {
      throw failure;
    },
  };
  const execute = mock.method(
    temporalClient.workflow,
    'execute',
    async () => 'unreachable' as never,
  );
  const deadline = mock.method(
    temporalClient,
    'withDeadline',
    async (_deadline: number | Date, callback: () => Promise<unknown>) => callback(),
  );

  try {
    await assert.rejects(
      runWorkflow(definition, {
        args: ['profile-1'],
        mode: 'execute',
      }),
      (error: unknown) => error === failure,
    );
    assert.equal(execute.mock.calls.length, 0);
  } finally {
    deadline.mock.restore();
    execute.mock.restore();
  }
});
