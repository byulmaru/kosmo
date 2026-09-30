import '@kosmo/core/polyfill';

import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { after, beforeEach, mock, test } from 'node:test';
import { Group, Person } from '@fedify/vocab';
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

const publicOrigin = 'http://127.0.0.1:4173';
process.env.DATABASE_URL ??= 'postgres://kosmo:kosmo@localhost:54329/kosmo_test';
process.env.PUBLIC_ORIGIN = publicOrigin;

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
    ProfileBlocks,
    ProfileFollowRequests,
    ProfileFollows,
    ProfileMigrations,
    Profiles,
  },
  { seedDatabase },
  { profileMigrationMoveWorkflow },
  { runWorkflow, temporalClient },
  { profileFollowPairWorkflowId, profileFollowRemovalWorkflowId },
  activities,
  migrationActivities,
  { prepareProfileMigration, unregisterProfileMigrationSource },
  { federation, setInboundObservabilityReporter },
] = await Promise.all([
  import('@kosmo/core/db'),
  import('@kosmo/core/db/seed'),
  import('@kosmo/core/temporal/profile-migration'),
  import('@kosmo/core/temporal/client'),
  import('@kosmo/core/temporal/follow-command'),
  import('./activities'),
  import('./profile-migration-activities'),
  import('@kosmo/core/services'),
  import('@kosmo/fedify'),
]);

const workflowsPath = new URL('./workflows/index.ts', import.meta.url).pathname;

const truncateDatabase = () =>
  pg.unsafe(
    'TRUNCATE TABLE profile_follow_request, profile_follow, profile_migration, profile, instance CASCADE',
  );

let localInstanceId: string;

beforeEach(async () => {
  await truncateDatabase();
  ({
    localInstance: { id: localInstanceId },
  } = await seedDatabase({ publicOrigin }));
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
  actorUri,
  instanceId,
}: {
  readonly instanceKind?: InstanceKind;
  readonly instanceState?: InstanceState;
  readonly followPolicy?: ProfileFollowPolicy;
  readonly profileState?: ProfileState;
  readonly withActor?: boolean;
  readonly actorInboxUri?: string | null;
  readonly actorUri?: string;
  readonly instanceId?: string;
} = {}) => {
  const suffix = randomUUID();
  const instance = instanceId
    ? await db.select().from(Instances).where(eq(Instances.id, instanceId)).then(firstOrThrow)
    : await db
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
      uri: actorUri ?? `https://${instance.domain}/users/${profile.handle}`,
    });
  }

  return {
    actorUri: withActor
      ? (actorUri ?? `https://${instance.domain}/users/${profile.handle}`)
      : undefined,
    instance,
    profile,
  };
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

const executeMoveWorkflow = (sourceActorUri: string, targetActorUri: string) =>
  runWorkflow(profileMigrationMoveWorkflow, {
    args: [{ sourceActorUri, targetActorUri }],
    mode: 'execute',
    workflowIdConflictPolicy: 'USE_EXISTING',
    workflowIdReusePolicy: 'ALLOW_DUPLICATE',
  });

const runPreparationActivity = async (
  input: { sourceActorUri: string; targetActorUri: string },
  lookupObject: (identifier: string | URL) => Promise<unknown>,
) => {
  const contextCreation = mock.method(federation, 'createContext', (origin: URL) => {
    assert.equal(origin.origin, process.env.PUBLIC_ORIGIN);
    return { lookupObject } as never;
  });
  try {
    return await runWithWorker(() =>
      migrationActivities.prepareProfileMigrationMoveActivity(input),
    );
  } finally {
    contextCreation.mock.restore();
  }
};

const createMoveActor = (actorUri: string, aliases: readonly string[] = []) => {
  const id = new URL(actorUri);
  return new Person({
    id,
    preferredUsername: id.pathname.split('/').at(-1) ?? 'profile',
    aliases: aliases.map((alias) => new URL(alias)),
  });
};

const createMoveGroup = (actorUri: string, aliases: readonly string[] = []) => {
  const id = new URL(actorUri);
  return new Group({
    id,
    preferredUsername: id.pathname.split('/').at(-1) ?? 'group',
    aliases: aliases.map((alias) => new URL(alias)),
  });
};

