import '@kosmo/core/polyfill';

import assert from 'node:assert/strict';
import { after, test } from 'node:test';
import {
  db,
  firstOrThrow,
  Instances,
  Notifications,
  pg,
  ProfileBlocks,
  ProfileFollows,
  Profiles,
} from '@kosmo/core/db';
import {
  InstanceKind,
  InstanceState,
  NotificationKind,
  ProfileFollowPolicy,
  ProfileState,
} from '@kosmo/core/enums';
import { createFollowNotification } from '@kosmo/core/services';
import { KOSMO_TASK_QUEUE } from '@kosmo/core/temporal/task-queue';
import {
  ActivityFailure,
  ApplicationFailure,
  WorkflowFailedError,
  WorkflowIdReusePolicy,
} from '@temporalio/client';
import { TestWorkflowEnvironment } from '@temporalio/testing';
import { Worker } from '@temporalio/worker';
import { and, eq, inArray, sql } from 'drizzle-orm';
import type * as productionActivities from './activities';

process.env.DATABASE_URL ??= 'postgres://kosmo:kosmo@localhost:54329/kosmo_test';

const workflowsPath = new URL('./workflows/index.ts', import.meta.url).pathname;
const profileIds = new Set<string>();
const instanceIds = new Set<string>();

const createProfile = async () => {
  const suffix = crypto.randomUUID();
  const instance = await db
    .insert(Instances)
    .values({
      domain: `${suffix}.example`,
      kind: InstanceKind.LOCAL,
      state: InstanceState.ACTIVE,
    })
    .returning()
    .then(firstOrThrow);
  instanceIds.add(instance.id);
  const profile = await db
    .insert(Profiles)
    .values({
      displayName: suffix,
      followPolicy: ProfileFollowPolicy.OPEN,
      handle: suffix,
      instanceId: instance.id,
      normalizedHandle: suffix,
      state: ProfileState.ACTIVE,
    })
    .returning()
    .then(firstOrThrow);
  profileIds.add(profile.id);
  return profile;
};

const pendingUnblockBatchCount = async (ownerProfileId: string, targetProfileId: string) =>
  db
    .execute<{ count: string }>(
      sql`
      SELECT count(*)::text AS count
        FROM profile_block_cleanup_batch
       WHERE operation = 'UNBLOCK'
         AND owner_profile_id = ${ownerProfileId}
         AND target_profile_id = ${targetProfileId}
         AND settled_at IS NULL
    `,
    )
    .then((rows) => Number(rows[0]?.count ?? 0));

after(async () => {
  if (profileIds.size > 0) {
    await db.delete(Profiles).where(inArray(Profiles.id, [...profileIds]));
  }
  if (instanceIds.size > 0) {
    await db.delete(Instances).where(inArray(Instances.id, [...instanceIds]));
  }
  await pg.end();
});

test('실제 Worker Workflow는 commit 후 cleanup 실패를 성공으로 숨기지 않고 새 실행에서 drain한다', async (t) => {
  const environment = await TestWorkflowEnvironment.createLocal({
    server: { executable: { type: 'cached-download', version: 'v1.8.2' } },
  });
  t.after(() => environment.teardown());
  const taskQueue = `${KOSMO_TASK_QUEUE}-profile-block-cleanup-${process.pid}`;
  const owner = await createProfile();
  const target = await createProfile();
  const follow = await db
    .insert(ProfileFollows)
    .values({
      followerProfileId: owner.id,
      followeeProfileId: target.id,
    })
    .returning()
    .then(firstOrThrow);
  await createFollowNotification(follow.id);
  const profileBlockId = '00000000-0000-7000-8000-000000000931';
  await db.insert(ProfileBlocks).values({
    id: profileBlockId,
    ownerProfileId: owner.id,
    targetProfileId: target.id,
  });

  let failCleanup = true;
  const actualActivities: typeof productionActivities = await import('./activities');
  const activities = {
    ...actualActivities,
    deleteFollowNotificationActivity: async (sourceId: string): Promise<void> => {
      if (failCleanup) {
        failCleanup = false;
        throw ApplicationFailure.nonRetryable('injected cleanup boundary failure');
      }
      await actualActivities.deleteFollowNotificationActivity(sourceId);
    },
  };
  const worker = await Worker.create({
    activities,
    connection: environment.nativeConnection,
    namespace: environment.namespace,
    taskQueue,
    workflowsPath,
  });
  const workflowId = `profile-unblock-cleanup-recovery:${owner.id}:${target.id}`;
  const input = {
    ownerProfileId: owner.id,
    targetProfileId: target.id,
    profileBlockId,
    origin: 'LOCAL' as const,
  };

  await worker.runUntil(async () => {
    await assert.rejects(
      environment.client.workflow.execute('profileUnblockWorkflow', {
        args: [input],
        taskQueue,
        workflowId,
      }),
      (error: unknown) =>
        error instanceof WorkflowFailedError &&
        error.cause instanceof ActivityFailure &&
        error.cause.cause instanceof ApplicationFailure &&
        error.cause.cause.message === 'injected cleanup boundary failure',
    );
    assert.equal(await pendingUnblockBatchCount(owner.id, target.id), 1);
    assert.equal(
      await db
        .select()
        .from(Notifications)
        .where(
          and(
            eq(Notifications.kind, NotificationKind.FOLLOW),
            eq(Notifications.sourceId, follow.id),
          ),
        )
        .then((rows) => rows.length),
      1,
    );
    assert.equal(
      await db
        .select()
        .from(ProfileBlocks)
        .where(eq(ProfileBlocks.id, profileBlockId))
        .then((rows) => rows.length),
      1,
    );

    const retry = await environment.client.workflow.execute('profileUnblockWorkflow', {
      args: [input],
      taskQueue,
      workflowId,
      workflowIdReusePolicy: WorkflowIdReusePolicy.ALLOW_DUPLICATE_FAILED_ONLY,
    });
    assert.equal(retry.removed, true);
    assert.equal(await pendingUnblockBatchCount(owner.id, target.id), 0);
    assert.equal(
      await db
        .select()
        .from(Notifications)
        .where(
          and(
            eq(Notifications.kind, NotificationKind.FOLLOW),
            eq(Notifications.sourceId, follow.id),
          ),
        )
        .then((rows) => rows.length),
      0,
    );
    assert.equal(
      await db
        .select()
        .from(ProfileBlocks)
        .where(eq(ProfileBlocks.id, profileBlockId))
        .then((rows) => rows.length),
      0,
    );
  });
});

