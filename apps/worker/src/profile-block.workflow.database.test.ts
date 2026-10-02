import '@kosmo/core/polyfill';

import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { after, test } from 'node:test';
import { InstanceKind, InstanceState, ProfileFollowPolicy, ProfileState } from '@kosmo/core/enums';
import { KOSMO_TASK_QUEUE } from '@kosmo/core/temporal/task-queue';
import { WithStartWorkflowOperation } from '@temporalio/client';
import { TestWorkflowEnvironment } from '@temporalio/testing';
import { Worker } from '@temporalio/worker';
import { and, eq } from 'drizzle-orm';
import type {
  ProfileBlockTransitionResult,
  ProfileUnblockTransitionResult,
} from '@kosmo/core/temporal/profile-block';

process.env.DATABASE_URL ??= 'postgres://kosmo:kosmo@localhost:54329/kosmo_test';

const environment = await TestWorkflowEnvironment.createLocal({
  server: { executable: { type: 'cached-download', version: 'v1.8.2' } },
});
process.env.TEMPORAL_ADDRESS = environment.address;
process.env.TEMPORAL_NAMESPACE = environment.namespace ?? 'default';

const [
  {
    PROFILE_BLOCK_UPDATE_ID,
    PROFILE_BLOCK_UPDATE_NAME,
    PROFILE_UNBLOCK_UPDATE_NAME,
    profileBlockWorkflow,
    profileUnblockUpdateId,
    profileUnblockWorkflow,
  },
  { db, firstOrThrow, Instances, pg, ProfileBlocks, Profiles },
  activities,
] = await Promise.all([
  import('@kosmo/core/temporal/profile-block'),
  import('@kosmo/core/db'),
  import('./activities'),
]);
const workflowsPath = new URL('./workflows/index.ts', import.meta.url).pathname;
let worker: Worker | undefined;
let workerRun: Promise<void> | undefined;

const truncateDatabase = () =>
  pg.unsafe(
    'TRUNCATE TABLE profile_block, profile_follow, profile_follow_request, profile, instance CASCADE',
  );

const createFixture = async () => {
  const suffix = randomUUID();
  const instance = await db
    .insert(Instances)
    .values({ domain: `${suffix}.example`, kind: InstanceKind.LOCAL, state: InstanceState.ACTIVE })
    .returning()
    .then(firstOrThrow);
  const [owner, target] = await db
    .insert(Profiles)
    .values(
      ['owner', 'target'].map((name) => ({
        displayName: name,
        followPolicy: ProfileFollowPolicy.OPEN,
        handle: `${name}-${suffix}`,
        instanceId: instance.id,
        normalizedHandle: `${name}-${suffix}`,
        state: ProfileState.ACTIVE,
      })),
    )
    .returning();
  assert.ok(owner);
  assert.ok(target);
  return {
    ownerProfileId: owner.id,
    targetProfileId: target.id,
    origin: 'LOCAL' as const,
  };
};

after(async () => {
  try {
    if (worker?.getState() === 'RUNNING') {
      worker.shutdown();
    }
    if (workerRun !== undefined) {
      await workerRun;
    }
  } finally {
    await truncateDatabase();
    await pg.end();
    await environment.teardown();
  }
});

