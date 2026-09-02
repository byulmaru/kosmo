import assert from 'node:assert/strict';
import test, { mock } from 'node:test';

process.env.TEMPORAL_ADDRESS ??= '127.0.0.1:7233';
process.env.TEMPORAL_NAMESPACE ??= 'test';

const { temporalClient } = await import('./client');
const { executeProfileBlock, profileBlockWorkflowId } = await import('./profile-block');

const input = {
  ownerProfileId: '00000000-0000-8000-8000-000000000001',
  targetProfileId: '00000000-0000-8000-8000-000000000002',
  origin: 'LOCAL' as const,
};

test('Profile Block caller waits for the one-shot Workflow result', async () => {
  const result = {
    created: true,
    profileBlockId: '00000000-0000-8000-8000-000000000003',
    ownerProfileId: input.ownerProfileId,
    targetProfileId: input.targetProfileId,
  };
  let resolveExecution!: () => void;
  const executionFinished = new Promise<void>((resolve) => {
    resolveExecution = resolve;
  });
  const execute = mock.method(temporalClient.workflow, 'execute', async () => {
    await executionFinished;
    return result;
  });
  const deadline = mock.method(
    temporalClient,
    'withDeadline',
    async (_deadline: number | Date, callback: () => Promise<unknown>) => callback(),
  );

  try {
    let settled = false;
    const resultPromise = executeProfileBlock(input).then((value) => {
      settled = true;
      return value;
    });
    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(settled, false);

    resolveExecution();
    assert.deepEqual(await resultPromise, result);
    const call = execute.mock.calls[0];
    assert.ok(call);
    assert.equal(call.arguments[0], 'profileBlockWorkflow');
    const options = call.arguments[1];
    assert.ok(options);
    assert.deepEqual(options.args, [input]);
    assert.equal(options.taskQueue, 'kosmo');
    assert.equal(options.workflowId, profileBlockWorkflowId(input));
    assert.equal(options.workflowIdConflictPolicy, 'USE_EXISTING');
    assert.equal(options.workflowIdReusePolicy, 'ALLOW_DUPLICATE');
    assert.equal(deadline.mock.calls.length, 1);
  } finally {
    deadline.mock.restore();
    execute.mock.restore();
  }
});

test('Profile Block caller keeps direction in the deterministic Workflow ID', () => {
  assert.equal(
    profileBlockWorkflowId(input),
    'profile-block:00000000-0000-8000-8000-000000000001:00000000-0000-8000-8000-000000000002',
  );
  assert.notEqual(
    profileBlockWorkflowId(input),
    profileBlockWorkflowId({
      ...input,
      ownerProfileId: input.targetProfileId,
      targetProfileId: input.ownerProfileId,
    }),
  );
});