test('prepared Local Move target returns stored Profile IDs without remote lookup', async () => {
  const source = await createProfile({ instanceKind: InstanceKind.ACTIVITYPUB });
  const targetActorUri = new URL('/ap/actor/local-target', publicOrigin).href;
  const target = await createProfile({
    actorUri: targetActorUri,
    instanceId: localInstanceId,
    instanceKind: InstanceKind.LOCAL,
    withActor: true,
  });
  await db.insert(ProfileMigrations).values({
    sourceProfileId: source.profile.id,
    targetProfileId: target.profile.id,
  });

  const result = await runPreparationActivity(
    { sourceActorUri: source.actorUri!, targetActorUri },
    async () => {
      throw new Error('prepared Local target must not be fetched');
    },
  );

  assert.deepEqual(result, {
    sourceProfileId: source.profile.id,
    targetProfileId: target.profile.id,
  });
  assert.equal(await db.$count(Profiles), 2);
});

test('prepared Local Move still rejects unavailable source Profiles and preserves unresponsive source state', async () => {
  const observations: Array<{ outcome: string; reasonCode: string }> = [];
  const restoreReporter = setInboundObservabilityReporter({
    log: ({ outcome, reasonCode }) => observations.push({ outcome, reasonCode }),
  });

  try {
    for (const sourceState of [
      { profileState: ProfileState.DISABLED },
      { instanceState: InstanceState.SUSPENDED },
    ]) {
      const source = await createProfile({
        instanceKind: InstanceKind.ACTIVITYPUB,
        ...sourceState,
      });
      const targetActorUri = new URL(`/ap/actor/${randomUUID()}`, publicOrigin).href;
      const target = await createProfile({
        actorUri: targetActorUri,
        instanceId: localInstanceId,
        instanceKind: InstanceKind.LOCAL,
        withActor: true,
      });
      await db.insert(ProfileMigrations).values({
        sourceProfileId: source.profile.id,
        targetProfileId: target.profile.id,
      });

      const result = await runPreparationActivity(
        { sourceActorUri: source.actorUri!, targetActorUri },
        async () => {
          throw new Error('stored source must not be fetched');
        },
      );
      assert.equal(result, null);
    }

    const source = await createProfile({
      instanceKind: InstanceKind.ACTIVITYPUB,
      instanceState: InstanceState.UNRESPONSIVE,
    });
    const targetActorUri = new URL(`/ap/actor/${randomUUID()}`, publicOrigin).href;
    const target = await createProfile({
      actorUri: targetActorUri,
      instanceId: localInstanceId,
      instanceKind: InstanceKind.LOCAL,
      withActor: true,
    });
    await db.insert(ProfileMigrations).values({
      sourceProfileId: source.profile.id,
      targetProfileId: target.profile.id,
    });

    const result = await runPreparationActivity(
      { sourceActorUri: source.actorUri!, targetActorUri },
      async () => {
        throw new Error('stored source must not be fetched');
      },
    );
    assert.deepEqual(result, {
      sourceProfileId: source.profile.id,
      targetProfileId: target.profile.id,
    });
    assert.equal(
      await db
        .select({ state: Instances.state })
        .from(Instances)
        .where(eq(Instances.id, source.instance.id))
        .then((rows) => rows[0]?.state),
      InstanceState.UNRESPONSIVE,
    );
  } finally {
    restoreReporter();
  }

  assert.deepEqual(observations, [
    { outcome: 'rejected', reasonCode: 'move_source_materialization_rejected' },
    { outcome: 'rejected', reasonCode: 'move_source_materialization_rejected' },
  ]);
});

test('unprepared same-origin Move target is rejected before source materialization', async () => {
  const sourceActorUri = 'https://source.example/users/missing';
  const targetActorUri = new URL('/ap/actor/unprepared', publicOrigin).href;
  const target = await createProfile({
    actorUri: targetActorUri,
    instanceId: localInstanceId,
    instanceKind: InstanceKind.LOCAL,
    withActor: true,
  });
  const observations: Array<{ outcome: string; reasonCode: string }> = [];
  const restoreReporter = setInboundObservabilityReporter({
    log: ({ outcome, reasonCode }) => observations.push({ outcome, reasonCode }),
  });

  try {
    const result = await runPreparationActivity(
      { sourceActorUri: sourceActorUri, targetActorUri },
      async () => {
        throw new Error('unprepared Local target must not be fetched');
      },
    );
    assert.equal(result, null);

    const preparedSource = await createProfile({ instanceKind: InstanceKind.ACTIVITYPUB });
    const differentSource = await createProfile({ instanceKind: InstanceKind.ACTIVITYPUB });
    await db.insert(ProfileMigrations).values({
      sourceProfileId: preparedSource.profile.id,
      targetProfileId: target.profile.id,
    });

    const differentSourceResult = await runPreparationActivity(
      { sourceActorUri: differentSource.actorUri!, targetActorUri },
      async () => {
        throw new Error('a Local target prepared for another source must not be fetched');
      },
    );
    assert.equal(differentSourceResult, null);
  } finally {
    restoreReporter();
  }

  assert.equal(await db.$count(Profiles), 3);
  assert.deepEqual(observations, [
    { outcome: 'rejected', reasonCode: 'move_local_target_not_prepared' },
    { outcome: 'rejected', reasonCode: 'move_local_target_not_prepared' },
  ]);
});

