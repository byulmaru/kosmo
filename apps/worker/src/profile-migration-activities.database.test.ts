import '@kosmo/core/polyfill';

import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { after, beforeEach, mock, test } from 'node:test';
import {
  ActivityPubActorType,
  InstanceKind,
  InstanceState,
  ProfileFollowPolicy,
  ProfileState,
} from '@kosmo/core/enums';
import { NotFoundError } from '@kosmo/core/error';
import { KOSMO_TASK_QUEUE } from '@kosmo/core/temporal/task-queue';
import { TestWorkflowEnvironment } from '@temporalio/testing';
import { Worker } from '@temporalio/worker';
import { and, eq } from 'drizzle-orm';

process.env.DATABASE_URL ??= 'postgres://kosmo:kosmo@localhost:54329/kosmo_test';
process.env.PUBLIC_ORIGIN ??= 'http://127.0.0.1:4173';

const environment = await TestWorkflowEnvironment.createLocal({
  server: { executable: { type: 'cached-download', version: 'v1.8.2' } },
});
process.env.TEMPORAL_ADDRESS = environment.address;
process.env.TEMPORAL_NAMESPACE = environment.namespace ?? 'default';

const [
  {
    ActivityPubActors,
    db,
    firstOrThrow,
    Instances,
    pg,
    ProfileFollowRequests,
    ProfileFollows,
    ProfileMigrations,
    Profiles,
  },
  { profileMigrationMoveWorkflow },
  { runWorkflow, temporalClient },
  { profileFollowPairWorkflowId, profileFollowRemovalWorkflowId },
  activities,
  migrationActivities,
] = await Promise.all([
  import('@kosmo/core/db'),
  import('@kosmo/core/temporal/profile-migration'),
  import('@kosmo/core/temporal/client'),
  import('@kosmo/core/temporal/follow-command'),
  import('./activities'),
  import('./profile-migration-activities'),
]);

const workflowsPath = new URL('./workflows/index.ts', import.meta.url).pathname;

const truncateDatabase = () =>
  pg.unsafe(
    'TRUNCATE TABLE profile_follow_request, profile_follow, profile_migration, profile, instance CASCADE',
  );

beforeEach(async () => {
  await truncateDatabase();
});

after(async () => {
  await truncateDatabase();
  await temporalClient.connection.close();
  await pg.end();
  await environment.teardown();
});

const createProfile = async ({
  instanceKind = InstanceKind.LOCAL,
  instanceState = InstanceState.ACTIVE,
  followPolicy = ProfileFollowPolicy.OPEN,
  profileState = ProfileState.ACTIVE,
  withActor = instanceKind === InstanceKind.ACTIVITYPUB,
  actorInboxUri,
}: {
  readonly instanceKind?: InstanceKind;
  readonly instanceState?: InstanceState;
  readonly followPolicy?: ProfileFollowPolicy;
  readonly profileState?: ProfileState;
  readonly withActor?: boolean;
  readonly actorInboxUri?: string | null;
} = {}) => {
  const suffix = randomUUID();
  const instance = await db
    .insert(Instances)
    .values({
      domain: `${suffix}.example`,
      kind: instanceKind,
      state: instanceState,
    })
    .returning()
    .then(firstOrThrow);
  const profile = await db
    .insert(Profiles)
    .values({
      displayName: suffix,
      followPolicy,
      handle: suffix,
      instanceId: instance.id,
      normalizedHandle: suffix,
      state: profileState,
    })
    .returning()
    .then(firstOrThrow);

  if (withActor) {
    await db.insert(ActivityPubActors).values({
      inboxUri:
        actorInboxUri === undefined
          ? `https://${instance.domain}/users/${profile.handle}/inbox`
          : actorInboxUri,
      profileId: profile.id,
      type: ActivityPubActorType.PERSON,
      uri: `https://${instance.domain}/users/${profile.handle}`,
    });
  }

  return { instance, profile };
};

const createSourceFollow = async (followerProfileId: string, sourceProfileId: string) =>
  db
    .insert(ProfileFollows)
    .values({ followerProfileId, followeeProfileId: sourceProfileId })
    .returning()
    .then(firstOrThrow);