test(
  'Profile Block Workflow persists one relation row and duplicate callers observe it',
  { timeout: 120_000 },
  async () => {
    await truncateDatabase();
    const input = await createFixture();
    const runBlock = (value: typeof input, updateId: string) =>
      environment.client.workflow.executeUpdateWithStart(PROFILE_BLOCK_UPDATE_NAME, {
        args: [value],
        updateId,
        startWorkflowOperation: new WithStartWorkflowOperation(profileBlockWorkflow.workflow, {
          args: [value],
          taskQueue: KOSMO_TASK_QUEUE,
          workflowId: profileBlockWorkflow.workflowIdFromArgs(value),
          workflowIdConflictPolicy: 'USE_EXISTING',
          workflowIdReusePolicy: 'ALLOW_DUPLICATE',
        }),
      }) as Promise<ProfileBlockTransitionResult>;
    const transitionStarted = Promise.withResolvers<void>();
    const transitionReleased = Promise.withResolvers<void>();
    const blockEffectStarted = Promise.withResolvers<void>();
    const blockEffectReleased = Promise.withResolvers<void>();
    const duplicateTransitionExecuted = Promise.withResolvers<void>();
    const duplicateTransitionReleased = Promise.withResolvers<void>();
    let holdFirstTransition = true;
    let holdNextTransition = false;
    worker = await Worker.create({
      activities: {
        ...activities,
        executeProfileBlockTransitionActivity: async (
          value: Parameters<typeof activities.executeProfileBlockTransitionActivity>[0],
        ) => {
          if (holdFirstTransition) {
            holdFirstTransition = false;
            transitionStarted.resolve();
            await transitionReleased.promise;
          }
          const execution = await activities.executeProfileBlockTransitionActivity(value);
          if (holdNextTransition) {
            holdNextTransition = false;
            duplicateTransitionExecuted.resolve();
            await duplicateTransitionReleased.promise;
          }
          return execution;
        },
        sendProfileBlockActivity: async () => {
          blockEffectStarted.resolve();
          await blockEffectReleased.promise;
        },
      },
      connection: environment.nativeConnection,
      namespace: environment.namespace,
      taskQueue: KOSMO_TASK_QUEUE,
      workflowsPath,
    });
    workerRun = worker.run();

    try {
      const first = runBlock(input, `${PROFILE_BLOCK_UPDATE_ID}:first`);
      await transitionStarted.promise;
      const existing = runBlock(input, `${PROFILE_BLOCK_UPDATE_ID}:existing`);
      transitionReleased.resolve();
      const [firstResult, existingResult] = await Promise.all([first, existing]);
      assert.equal(firstResult.created, true);
      assert.deepEqual(existingResult, { ...firstResult, created: false });
      await blockEffectStarted.promise;

      holdNextTransition = true;
      const duplicate = await environment.client.workflow.startUpdateWithStart(
        PROFILE_BLOCK_UPDATE_NAME,
        {
          args: [input],
          updateId: `${PROFILE_BLOCK_UPDATE_ID}:duplicate`,
          waitForStage: 'ACCEPTED',
          startWorkflowOperation: new WithStartWorkflowOperation(profileBlockWorkflow.workflow, {
            args: [input],
            taskQueue: KOSMO_TASK_QUEUE,
            workflowId: profileBlockWorkflow.workflowIdFromArgs(input),
            workflowIdConflictPolicy: 'USE_EXISTING',
            workflowIdReusePolicy: 'ALLOW_DUPLICATE',
          }),
        },
      );
      await duplicateTransitionExecuted.promise;

      const rows = await db
        .select()
        .from(ProfileBlocks)
        .where(
          and(
            eq(ProfileBlocks.ownerProfileId, input.ownerProfileId),
            eq(ProfileBlocks.targetProfileId, input.targetProfileId),
          ),
        );
      assert.deepEqual(
        rows.map(({ id }) => id),
        [firstResult.profileBlockId],
      );

      blockEffectReleased.resolve();
      const workflowId = profileBlockWorkflow.workflowIdFromArgs(input);
      const workflowHandle = environment.client.workflow.getHandle(
        workflowId,
        duplicate.workflowRunId,
      );
      for (;;) {
        const events = (await workflowHandle.fetchHistory()).events ?? [];
        const blockActivityScheduledEventId = events
          .find(
            (event) =>
              event.activityTaskScheduledEventAttributes?.activityType?.name ===
              'sendProfileBlockActivity',
          )
          ?.eventId?.toString();
        const blockActivityCompletedEvent = events.find(
          (event) =>
            blockActivityScheduledEventId !== undefined &&
            event.activityTaskCompletedEventAttributes?.scheduledEventId?.toString() ===
              blockActivityScheduledEventId,
        );
        if (
          blockActivityCompletedEvent?.eventId != null &&
          events.some(
            (event) =>
              event.workflowTaskCompletedEventAttributes != null &&
              event.eventId != null &&
              BigInt(event.eventId.toString()) >
                BigInt(blockActivityCompletedEvent.eventId!.toString()),
          )
        ) {
          break;
        }
      }

      duplicateTransitionReleased.resolve();
      assert.deepEqual(await duplicate.result(), { ...firstResult, created: false });
      await workflowHandle.result();
    } finally {
      transitionReleased.resolve();
      blockEffectReleased.resolve();
      duplicateTransitionReleased.resolve();
    }
  },
);