test('remote Move target requires exact Actor identity and reverse alias before source materialization', async () => {
  const sourceActorUri = 'https://source.example/users/alice';
  const targetActorUri = 'https://target.example/users/alice';
  const observations: Array<{ outcome: string; reasonCode: string }> = [];
  const restoreReporter = setInboundObservabilityReporter({
    log: ({ outcome, reasonCode }) => observations.push({ outcome, reasonCode }),
  });

  try {
    const mismatchedActorResult = await runPreparationActivity(
      { sourceActorUri, targetActorUri },
      async () => createMoveActor('https://attacker.example/users/forged', [sourceActorUri]),
    );
    assert.equal(mismatchedActorResult, null);

    const missingAliasResult = await runPreparationActivity(
      { sourceActorUri, targetActorUri },
      async () => createMoveActor(targetActorUri, ['https://attacker.example/users/forged']),
    );
    assert.equal(missingAliasResult, null);
  } finally {
    restoreReporter();
  }

  assert.equal(await db.$count(Profiles), 0);
  assert.deepEqual(observations, [
    { outcome: 'rejected', reasonCode: 'move_target_not_matching_actor' },
    { outcome: 'rejected', reasonCode: 'move_target_alias_missing' },
  ]);
});

test('remote Move target is materialized before the source after alias validation', async () => {
  const sourceActorUri = 'https://source.example/users/alice';
  const targetActorUri = 'https://target.example/users/alice';
  const lookups: string[] = [];
  const result = await runPreparationActivity(
    { sourceActorUri, targetActorUri },
    async (identifier) => {
      const uri = identifier.toString();
      lookups.push(uri);
      return uri === targetActorUri
        ? createMoveGroup(targetActorUri, [sourceActorUri])
        : createMoveActor(sourceActorUri);
    },
  );

  assert.ok(result);
  assert.deepEqual(lookups, [targetActorUri, targetActorUri, sourceActorUri]);
  assert.equal(await db.$count(Profiles), 2);
  assert.equal(
    await db
      .select()
      .from(ActivityPubActors)
      .where(eq(ActivityPubActors.uri, targetActorUri))
      .then((rows) => rows[0]?.type),
    ActivityPubActorType.GROUP,
  );
});

test('remote Move target lookup returning null stays retryable', async () => {
  const result = runPreparationActivity(
    {
      sourceActorUri: 'https://source.example/users/alice',
      targetActorUri: 'https://target.example/users/alice',
    },
    async () => null,
  );

  await assert.rejects(result, (error: unknown) => {
    assert.ok(error instanceof Error);
    assert.equal('nonRetryable' in error && error.nonRetryable === true, false);
    return true;
  });
  assert.equal(await db.$count(Profiles), 0);
});

test('remote target materialization lookup retries a null result before source materialization', async () => {
  const sourceActorUri = 'https://source.example/users/alice';
  const targetActorUri = 'https://target.example/users/alice';
  const lookups: string[] = [];
  let targetLookups = 0;
  const result = await runPreparationActivity(
    { sourceActorUri, targetActorUri },
    async (identifier) => {
      const uri = identifier.toString();
      lookups.push(uri);
      if (uri === targetActorUri) {
        targetLookups += 1;
        return targetLookups === 2 ? null : createMoveActor(targetActorUri, [sourceActorUri]);
      }
      return createMoveActor(sourceActorUri);
    },
  );

  assert.ok(result);
  assert.deepEqual(lookups, [targetActorUri, targetActorUri, targetActorUri, sourceActorUri]);
  assert.equal(await db.$count(Profiles), 2);
  assert.equal(await db.$count(ActivityPubActors), 2);
});