const countFollow = async (followerProfileId: string, followeeProfileId: string) =>
  db
    .select()
    .from(ProfileFollows)
    .where(
      and(
        eq(ProfileFollows.followerProfileId, followerProfileId),
        eq(ProfileFollows.followeeProfileId, followeeProfileId),
      ),
    )
    .then((rows) => rows.length);

const countFollowRequest = async (followerProfileId: string, followeeProfileId: string) =>
  db
    .select()
    .from(ProfileFollowRequests)
    .where(
      and(
        eq(ProfileFollowRequests.followerProfileId, followerProfileId),
        eq(ProfileFollowRequests.followeeProfileId, followeeProfileId),
      ),
    )
    .then((rows) => rows.length);

const runWithWorker = async <T>(operation: () => Promise<T>): Promise<T> => {
  const worker = await Worker.create({
    activities,
    connection: environment.nativeConnection,
    namespace: environment.namespace,
    taskQueue: KOSMO_TASK_QUEUE,
    workflowsPath,
  });
  return worker.runUntil(operation);
};

const executeMoveWorkflow = (sourceProfileId: string, targetProfileId: string) =>
  runWorkflow(profileMigrationMoveWorkflow, {
    args: [{ sourceProfileId, targetProfileId }],
    mode: 'execute',
    workflowIdConflictPolicy: 'USE_EXISTING',
    workflowIdReusePolicy: 'ALLOW_DUPLICATE',
  });

test('Move follower batch는 active Local established Follow만 keyset으로 읽는다', async () => {
  const source = await createProfile({ instanceKind: InstanceKind.ACTIVITYPUB });
  const target = await createProfile();
  await db.insert(ProfileMigrations).values({
    sourceProfileId: source.profile.id,
    targetProfileId: target.profile.id,
  });

  const firstFollower = await createProfile();
  const secondFollower = await createProfile();
  const remoteFollower = await createProfile({ instanceKind: InstanceKind.ACTIVITYPUB });
  const disabledFollower = await createProfile({ profileState: ProfileState.DISABLED });
  const firstFollow = await createSourceFollow(firstFollower.profile.id, source.profile.id);
  const secondFollow = await createSourceFollow(secondFollower.profile.id, source.profile.id);
  await createSourceFollow(remoteFollower.profile.id, source.profile.id);
  await createSourceFollow(disabledFollower.profile.id, source.profile.id);

  const firstBatch = await migrationActivities.loadProfileMigrationMoveFollowerBatchActivity({
    sourceProfileId: source.profile.id,
    targetProfileId: target.profile.id,
    limit: 1,
  });
  assert.equal(firstBatch.length, 1);
  assert.ok(firstBatch[0]);

  const secondBatch = await migrationActivities.loadProfileMigrationMoveFollowerBatchActivity({
    sourceProfileId: source.profile.id,
    targetProfileId: target.profile.id,
    afterSourceFollowId: firstBatch[0].sourceFollowId,
    limit: 1,
  });
  assert.equal(secondBatch.length, 1);
  assert.deepEqual(
    new Set([firstBatch[0].sourceFollowId, secondBatch[0]?.sourceFollowId]),
    new Set([firstFollow.id, secondFollow.id]),
  );
});

test('Move follower batch는 Local target 준비와 Remote target origin을 다시 검증한다', async () => {
  const source = await createProfile({ instanceKind: InstanceKind.ACTIVITYPUB });
  const follower = await createProfile();
  await createSourceFollow(follower.profile.id, source.profile.id);

  const unpreparedLocalTarget = await createProfile();
  assert.deepEqual(
    await migrationActivities.loadProfileMigrationMoveFollowerBatchActivity({
      sourceProfileId: source.profile.id,
      targetProfileId: unpreparedLocalTarget.profile.id,
    }),
    [],
  );

  const remoteTarget = await createProfile({
    instanceKind: InstanceKind.ACTIVITYPUB,
    withActor: false,
  });
  await db.insert(ActivityPubActors).values({
    profileId: remoteTarget.profile.id,
    type: ActivityPubActorType.PERSON,
    uri: `https://${remoteTarget.instance.domain}/users/${remoteTarget.profile.handle}`,
  });
  const remoteTargetBatch = await migrationActivities.loadProfileMigrationMoveFollowerBatchActivity(
    {
      sourceProfileId: source.profile.id,
      targetProfileId: remoteTarget.profile.id,
    },
  );
  assert.equal(remoteTargetBatch.length, 1);
  assert.equal(remoteTargetBatch[0]?.followerProfileId, follower.profile.id);

  const approvalTarget = await createProfile({
    followPolicy: ProfileFollowPolicy.APPROVAL_REQUIRED,
  });
  await db.insert(ProfileMigrations).values({
    sourceProfileId: source.profile.id,
    targetProfileId: approvalTarget.profile.id,
  });
  const approvalTargetBatch =
    await migrationActivities.loadProfileMigrationMoveFollowerBatchActivity({
      sourceProfileId: source.profile.id,
      targetProfileId: approvalTarget.profile.id,
    });
  assert.equal(approvalTargetBatch.length, 1);
  assert.equal(approvalTargetBatch[0]?.followerProfileId, follower.profile.id);
});

