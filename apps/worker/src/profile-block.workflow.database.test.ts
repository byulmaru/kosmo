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
import type { ProfileBlockTransitionResult } from '@kosmo/core/temporal/profile-block';

process.env.DATABASE_URL ??= 'postgres://kosmo:kosmo@localhost:54329/kosmo_test';

const environment = await TestWorkflowEnvironment.createLocal({
  server: { executable: { type: 'cached-download', version: 'v1.8.2' } },
});
process.env.TEMPORAL_ADDRESS = environment.address;
process.env.TEMPORAL_NAMESPACE = environment.namespace ?? 'default';

const [
  { PROFILE_BLOCK_UPDATE_ID, PROFILE_BLOCK_UPDATE_NAME, profileBlockWorkflow },
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
    let holdFirstTransition = true;
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
          return activities.executeProfileBlockTransitionActivity(value);
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
      assert.deepEqual(existingResult, firstResult);
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
      const duplicate = await runBlock(input, `${PROFILE_BLOCK_UPDATE_ID}:duplicate`);
      assert.deepEqual(duplicate, { ...firstResult, created: false });
    } finally {
      transitionReleased.resolve();
    }
  },
);