test('source materialization lookup retries a null result after target materialization', async () => {
  const sourceActorUri = 'https://source.example/users/alice';
  const targetActorUri = 'https://target.example/users/alice';
  const lookups: string[] = [];
  let sourceLookups = 0;
  const result = await runPreparationActivity(
    { sourceActorUri, targetActorUri },
    async (identifier) => {
      const uri = identifier.toString();
      lookups.push(uri);
      if (uri === targetActorUri) {
        return createMoveActor(targetActorUri, [sourceActorUri]);
      }
      sourceLookups += 1;
      return sourceLookups === 1 ? null : createMoveActor(sourceActorUri);
    },
  );

  assert.ok(result);
  assert.deepEqual(lookups, [targetActorUri, targetActorUri, sourceActorUri, sourceActorUri]);
  assert.equal(await db.$count(Profiles), 2);
  assert.equal(await db.$count(ActivityPubActors), 2);
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

test('unregistering a prepared migration preserves processed followers and rejects pending source follows', async () => {
  const source = await createProfile({ instanceKind: InstanceKind.ACTIVITYPUB });
  const target = await createProfile({
    actorUri: new URL(`/ap/actor/${randomUUID()}`, publicOrigin).href,
    instanceId: localInstanceId,
    instanceKind: InstanceKind.LOCAL,
    withActor: true,
  });
  const completedFollowFollower = await createProfile();
  const completedRequestFollower = await createProfile();
  const pendingFollower = await createProfile();
  await prepareProfileMigration({
    sourceProfileId: source.profile.id,
    targetProfileId: target.profile.id,
  });
  await Promise.all([
    createSourceFollow(completedFollowFollower.profile.id, source.profile.id),
    createSourceFollow(completedRequestFollower.profile.id, source.profile.id),
    createSourceFollow(pendingFollower.profile.id, source.profile.id),
  ]);

  const initialBatch = await migrationActivities.loadProfileMigrationMoveFollowerBatchActivity({
    sourceProfileId: source.profile.id,
    targetProfileId: target.profile.id,
  });
  assert.equal(initialBatch.length, 3);

  const followMove = initialBatch.find(
    ({ followerProfileId }) => followerProfileId === completedFollowFollower.profile.id,
  );
  assert.ok(followMove);
  await runWithWorker(() =>
    migrationActivities.executeProfileMigrationMoveFollowerActivity({
      ...followMove,
      sourceProfileId: source.profile.id,
      targetProfileId: target.profile.id,
    }),
  );

  await db
    .update(Profiles)
    .set({ followPolicy: ProfileFollowPolicy.APPROVAL_REQUIRED })
    .where(eq(Profiles.id, target.profile.id));
  const requestMove = (
    await migrationActivities.loadProfileMigrationMoveFollowerBatchActivity({
      sourceProfileId: source.profile.id,
      targetProfileId: target.profile.id,
    })
  ).find(({ followerProfileId }) => followerProfileId === completedRequestFollower.profile.id);
  assert.ok(requestMove);
  await runWithWorker(() =>
    migrationActivities.executeProfileMigrationMoveFollowerActivity({
      ...requestMove,
      sourceProfileId: source.profile.id,
      targetProfileId: target.profile.id,
    }),
  );

  const [pendingMove] = await migrationActivities.loadProfileMigrationMoveFollowerBatchActivity({
    sourceProfileId: source.profile.id,
    targetProfileId: target.profile.id,
  });
  assert.ok(pendingMove);
  assert.equal(pendingMove.followerProfileId, pendingFollower.profile.id);
  assert.equal(await countFollow(completedFollowFollower.profile.id, target.profile.id), 1);
  assert.equal(await countFollowRequest(completedRequestFollower.profile.id, target.profile.id), 1);

  await unregisterProfileMigrationSource({ targetProfileId: target.profile.id });

  assert.deepEqual(
    await migrationActivities.loadProfileMigrationMoveFollowerBatchActivity({
      sourceProfileId: source.profile.id,
      targetProfileId: target.profile.id,
    }),
    [],
  );
  await runWithWorker(() =>
    migrationActivities.executeProfileMigrationMoveFollowerActivity({
      ...pendingMove,
      sourceProfileId: source.profile.id,
      targetProfileId: target.profile.id,
    }),
  );
  assert.equal(await countFollow(pendingFollower.profile.id, source.profile.id), 1);
  assert.equal(await countFollow(pendingFollower.profile.id, target.profile.id), 0);
  assert.equal(await countFollowRequest(pendingFollower.profile.id, target.profile.id), 0);
  assert.equal(await countFollow(completedFollowFollower.profile.id, target.profile.id), 1);
  assert.equal(await countFollowRequest(completedRequestFollower.profile.id, target.profile.id), 1);

  const replacementSource = await createProfile({ instanceKind: InstanceKind.ACTIVITYPUB });
  const replacementFollower = await createProfile();
  const replacementSourceFollow = await createSourceFollow(
    replacementFollower.profile.id,
    replacementSource.profile.id,
  );
  await prepareProfileMigration({
    sourceProfileId: replacementSource.profile.id,
    targetProfileId: target.profile.id,
  });

  assert.deepEqual(
    await migrationActivities.loadProfileMigrationMoveFollowerBatchActivity({
      sourceProfileId: source.profile.id,
      targetProfileId: target.profile.id,
    }),
    [],
  );
  assert.deepEqual(
    await migrationActivities.loadProfileMigrationMoveFollowerBatchActivity({
      sourceProfileId: replacementSource.profile.id,
      targetProfileId: target.profile.id,
    }),
    [
      {
        followerProfileId: replacementFollower.profile.id,
        sourceFollowId: replacementSourceFollow.id,
      },
    ],
  );
  await runWithWorker(() =>
    migrationActivities.executeProfileMigrationMoveFollowerActivity({
      ...pendingMove,
      sourceProfileId: source.profile.id,
      targetProfileId: target.profile.id,
    }),
  );
  assert.equal(await countFollow(pendingFollower.profile.id, source.profile.id), 1);
  assert.equal(await countFollow(pendingFollower.profile.id, target.profile.id), 0);
  assert.equal(await countFollowRequest(pendingFollower.profile.id, target.profile.id), 0);
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

test('Move Workflow는 target Block follower만 건너뛰고 다음 follower와 cursor 처리를 계속한다', async () => {
  const source = await createProfile({ instanceKind: InstanceKind.ACTIVITYPUB });
  const target = await createProfile({
    actorUri: new URL('/ap/actor/' + randomUUID(), publicOrigin).href,
    instanceId: localInstanceId,
    instanceKind: InstanceKind.LOCAL,
    withActor: true,
  });
  const followers = [await createProfile(), await createProfile()];
  await db.insert(ProfileMigrations).values({
    sourceProfileId: source.profile.id,
    targetProfileId: target.profile.id,
  });
  await Promise.all(
    followers.map(({ profile }) => createSourceFollow(profile.id, source.profile.id)),
  );
  const batch = await migrationActivities.loadProfileMigrationMoveFollowerBatchActivity({
    sourceProfileId: source.profile.id,
    targetProfileId: target.profile.id,
  });
  assert.equal(batch.length, 2);
  const [blockedFollower, laterFollower] = batch;
  assert.ok(blockedFollower);
  assert.ok(laterFollower);
  await db.insert(ProfileBlocks).values({
    ownerProfileId: blockedFollower.followerProfileId,
    targetProfileId: target.profile.id,
  });

  await runWithWorker(() => executeMoveWorkflow(source.actorUri!, target.actorUri!));

  assert.equal(await countFollow(blockedFollower.followerProfileId, target.profile.id), 0);
  assert.equal(await countFollow(blockedFollower.followerProfileId, source.profile.id), 1);
  assert.equal(await countFollow(laterFollower.followerProfileId, target.profile.id), 1);
  assert.equal(await countFollow(laterFollower.followerProfileId, source.profile.id), 0);
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

  const transitionRpc = mock.method(temporalClient.workflow, 'executeUpdateWithStart', async () => {
    const targetFollow = await db
      .insert(ProfileFollows)
      .values({ followerProfileId: follower.profile.id, followeeProfileId: target.profile.id })
      .returning()
      .then(firstOrThrow);
    return {
      ok: true as const,
      result: {
        commandKind: 'FOLLOW' as const,
        created: false,
        kind: 'ESTABLISHED' as const,
        followerProfileId: follower.profile.id,
        followeeProfileId: target.profile.id,
        profileFollowId: targetFollow.id,
      },
    };
  });
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
    assert.equal(await countFollow(follower.profile.id, target.profile.id), 1);
  } finally {
    transitionRpc.mock.restore();
  }
});

test('동시 실행한 Move Workflow는 URI admission 뒤 Local Open target에 Follow를 먼저 저장하고 source를 제거한다', async () => {
  const source = await createProfile({ instanceKind: InstanceKind.ACTIVITYPUB });
  const target = await createProfile({
    actorUri: new URL(`/ap/actor/${randomUUID()}`, publicOrigin).href,
    instanceId: localInstanceId,
    instanceKind: InstanceKind.LOCAL,
    withActor: true,
  });
  const follower = await createProfile();
  await db.insert(ProfileMigrations).values({
    sourceProfileId: source.profile.id,
    targetProfileId: target.profile.id,
  });
  const sourceFollow = await createSourceFollow(follower.profile.id, source.profile.id);
  const input = { sourceActorUri: source.actorUri!, targetActorUri: target.actorUri! } as const;

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

test('Move follower Activity는 Local target 자신의 source Follow를 이전하지 않고 보존한다', async () => {
  const source = await createProfile({ instanceKind: InstanceKind.ACTIVITYPUB });
  const target = await createProfile();
  await db.insert(ProfileMigrations).values({
    sourceProfileId: source.profile.id,
    targetProfileId: target.profile.id,
  });
  const sourceFollow = await createSourceFollow(target.profile.id, source.profile.id);

  await migrationActivities.executeProfileMigrationMoveFollowerActivity({
    sourceProfileId: source.profile.id,
    targetProfileId: target.profile.id,
    followerProfileId: target.profile.id,
    sourceFollowId: sourceFollow.id,
  });

  assert.deepEqual(
    await db.select().from(ProfileFollows).where(eq(ProfileFollows.id, sourceFollow.id)),
    [sourceFollow],
  );
  assert.equal(await countFollow(target.profile.id, target.profile.id), 0);
  assert.equal(await countFollowRequest(target.profile.id, target.profile.id), 0);
});

test('실제 Move Workflow는 준비된 Local Approval target에 Follow Request를 저장하고 source를 제거한다', async () => {
  const source = await createProfile({ instanceKind: InstanceKind.ACTIVITYPUB });
  const target = await createProfile({
    actorUri: new URL(`/ap/actor/${randomUUID()}`, publicOrigin).href,
    followPolicy: ProfileFollowPolicy.APPROVAL_REQUIRED,
    instanceId: localInstanceId,
    instanceKind: InstanceKind.LOCAL,
    withActor: true,
  });
  await db.insert(ProfileMigrations).values({
    sourceProfileId: source.profile.id,
    targetProfileId: target.profile.id,
  });
  const follower = await createProfile();
  const sourceFollow = await createSourceFollow(follower.profile.id, source.profile.id);

  await runWithWorker(() => executeMoveWorkflow(source.actorUri!, target.actorUri!));

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

test('Move follower Activity는 Remote Open target에 Follow와 Undo effect를 예약한다', async () => {
  const source = await createProfile({ instanceKind: InstanceKind.ACTIVITYPUB });
  const target = await createProfile({ instanceKind: InstanceKind.ACTIVITYPUB });
  const follower = await createProfile();
  const sourceFollow = await createSourceFollow(follower.profile.id, source.profile.id);

  await runWithWorker(() =>
    migrationActivities.executeProfileMigrationMoveFollowerActivity({
      sourceProfileId: source.profile.id,
      targetProfileId: target.profile.id,
      followerProfileId: follower.profile.id,
      sourceFollowId: sourceFollow.id,
    }),
  );

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

test('Move follower Activity는 Remote Approval target에 Follow Request를 저장하고 source를 제거한다', async () => {
  const source = await createProfile({ instanceKind: InstanceKind.ACTIVITYPUB });
  const target = await createProfile({
    actorInboxUri: null,
    followPolicy: ProfileFollowPolicy.APPROVAL_REQUIRED,
    instanceKind: InstanceKind.ACTIVITYPUB,
  });
  const follower = await createProfile();
  const sourceFollow = await createSourceFollow(follower.profile.id, source.profile.id);

  await runWithWorker(() =>
    migrationActivities.executeProfileMigrationMoveFollowerActivity({
      sourceProfileId: source.profile.id,
      targetProfileId: target.profile.id,
      followerProfileId: follower.profile.id,
      sourceFollowId: sourceFollow.id,
    }),
  );

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

test('Move follower Activity는 기존 target Follow Request에서 source Follow를 보존한다', async () => {
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

  await migrationActivities.executeProfileMigrationMoveFollowerActivity({
    sourceProfileId: source.profile.id,
    targetProfileId: target.profile.id,
    followerProfileId: follower.profile.id,
    sourceFollowId: sourceFollow.id,
  });

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