test('Move follower target 저장 실패는 source Follow를 보존한다', async () => {
  const source = await createProfile({ instanceKind: InstanceKind.ACTIVITYPUB });
  const target = await createProfile();
  const follower = await createProfile();
  await db.insert(ProfileMigrations).values({
    sourceProfileId: source.profile.id,
    targetProfileId: target.profile.id,
  });
  const sourceFollow = await createSourceFollow(follower.profile.id, source.profile.id);

  const batch = await migrationActivities.loadProfileMigrationMoveFollowerBatchActivity({
    sourceProfileId: source.profile.id,
    targetProfileId: target.profile.id,
  });
  assert.deepEqual(batch, [
    {
      followerProfileId: follower.profile.id,
      sourceFollowId: sourceFollow.id,
    },
  ]);

  await db
    .update(Instances)
    .set({ state: InstanceState.SUSPENDED })
    .where(eq(Instances.id, follower.instance.id));

  await assert.rejects(
    runWithWorker(() =>
      migrationActivities.executeProfileMigrationMoveFollowerActivity({
        sourceProfileId: source.profile.id,
        targetProfileId: target.profile.id,
        followerProfileId: follower.profile.id,
        sourceFollowId: sourceFollow.id,
      }),
    ),
    NotFoundError,
  );
  assert.deepEqual(
    await db.select().from(ProfileFollows).where(eq(ProfileFollows.id, sourceFollow.id)),
    [sourceFollow],
  );
  assert.equal(await countFollow(follower.profile.id, target.profile.id), 0);
});

test('Move follower는 기존 target Follow가 있으면 source Follow를 보존한다', async () => {
  const source = await createProfile({ instanceKind: InstanceKind.ACTIVITYPUB });
  const target = await createProfile();
  const follower = await createProfile();
  await db.insert(ProfileMigrations).values({
    sourceProfileId: source.profile.id,
    targetProfileId: target.profile.id,
  });
  const sourceFollow = await createSourceFollow(follower.profile.id, source.profile.id);
  await db.insert(ProfileFollows).values({
    followerProfileId: follower.profile.id,
    followeeProfileId: target.profile.id,
  });

  await migrationActivities.executeProfileMigrationMoveFollowerActivity({
    sourceProfileId: source.profile.id,
    targetProfileId: target.profile.id,
    followerProfileId: follower.profile.id,
    sourceFollowId: sourceFollow.id,
  });

  assert.deepEqual(
    await db.select().from(ProfileFollows).where(eq(ProfileFollows.id, sourceFollow.id)),
    [sourceFollow],
  );
  assert.equal(await countFollow(follower.profile.id, target.profile.id), 1);
});

