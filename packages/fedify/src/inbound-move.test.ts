import '@kosmo/core/polyfill';

import assert from 'node:assert/strict';
import { mock, test } from 'node:test';
import { Move, Person } from '@fedify/vocab';
import { temporalClient } from '@kosmo/core/temporal/client';
import { profileMigrationWorkflowId } from '@kosmo/core/temporal/profile-migration';
import { KOSMO_TASK_QUEUE } from '@kosmo/core/temporal/task-queue';
import type { InboxContext } from '@fedify/fedify';
import type { Object as ActivityPubObject } from '@fedify/vocab';
import type { handleInboundMove as HandleInboundMove } from './inbound-move';

const publicOrigin = 'https://kosmo.example';
const sourceActorUri = new URL('https://source.example/users/alice');
const targetActorUri = new URL('https://target.example/users/alice');

const createActor = (id: URL) =>
  new Person({
    id,
    preferredUsername: id.pathname.split('/').at(-1) ?? 'profile',
  });

const createContext = (
  lookupObject: (identifier: string | URL) => Promise<ActivityPubObject | null> = async () => null,
): InboxContext<void> =>
  ({
    canonicalOrigin: publicOrigin,
    getActorUri: (identifier: string) => new URL(`/ap/actor/${identifier}`, publicOrigin),
    lookupObject,
    recipient: null,
  }) as unknown as InboxContext<void>;

const loadHandler = async () => {
  const { handleInboundMove } = await import('./inbound-move');
  return handleInboundMove as typeof HandleInboundMove;
};

test('rejects invalid Move URI identity before lookup or workflow admission', async () => {
  const handleInboundMove = await loadHandler();
  const lookupObject = mock.fn(async () => null);
  const start = mock.method(temporalClient.workflow, 'start', async () => undefined as never);
  const otherActorUri = new URL('https://source.example/users/other');

  try {
    await handleInboundMove(
      createContext(lookupObject),
      new Move({
        actor: sourceActorUri,
        object: otherActorUri,
        target: targetActorUri,
      }),
    );
    await handleInboundMove(
      createContext(lookupObject),
      new Move({
        actor: sourceActorUri,
        object: sourceActorUri,
        target: sourceActorUri,
      }),
    );
    await handleInboundMove(
      createContext(lookupObject),
      new Move({
        actor: sourceActorUri,
        object: sourceActorUri,
        target: new URL('ftp://target.example/users/alice'),
      }),
    );
  } finally {
    start.mock.restore();
  }

  assert.equal(lookupObject.mock.calls.length, 0);
  assert.equal(start.mock.calls.length, 0);
});

test('rejects embedded Actor identity mismatches without network lookup', async () => {
  const handleInboundMove = await loadHandler();
  const lookupObject = mock.fn(async () => null);
  const start = mock.method(temporalClient.workflow, 'start', async () => undefined as never);
  const wrongActor = createActor(new URL('https://attacker.example/users/forged'));

  try {
    const mismatchedObject = new Move({
      actor: sourceActorUri,
      object: sourceActorUri,
      target: targetActorUri,
    });
    Object.defineProperty(mismatchedObject, 'getObject', {
      value: async () => wrongActor,
    });
    await handleInboundMove(createContext(lookupObject), mismatchedObject);

    const mismatchedTarget = new Move({
      actor: sourceActorUri,
      object: sourceActorUri,
      target: targetActorUri,
    });
    Object.defineProperty(mismatchedTarget, 'getTarget', {
      value: async () => wrongActor,
    });
    await handleInboundMove(createContext(lookupObject), mismatchedTarget);
  } finally {
    start.mock.restore();
  }

  assert.equal(lookupObject.mock.calls.length, 0);
  assert.equal(start.mock.calls.length, 0);
});

test('admits a canonical URI workflow without remote lookup or profile materialization', async () => {
  const handleInboundMove = await loadHandler();
  const lookupObject = mock.fn(async () => null);
  const start = mock.method(temporalClient.workflow, 'start', async () => undefined as never);
  const sourceActor = createActor(sourceActorUri);
  const targetActor = createActor(targetActorUri);
  const input = {
    sourceActorUri: sourceActorUri.href,
    targetActorUri: targetActorUri.href,
  };

  try {
    await handleInboundMove(
      createContext(lookupObject),
      new Move({
        actor: sourceActor,
        object: sourceActor,
        target: targetActor,
      }),
    );
  } finally {
    start.mock.restore();
  }

  assert.equal(lookupObject.mock.calls.length, 0);
  assert.equal(start.mock.calls.length, 1);
  const [workflowType, options] = start.mock.calls[0]?.arguments ?? [];
  assert.equal(workflowType, 'profileMigrationMoveWorkflow');
  assert.deepEqual((options as { args: unknown[] }).args, [input]);
  assert.equal((options as { workflowId: string }).workflowId, profileMigrationWorkflowId(input));
  assert.equal((options as { taskQueue: string }).taskQueue, KOSMO_TASK_QUEUE);
  assert.equal(
    (options as { workflowIdConflictPolicy: string }).workflowIdConflictPolicy,
    'USE_EXISTING',
  );
  assert.equal(
    (options as { workflowIdReusePolicy: string }).workflowIdReusePolicy,
    'ALLOW_DUPLICATE',
  );
});

test('propagates workflow admission failure for inbox retry', async () => {
  const handleInboundMove = await loadHandler();
  const lookupObject = mock.fn(async () => null);
  const startError = new Error('Temporal is unavailable');
  const start = mock.method(temporalClient.workflow, 'start', async () => {
    throw startError;
  });

  try {
    await assert.rejects(
      handleInboundMove(
        createContext(lookupObject),
        new Move({
          actor: sourceActorUri,
          object: sourceActorUri,
          target: targetActorUri,
        }),
      ),
      (error) => error === startError,
    );
  } finally {
    start.mock.restore();
  }

  assert.equal(lookupObject.mock.calls.length, 0);
  assert.equal(start.mock.calls.length, 1);
});
