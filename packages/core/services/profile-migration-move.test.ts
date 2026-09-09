import '@kosmo/core/polyfill';

import assert from 'node:assert/strict';
import { after, mock, test } from 'node:test';
import { and, eq, inArray, or } from 'drizzle-orm';
import {
  ActivityPubActors,
  db,
  firstOrThrow,
  Instances,
  pg,
  ProfileFollowRequests,
  ProfileFollows,
  ProfileMigrations,
  Profiles,
} from '../db';
import {
  ActivityPubActorType,
  InstanceKind,
  InstanceState,
  ProfileFollowPolicy,
  ProfileState,
} from '../enums';
import { NotFoundError } from '../error';
import { temporalClient } from '../temporal/client';
import {
  executeProfileFollowPairTransition,
  profileFollowPairWorkflowId,
  profileFollowRemovalWorkflowId,
} from '../temporal/follow-command';
import { KOSMO_TASK_QUEUE } from '../temporal/task-queue';
import {
  executeProfileMigrationMoveFollower,
  loadProfileMigrationMoveFollowerBatch,
} from './profile-migration-move';

const instanceIds: string[] = [];
const profileIds: string[] = [];
const followIds: string[] = [];

after(async () => {
  if (followIds.length > 0) {
    await db.delete(ProfileFollows).where(inArray(ProfileFollows.id, followIds));
  }
  if (profileIds.length > 0) {
    await db
      .delete(ProfileFollowRequests)
      .where(
        or(
          inArray(ProfileFollowRequests.followerProfileId, profileIds),
          inArray(ProfileFollowRequests.followeeProfileId, profileIds),
        ),
      );
    await db
      .delete(ProfileMigrations)
      .where(
        or(
          inArray(ProfileMigrations.sourceProfileId, profileIds),
          inArray(ProfileMigrations.targetProfileId, profileIds),
        ),
      );
    await db
      .delete(ProfileFollows)
      .where(
        or(
          inArray(ProfileFollows.followerProfileId, profileIds),
          inArray(ProfileFollows.followeeProfileId, profileIds),
        ),
      );
    await db.delete(Profiles).where(inArray(Profiles.id, profileIds));
  }
  if (instanceIds.length > 0) {
    await db.delete(Instances).where(inArray(Instances.id, instanceIds));
  }
  await pg.end();
});