test('Move follower는 concurrent target transition의 created false에서 source Follow를 보존한다', async () => {
  const source = await createProfile({ instanceKind: InstanceKind.ACTIVITYPUB });
  const target = await createProfile();
  const follower = await createProfile();
  await db.insert(ProfileMigrations).values({
    sourceProfileId: source.profile.id,
    targetProfileId: target.profile.id,
  });
  const sourceFollow = await createSourceFollow(follower.profile.id, source.profile.id);

  const transitionRpc = mock.method(
    temporalClient.workflow,
    'executeUpdateWithStart',
    async () => ({
      ok: true as const,
      result: {
        commandKind: 'FOLLOW' as const,
        created: false,
        kind: 'ESTABLISHED' as const,
        followerProfileId: follower.profile.id,
        followeeProfileId: target.profile.id,
      },
    }),
  );
  try {
    await migrationActivities.executeProfileMigrationMoveFollowerActivity({
      sourceProfileId: source.profile.id,
      targetProfileId: target.profile.id,
      followerProfileId: follower.profile.id,
      sourceFollowId: sourceFollow.id,
    });

    assert.equal(transitionRpc.mock.callCount(), 1);
    assert.deepEqual(
      await db.select().from(ProfileFollows).where(eq(ProfileFollows.id, sourceFollow.id)),
      [sourceFollow],
    );
  } finally {
    transitionRpc.mock.restore();
  }
});

test('반복 실행한 Move Workflow는 Local Open target에 Follow를 먼저 저장하고 source를 제거한다', async () => {
  const source = await createProfile({ instanceKind: InstanceKind.ACTIVITYPUB });
  const target = await createProfile();
  const follower = await createProfile();
  await db.insert(ProfileMigrations).values({
    sourceProfileId: source.profile.id,
    targetProfileId: target.profile.id,
  });
  const sourceFollow = await createSourceFollow(follower.profile.id, source.profile.id);

  const input = {
    sourceProfileId: source.profile.id,
    targetProfileId: target.profile.id,
  } as const;
  await runWithWorker(async () => {
    const handles = await Promise.all([
      runWorkflow(profileMigrationMoveWorkflow, {
        args: [input],
        mode: 'start',
        workflowIdConflictPolicy: 'USE_EXISTING',
        workflowIdReusePolicy: 'ALLOW_DUPLICATE',
      }),
      runWorkflow(profileMigrationMoveWorkflow, {
        args: [input],
        mode: 'start',
        workflowIdConflictPolicy: 'USE_EXISTING',
        workflowIdReusePolicy: 'ALLOW_DUPLICATE',
      }),
    ]);
    await Promise.all(handles.map((handle) => handle.result()));
  });

  assert.equal(
    await db
      .select()
      .from(ProfileFollows)
      .where(eq(ProfileFollows.id, sourceFollow.id))
      .then((rows) => rows.length),
    0,
  );
  assert.equal(await countFollow(follower.profile.id, target.profile.id), 1);
  assert.equal(await countFollowRequest(follower.profile.id, target.profile.id), 0);
});

test('실제 Move Workflow는 Local target 자신의 source Follow를 이전하지 않고 보존한다', async () => {
  const source = await createProfile({ instanceKind: InstanceKind.ACTIVITYPUB });
  const target = await createProfile();
  await db.insert(ProfileMigrations).values({
    sourceProfileId: source.profile.id,
    targetProfileId: target.profile.id,
  });
  const sourceFollow = await createSourceFollow(target.profile.id, source.profile.id);

  await runWithWorker(() => executeMoveWorkflow(source.profile.id, target.profile.id));

  assert.deepEqual(
    await db.select().from(ProfileFollows).where(eq(ProfileFollows.id, sourceFollow.id)),
    [sourceFollow],
  );
  assert.equal(await countFollow(target.profile.id, target.profile.id), 0);
  assert.equal(await countFollowRequest(target.profile.id, target.profile.id), 0);
});

test('실제 Move Workflow는 준비된 Local Approval target에 Follow Request를 저장하고 source를 제거한다', async () => {
  const source = await createProfile({ instanceKind: InstanceKind.ACTIVITYPUB });
  const target = await createProfile({ followPolicy: ProfileFollowPolicy.APPROVAL_REQUIRED });
  await db.insert(ProfileMigrations).values({
    sourceProfileId: source.profile.id,
    targetProfileId: target.profile.id,
  });
  const follower = await createProfile();
  const sourceFollow = await createSourceFollow(follower.profile.id, source.profile.id);

  await runWithWorker(() => executeMoveWorkflow(source.profile.id, target.profile.id));

  assert.equal(
    await db
      .select()
      .from(ProfileFollows)
      .where(eq(ProfileFollows.id, sourceFollow.id))
      .then((rows) => rows.length),
    0,
  );
  assert.equal(await countFollow(follower.profile.id, target.profile.id), 0);
  assert.equal(await countFollowRequest(follower.profile.id, target.profile.id), 1);
});