test(
  'Profile Unblock Activity retry removes the inbound current pair without an outbound echo',
  { timeout: 120_000 },
  async () => {
    await truncateDatabase();
    const input = await createFixture();
    const block = await activities.executeProfileBlockTransitionActivity({
      ownerProfileId: input.ownerProfileId,
      targetProfileId: input.targetProfileId,
      origin: 'ACTIVITYPUB',
    });
    assert.equal(block.ok, true);
    if (!block.ok) {
      return;
    }

    const command = {
      ownerProfileId: input.ownerProfileId,
      targetProfileId: input.targetProfileId,
      origin: 'ACTIVITYPUB' as const,
    };
    const taskQueue = `${KOSMO_TASK_QUEUE}-profile-unblock-retry-${process.pid}`;
    let failNextUnblock = true;
    let unblockActivityAttempts = 0;
    let outboundUndoAttempts = 0;
    const retryWorker = await Worker.create({
      activities: {
        ...activities,
        executeProfileUnblockTransitionActivity: async (
          value: Parameters<typeof activities.executeProfileUnblockTransitionActivity>[0],
        ) => {
          unblockActivityAttempts += 1;
          if (failNextUnblock) {
            failNextUnblock = false;
            throw new Error('injected transient Profile Unblock Activity failure');
          }
          return activities.executeProfileUnblockTransitionActivity(value);
        },
        sendProfileBlockUndoActivity: async () => {
          outboundUndoAttempts += 1;
        },
      },
      connection: environment.nativeConnection,
      namespace: environment.namespace,
      taskQueue,
      workflowsPath,
    });
    await retryWorker.runUntil(async () => {
      const startWorkflowOperation = new WithStartWorkflowOperation(
        profileUnblockWorkflow.workflow,
        {
          args: [command],
          taskQueue,
          workflowId: profileUnblockWorkflow.workflowIdFromArgs(command),
          workflowIdConflictPolicy: 'USE_EXISTING',
          workflowIdReusePolicy: 'ALLOW_DUPLICATE',
        },
      );
      const result = (await environment.client.workflow.executeUpdateWithStart(
        PROFILE_UNBLOCK_UPDATE_NAME,
        {
          args: [command],
          updateId: profileUnblockUpdateId(command),
          startWorkflowOperation,
        },
      )) as ProfileUnblockTransitionResult;
      assert.equal(result.removed, true);
      await (await startWorkflowOperation.workflowHandle()).result();
    });

    assert.ok(unblockActivityAttempts >= 2);
    assert.equal(outboundUndoAttempts, 0);
    assert.equal((await db.select().from(ProfileBlocks)).length, 0);
  },
);

test(
  'Profile Unblock Update returns the committed removal while the local Undo effect is held',
  { timeout: 120_000 },
  async () => {
    await truncateDatabase();
    const input = await createFixture();
    const block = await activities.executeProfileBlockTransitionActivity(input);
    assert.equal(block.ok, true);
    if (!block.ok) {
      return;
    }

    const command = {
      ownerProfileId: input.ownerProfileId,
      profileBlockId: block.result.profileBlockId,
      targetProfileId: input.targetProfileId,
    };
    const undoActivityStarted =
      Promise.withResolvers<Parameters<typeof activities.sendProfileBlockUndoActivity>[0]>();
    const releaseUndoActivity = Promise.withResolvers<void>();
    const taskQueue = `${KOSMO_TASK_QUEUE}-profile-unblock-held-${process.pid}`;
    const heldUndoWorker = await Worker.create({
      activities: {
        ...activities,
        sendProfileBlockUndoActivity: async (
          value: Parameters<typeof activities.sendProfileBlockUndoActivity>[0],
        ) => {
          undoActivityStarted.resolve(value);
          await releaseUndoActivity.promise;
        },
      },
      connection: environment.nativeConnection,
      namespace: environment.namespace,
      taskQueue,
      workflowsPath,
    });

    await heldUndoWorker.runUntil(async () => {
      try {
        const startWorkflowOperation = new WithStartWorkflowOperation(
          profileUnblockWorkflow.workflow,
          {
            args: [command],
            taskQueue,
            workflowId: profileUnblockWorkflow.workflowIdFromArgs(command),
            workflowIdConflictPolicy: 'USE_EXISTING',
            workflowIdReusePolicy: 'ALLOW_DUPLICATE',
          },
        );
        const result = (await environment.client.workflow.executeUpdateWithStart(
          PROFILE_UNBLOCK_UPDATE_NAME,
          {
            args: [command],
            updateId: profileUnblockUpdateId(command),
            startWorkflowOperation,
          },
        )) as ProfileUnblockTransitionResult;
        assert.deepEqual(result, {
          removed: true,
          profileBlockId: command.profileBlockId,
          ownerProfileId: command.ownerProfileId,
          targetProfileId: command.targetProfileId,
        });
        assert.deepEqual(await undoActivityStarted.promise, {
          ownerProfileId: command.ownerProfileId,
          profileBlockId: command.profileBlockId,
          targetProfileId: command.targetProfileId,
        });
        assert.deepEqual(
          await db.select().from(ProfileBlocks).where(eq(ProfileBlocks.id, command.profileBlockId)),
          [],
        );

        releaseUndoActivity.resolve();
        await (await startWorkflowOperation.workflowHandle()).result();
      } finally {
        releaseUndoActivity.resolve();
      }
    });
  },
);