test(
  'DB commit 뒤 Activity 응답 유실 재시도는 과거 cleanup을 정산하고 새 Block을 보존한다',
  { timeout: 120_000 },
  async (t) => {
    const environment = await TestWorkflowEnvironment.createLocal({
      server: { executable: { type: 'cached-download', version: 'v1.8.2' } },
    });
    t.after(() => environment.teardown());
    const taskQueue = `${KOSMO_TASK_QUEUE}-profile-block-response-loss-${process.pid}`;
    const owner = await createProfile();
    const target = await createProfile();
    const follow = await db
      .insert(ProfileFollows)
      .values({
        followerProfileId: owner.id,
        followeeProfileId: target.id,
      })
      .returning()
      .then(firstOrThrow);
    await createFollowNotification(follow.id);
    const originalId = '00000000-0000-7000-8000-000000000941';
    const replacementId = '00000000-0000-7000-8000-000000000942';
    const pair = { ownerProfileId: owner.id, targetProfileId: target.id };
    await db.insert(ProfileBlocks).values({ id: originalId, ...pair });

    const actualActivities: typeof productionActivities = await import('./activities');
    const operationIds: string[] = [];
    const worker = await Worker.create({
      activities: {
        ...actualActivities,
        executeProfileUnblockTransitionActivity: async (
          input: Parameters<typeof productionActivities.executeProfileUnblockTransitionActivity>[0],
        ) => {
          const execution = await actualActivities.executeProfileUnblockTransitionActivity(input);
          assert.equal(execution.ok, true);
          operationIds.push(input.operationId);
          if (operationIds.length === 1) {
            assert.equal(execution.result.profileBlockId, originalId);
            const pendingBatches =
              await actualActivities.loadPendingProfileBlockCleanupBatchesActivity(pair);
            const committedBatch = pendingBatches.find(
              (batch) => batch.operation === 'UNBLOCK' && batch.operationId === input.operationId,
            );
            assert.ok(committedBatch);
            assert.equal(committedBatch.effectPlan.length, 1);
            assert.equal(committedBatch.effectPlan[0]?.input.sourceId, follow.id);
            // A concurrent Block replaces the closing row after the Unblock DB
            // commit but before Temporal receives the Activity's completion.
            const replacement = await actualActivities.executeProfileBlockTransitionActivity({
              ...pair,
              candidateProfileBlockId: replacementId,
              cleanupSources: [],
              origin: 'LOCAL',
            });
            assert.equal(replacement.ok, true);
            assert.equal(replacement.result.profileBlockId, replacementId);
            assert.equal(await pendingUnblockBatchCount(owner.id, target.id), 1);
            throw ApplicationFailure.retryable('injected response loss after DB commit');
          }
          return execution;
        },
      },
      connection: environment.nativeConnection,
      namespace: environment.namespace,
      taskQueue,
      workflowsPath,
    });

    await worker.runUntil(async () => {
      const result = await environment.client.workflow.execute('profileUnblockWorkflow', {
        args: [{ ...pair, profileBlockId: originalId, origin: 'LOCAL' }],
        taskQueue,
        workflowId: `profile-unblock-response-loss:${owner.id}:${target.id}`,
      });
      assert.deepEqual(result, { ...pair, profileBlockId: originalId, removed: true });
      assert.equal(operationIds.length, 2);
      assert.equal(typeof operationIds[0], 'string');
      assert.equal(operationIds[1], operationIds[0]);
      assert.equal(await pendingUnblockBatchCount(owner.id, target.id), 0);
      assert.deepEqual(
        await db
          .select({ id: ProfileBlocks.id })
          .from(ProfileBlocks)
          .where(
            and(
              eq(ProfileBlocks.ownerProfileId, owner.id),
              eq(ProfileBlocks.targetProfileId, target.id),
            ),
          ),
        [{ id: replacementId }],
      );
      assert.equal(
        await db
          .select()
          .from(Notifications)
          .where(
            and(
              eq(Notifications.kind, NotificationKind.FOLLOW),
              eq(Notifications.sourceId, follow.id),
            ),
          )
          .then((rows) => rows.length),
        0,
      );
    });
  },
);