test('실제 Move Workflow는 Remote Open target에 Follow와 Undo effect를 예약한다', async () => {
  const source = await createProfile({ instanceKind: InstanceKind.ACTIVITYPUB });
  const target = await createProfile({ instanceKind: InstanceKind.ACTIVITYPUB });
  const follower = await createProfile();
  const sourceFollow = await createSourceFollow(follower.profile.id, source.profile.id);

  await runWithWorker(() => executeMoveWorkflow(source.profile.id, target.profile.id));

  assert.equal(
    await db
      .select()
      .from(ProfileFollows)
      .where(eq(ProfileFollows.id, sourceFollow.id))
      .then((rows) => rows.length),
    0,
  );
  assert.equal(await countFollow(follower.profile.id, target.profile.id), 1);
  assert.equal(await countFollowRequest(follower.profile.id, target.profile.id), 0);

  const pairHistory = await temporalClient.workflow
    .getHandle(
      profileFollowPairWorkflowId({
        followerProfileId: follower.profile.id,
        followeeProfileId: target.profile.id,
      }),
    )
    .fetchHistory();
  assert.ok(
    pairHistory.events?.some(
      (event) =>
        event.activityTaskScheduledEventAttributes?.activityType?.name ===
        'sendProfileFollowActivity',
    ),
  );

  const removalHistory = await temporalClient.workflow
    .getHandle(
      profileFollowRemovalWorkflowId({
        followerProfileId: follower.profile.id,
        followeeProfileId: source.profile.id,
        expectedRowId: sourceFollow.id,
      }),
    )
    .fetchHistory();
  assert.ok(
    removalHistory.events?.some(
      (event) =>
        event.activityTaskScheduledEventAttributes?.activityType?.name ===
        'sendProfileUnfollowActivity',
    ),
  );
});

test('실제 Move Workflow는 Remote Approval target에 Follow Request를 저장하고 source를 제거한다', async () => {
  const source = await createProfile({ instanceKind: InstanceKind.ACTIVITYPUB });
  const target = await createProfile({
    actorInboxUri: null,
    followPolicy: ProfileFollowPolicy.APPROVAL_REQUIRED,
    instanceKind: InstanceKind.ACTIVITYPUB,
  });
  const follower = await createProfile();
  const sourceFollow = await createSourceFollow(follower.profile.id, source.profile.id);

  await runWithWorker(() => executeMoveWorkflow(source.profile.id, target.profile.id));

  assert.equal(
    await db
      .select()
      .from(ProfileFollows)
      .where(eq(ProfileFollows.id, sourceFollow.id))
      .then((rows) => rows.length),
    0,
  );
  assert.equal(await countFollow(follower.profile.id, target.profile.id), 0);
  assert.equal(await countFollowRequest(follower.profile.id, target.profile.id), 1);
});

test('실제 Move Workflow는 기존 target Follow Request에서 source Follow를 보존한다', async () => {
  const source = await createProfile({ instanceKind: InstanceKind.ACTIVITYPUB });
  const target = await createProfile({
    actorInboxUri: null,
    followPolicy: ProfileFollowPolicy.APPROVAL_REQUIRED,
    instanceKind: InstanceKind.ACTIVITYPUB,
  });
  const follower = await createProfile();
  const sourceFollow = await createSourceFollow(follower.profile.id, source.profile.id);
  const existingRequest = await db
    .insert(ProfileFollowRequests)
    .values({
      followerProfileId: follower.profile.id,
      followeeProfileId: target.profile.id,
    })
    .returning()
    .then(firstOrThrow);

  await runWithWorker(() => executeMoveWorkflow(source.profile.id, target.profile.id));

  assert.equal(
    await db
      .select()
      .from(ProfileFollows)
      .where(eq(ProfileFollows.id, sourceFollow.id))
      .then((rows) => rows.length),
    1,
  );
  assert.equal(
    await db
      .select()
      .from(ProfileFollowRequests)
      .where(eq(ProfileFollowRequests.id, existingRequest.id))
      .then((rows) => rows.length),
    1,
  );
  assert.equal(await countFollow(follower.profile.id, target.profile.id), 0);
});