const createProfile = async ({
  instanceKind = InstanceKind.LOCAL,
  instanceState = InstanceState.ACTIVE,
  followPolicy = ProfileFollowPolicy.OPEN,
  profileState = ProfileState.ACTIVE,
  withActor = instanceKind === InstanceKind.ACTIVITYPUB,
  actorInboxUri,
}: {
  instanceKind?: InstanceKind;
  instanceState?: InstanceState;
  followPolicy?: ProfileFollowPolicy;
  profileState?: ProfileState;
  withActor?: boolean;
  actorInboxUri?: string | null;
} = {}) => {
  const suffix = crypto.randomUUID();
  const instance = await db
    .insert(Instances)
    .values({
      domain: `${suffix}.example`,
      kind: instanceKind,
      state: instanceState,
    })
    .returning()
    .then(firstOrThrow);
  instanceIds.push(instance.id);

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
  profileIds.push(profile.id);

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

const createSourceFollow = async (followerProfileId: string, sourceProfileId: string) => {
  const follow = await db
    .insert(ProfileFollows)
    .values({ followerProfileId, followeeProfileId: sourceProfileId })
    .returning()
    .then(firstOrThrow);
  followIds.push(follow.id);
  return follow;
};

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

  const firstBatch = await loadProfileMigrationMoveFollowerBatch({
    sourceProfileId: source.profile.id,
    targetProfileId: target.profile.id,
    limit: 1,
  });
  assert.equal(firstBatch.length, 1);
  assert.ok(firstBatch[0]);

  const secondBatch = await loadProfileMigrationMoveFollowerBatch({
    sourceProfileId: source.profile.id,
    targetProfileId: target.profile.id,
    afterSourceFollowId: firstBatch[0].sourceFollowId,
    limit: 1,
  });
  assert.equal(secondBatch.length, 1);
  assert.notEqual(secondBatch[0]?.sourceFollowId, firstBatch[0].sourceFollowId);
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
    await loadProfileMigrationMoveFollowerBatch({
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
  const remoteTargetBatch = await loadProfileMigrationMoveFollowerBatch({
    sourceProfileId: source.profile.id,
    targetProfileId: remoteTarget.profile.id,
  });
  assert.equal(remoteTargetBatch.length, 1);
  assert.equal(remoteTargetBatch[0]?.followerProfileId, follower.profile.id);

  const approvalTarget = await createProfile({
    followPolicy: ProfileFollowPolicy.APPROVAL_REQUIRED,
  });
  await db.insert(ProfileMigrations).values({
    sourceProfileId: source.profile.id,
    targetProfileId: approvalTarget.profile.id,
  });
  const approvalTargetBatch = await loadProfileMigrationMoveFollowerBatch({
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

  const batch = await loadProfileMigrationMoveFollowerBatch({
    sourceProfileId: source.profile.id,
    targetProfileId: target.profile.id,
  });
  assert.deepEqual(batch, [
    {
      followerProfileId: follower.profile.id,
      sourceFollowId: sourceFollow.id,
    },
  ]);

  // The batch admission was committed, but target Follow admission now fails
  // through the real pair Workflow because the follower became unavailable.
  await db
    .update(Instances)
    .set({ state: InstanceState.SUSPENDED })
    .where(eq(Instances.id, follower.instance.id));

  await assert.rejects(
    executeProfileMigrationMoveFollower({
      sourceProfileId: source.profile.id,
      targetProfileId: target.profile.id,
      followerProfileId: follower.profile.id,
      sourceFollowId: sourceFollow.id,
    }),
    NotFoundError,
  );
  assert.deepEqual(
    await db.select().from(ProfileFollows).where(eq(ProfileFollows.id, sourceFollow.id)),
    [sourceFollow],
  );
  assert.equal(
    await db
      .select()
      .from(ProfileFollows)
      .where(
        and(
          eq(ProfileFollows.followerProfileId, follower.profile.id),
          eq(ProfileFollows.followeeProfileId, target.profile.id),
        ),
      )
      .then((rows) => rows.length),
    0,
  );
});

test('Move follower는 Remote source의 target 저장 뒤 cleanup RPC 실패를 재시도한다', async () => {
  const source = await createProfile({ instanceKind: InstanceKind.ACTIVITYPUB });
  const target = await createProfile();
  const follower = await createProfile();
  await db.insert(ProfileMigrations).values({
    sourceProfileId: source.profile.id,
    targetProfileId: target.profile.id,
  });
  const sourceFollow = await createSourceFollow(follower.profile.id, source.profile.id);

  const targetTransition = await executeProfileFollowPairTransition({
    pair: {
      followerProfileId: follower.profile.id,
      followeeProfileId: target.profile.id,
    },
    command: { kind: 'FOLLOW', origin: 'LOCAL' },
  });
  if (targetTransition.result.commandKind !== 'FOLLOW') {
    throw new Error('Unexpected target Profile Follow transition result');
  }
  assert.equal(targetTransition.result.kind, 'ESTABLISHED');
  assert.equal(
    await db
      .select()
      .from(ProfileFollows)
      .where(
        and(
          eq(ProfileFollows.followerProfileId, follower.profile.id),
          eq(ProfileFollows.followeeProfileId, target.profile.id),
        ),
      )
      .then((rows) => rows.length),
    1,
  );

  // The target Follow is already committed. Fail only the cleanup RPC before
  // it reaches Temporal, then restore the real client for the retry.
  const removalRpc = mock.method(temporalClient.workflow, 'executeUpdateWithStart', async () => {
    throw new Error('temporary source removal RPC failure');
  });
  try {
    await assert.rejects(
      executeProfileMigrationMoveFollower({
        sourceProfileId: source.profile.id,
        targetProfileId: target.profile.id,
        followerProfileId: follower.profile.id,
        sourceFollowId: sourceFollow.id,
      }),
      /temporary source removal RPC failure/,
    );
    assert.equal(removalRpc.mock.calls.length, 1);
  } finally {
    removalRpc.mock.restore();
  }

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
      .from(ProfileFollows)
      .where(
        and(
          eq(ProfileFollows.followerProfileId, follower.profile.id),
          eq(ProfileFollows.followeeProfileId, target.profile.id),
        ),
      )
      .then((rows) => rows.length),
    1,
  );

  await executeProfileMigrationMoveFollower({
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
    0,
  );
  assert.equal(
    await db
      .select()
      .from(ProfileFollows)
      .where(
        and(
          eq(ProfileFollows.followerProfileId, follower.profile.id),
          eq(ProfileFollows.followeeProfileId, target.profile.id),
        ),
      )
      .then((rows) => rows.length),
    1,
  );
});

const executeMoveWorkflow = async (sourceProfileId: string, targetProfileId: string) =>
  temporalClient.workflow.execute('profileMigrationMoveWorkflow', {
    args: [{ sourceProfileId, targetProfileId }],
    taskQueue: KOSMO_TASK_QUEUE,
    workflowId: `profile-migration-move-integration:${crypto.randomUUID()}`,
  });

test('실제 Move Workflow는 Local Open target에 Follow를 먼저 저장하고 source를 제거한다', async () => {
  const source = await createProfile({ instanceKind: InstanceKind.ACTIVITYPUB });
  const target = await createProfile();
  const follower = await createProfile();
  await db.insert(ProfileMigrations).values({
    sourceProfileId: source.profile.id,
    targetProfileId: target.profile.id,
  });
  const sourceFollow = await createSourceFollow(follower.profile.id, source.profile.id);

  await executeMoveWorkflow(source.profile.id, target.profile.id);

  assert.equal(
    await db
      .select()
      .from(ProfileFollows)
      .where(eq(ProfileFollows.id, sourceFollow.id))
      .then((rows) => rows.length),
    0,
  );
  assert.equal(
    await db
      .select()
      .from(ProfileFollows)
      .where(
        and(
          eq(ProfileFollows.followerProfileId, follower.profile.id),
          eq(ProfileFollows.followeeProfileId, target.profile.id),
        ),
      )
      .then((rows) => rows.length),
    1,
  );
  assert.equal(
    await db
      .select()
      .from(ProfileFollowRequests)
      .where(
        and(
          eq(ProfileFollowRequests.followerProfileId, follower.profile.id),
          eq(ProfileFollowRequests.followeeProfileId, target.profile.id),
        ),
      )
      .then((rows) => rows.length),
    0,
  );
});

test('실제 Move Workflow는 Remote Open target에 Follow와 Undo effect를 예약한다', async () => {
  const source = await createProfile({ instanceKind: InstanceKind.ACTIVITYPUB });
  const target = await createProfile({ instanceKind: InstanceKind.ACTIVITYPUB });
  const follower = await createProfile();
  const sourceFollow = await createSourceFollow(follower.profile.id, source.profile.id);

  await executeMoveWorkflow(source.profile.id, target.profile.id);

  assert.equal(
    await db
      .select()
      .from(ProfileFollows)
      .where(eq(ProfileFollows.id, sourceFollow.id))
      .then((rows) => rows.length),
    0,
  );
  assert.equal(
    await db
      .select()
      .from(ProfileFollows)
      .where(
        and(
          eq(ProfileFollows.followerProfileId, follower.profile.id),
          eq(ProfileFollows.followeeProfileId, target.profile.id),
        ),
      )
      .then((rows) => rows.length),
    1,
  );
  assert.equal(
    await db
      .select()
      .from(ProfileFollowRequests)
      .where(
        and(
          eq(ProfileFollowRequests.followerProfileId, follower.profile.id),
          eq(ProfileFollowRequests.followeeProfileId, target.profile.id),
        ),
      )
      .then((rows) => rows.length),
    0,
  );

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

  await executeMoveWorkflow(source.profile.id, target.profile.id);

  assert.equal(
    await db
      .select()
      .from(ProfileFollows)
      .where(eq(ProfileFollows.id, sourceFollow.id))
      .then((rows) => rows.length),
    0,
  );
  assert.equal(
    await db
      .select()
      .from(ProfileFollows)
      .where(
        and(
          eq(ProfileFollows.followerProfileId, follower.profile.id),
          eq(ProfileFollows.followeeProfileId, target.profile.id),
        ),
      )
      .then((rows) => rows.length),
    0,
  );
  assert.equal(
    await db
      .select()
      .from(ProfileFollowRequests)
      .where(
        and(
          eq(ProfileFollowRequests.followerProfileId, follower.profile.id),
          eq(ProfileFollowRequests.followeeProfileId, target.profile.id),
        ),
      )
      .then((rows) => rows.length),
    1,
  );
});

test('실제 Move Workflow는 기존 target Follow Request에서 source removal로 수렴한다', async () => {
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

  await executeMoveWorkflow(source.profile.id, target.profile.id);

  assert.equal(
    await db
      .select()
      .from(ProfileFollows)
      .where(eq(ProfileFollows.id, sourceFollow.id))
      .then((rows) => rows.length),
    0,
  );
  assert.equal(
    await db
      .select()
      .from(ProfileFollowRequests)
      .where(eq(ProfileFollowRequests.id, existingRequest.id))
      .then((rows) => rows.length),
    1,
  );
  assert.equal(
    await db
      .select()
      .from(ProfileFollows)
      .where(
        and(
          eq(ProfileFollows.followerProfileId, follower.profile.id),
          eq(ProfileFollows.followeeProfileId, target.profile.id),
        ),
      )
      .then((rows) => rows.length),
    0,
  );
});
