import assert from 'node:assert/strict';
import { after, afterEach, test } from 'node:test';
import { and, eq, inArray } from 'drizzle-orm';
import {
  db,
  firstOrThrow,
  Instances,
  pg,
  ProfileBlockActivities,
  ProfileBlocks,
  Profiles,
} from '../db';
import { InstanceKind, InstanceState, ProfileFollowPolicy, ProfileState } from '../enums';
import {
  executeProfileBlockTransition,
  loadProfileBlockTransitionBootstrap,
} from './profile-block';
import {
  finalizeProfileBlockProtocolUndo,
  prepareProfileBlockProtocolUndo,
  recordProfileBlockProtocolTombstone,
} from './profile-block-protocol';

const profileIds = new Set<string>();
const instanceIds = new Set<string>();

const createProfile = async (kind: InstanceKind) => {
  const suffix = crypto.randomUUID();
  const instance = await db
    .insert(Instances)
    .values({
      canonicalOrigin: kind === InstanceKind.LOCAL ? `https://${suffix}.local.example` : null,
      domain: `${suffix}.example`,
      kind,
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
  return { instance, profile };
};

const createProtocolInput = ({
  activityUri,
  actorUri,
  objectUri,
  ownerProfileId,
  targetProfileId,
}: {
  readonly activityUri: string;
  readonly actorUri: string;
  readonly objectUri: string;
  readonly ownerProfileId: string;
  readonly targetProfileId: string;
}) => ({
  activityUri,
  actorUri,
  objectUri,
  origin: 'INBOUND' as const,
  ownerProfileId,
  targetProfileId,
});

afterEach(async () => {
  if (profileIds.size > 0) {
    await db.delete(Profiles).where(inArray(Profiles.id, [...profileIds]));
  }
  if (instanceIds.size > 0) {
    await db.delete(Instances).where(inArray(Instances.id, [...instanceIds]));
  }
  profileIds.clear();
  instanceIds.clear();
});

after(async () => {
  await pg.end();
});

test('동일 pair의 서로 다른 Block 원본은 각각 닫고 마지막 finalize에서 관계를 제거한다', async () => {
  const { profile: owner } = await createProfile(InstanceKind.ACTIVITYPUB);
  const { profile: target } = await createProfile(InstanceKind.LOCAL);
  const firstInput = createProtocolInput({
    activityUri: `https://remote.example/activities/${crypto.randomUUID()}`,
    actorUri: `https://remote.example/users/${owner.handle}`,
    objectUri: `https://local.example/ap/actor/${target.id}`,
    ownerProfileId: owner.id,
    targetProfileId: target.id,
  });
  const secondInput = createProtocolInput({
    ...firstInput,
    activityUri: `https://remote.example/activities/${crypto.randomUUID()}`,
  });

  const firstBootstrap = await loadProfileBlockTransitionBootstrap({
    firstProfileId: owner.id,
    secondProfileId: target.id,
  });
  const firstExecution = await executeProfileBlockTransition({
    cleanupSources: firstBootstrap.cleanupSources,
    candidateProfileBlockId: firstBootstrap.candidateProfileBlockId,
    origin: 'ACTIVITYPUB',
    ownerProfileId: owner.id,
    targetProfileId: target.id,
    protocolActivity: firstInput,
  });
  assert.equal(firstExecution.ok, true);
  if (!firstExecution.ok) {
    return;
  }
  assert.equal(firstExecution.result.protocol?.status, 'ACTIVE');

  const secondBootstrap = await loadProfileBlockTransitionBootstrap({
    firstProfileId: owner.id,
    secondProfileId: target.id,
  });
  const secondExecution = await executeProfileBlockTransition({
    cleanupSources: secondBootstrap.cleanupSources,
    candidateProfileBlockId: secondBootstrap.candidateProfileBlockId,
    origin: 'ACTIVITYPUB',
    ownerProfileId: owner.id,
    targetProfileId: target.id,
    protocolActivity: secondInput,
  });
  assert.equal(secondExecution.ok, true);
  if (!secondExecution.ok) {
    return;
  }
  assert.equal(secondExecution.result.profileBlockId, firstExecution.result.profileBlockId);

  const firstUndo = await prepareProfileBlockProtocolUndo({
    activityUri: firstInput.activityUri,
    ownerProfileId: owner.id,
    targetProfileId: target.id,
  });
  assert.deepEqual(firstUndo, {
    kind: 'CLOSE_ONLY',
    profileBlockId: firstExecution.result.profileBlockId,
  });
  assert.equal(
    await db
      .select()
      .from(ProfileBlocks)
      .where(
        and(
          eq(ProfileBlocks.ownerProfileId, owner.id),
          eq(ProfileBlocks.targetProfileId, target.id),
        ),
      )
      .then((rows) => rows.length),
    1,
  );

  const secondUndo = await prepareProfileBlockProtocolUndo({
    activityUri: secondInput.activityUri,
    ownerProfileId: owner.id,
    targetProfileId: target.id,
  });
  assert.deepEqual(secondUndo, {
    kind: 'REMOVE',
    profileBlockId: firstExecution.result.profileBlockId,
  });
  assert.equal(
    await finalizeProfileBlockProtocolUndo({
      activityUri: secondInput.activityUri,
      ownerProfileId: owner.id,
      targetProfileId: target.id,
      profileBlockId: firstExecution.result.profileBlockId,
    }),
    true,
  );

  assert.equal(
    await db
      .select()
      .from(ProfileBlocks)
      .where(eq(ProfileBlocks.id, firstExecution.result.profileBlockId))
      .then((rows) => rows.length),
    0,
  );
  assert.deepEqual(
    await db
      .select({
        activityUri: ProfileBlockActivities.activityUri,
        state: ProfileBlockActivities.state,
      })
      .from(ProfileBlockActivities)
      .where(
        inArray(ProfileBlockActivities.activityUri, [
          firstInput.activityUri,
          secondInput.activityUri,
        ]),
      )
      .then((rows) =>
        rows.sort((left, right) => left.activityUri.localeCompare(right.activityUri)),
      ),
    [
      { activityUri: firstInput.activityUri, state: 'CLOSED' },
      { activityUri: secondInput.activityUri, state: 'CLOSED' },
    ].sort((left, right) => left.activityUri.localeCompare(right.activityUri)),
  );
});

test('서로 다른 Block 원본의 Undo를 동시에 준비해도 모든 원본 종료 후 관계를 제거한다', async () => {
  const { profile: owner } = await createProfile(InstanceKind.ACTIVITYPUB);
  const { profile: target } = await createProfile(InstanceKind.LOCAL);
  const firstInput = createProtocolInput({
    activityUri: `https://remote.example/activities/${crypto.randomUUID()}`,
    actorUri: `https://remote.example/users/${owner.handle}`,
    objectUri: `https://local.example/ap/actor/${target.id}`,
    ownerProfileId: owner.id,
    targetProfileId: target.id,
  });
  const secondInput = createProtocolInput({
    ...firstInput,
    activityUri: `https://remote.example/activities/${crypto.randomUUID()}`,
  });

  const firstBootstrap = await loadProfileBlockTransitionBootstrap({
    firstProfileId: owner.id,
    secondProfileId: target.id,
  });
  const secondBootstrap = await loadProfileBlockTransitionBootstrap({
    firstProfileId: owner.id,
    secondProfileId: target.id,
  });
  for (const [input, bootstrap] of [
    [firstInput, firstBootstrap],
    [secondInput, secondBootstrap],
  ] as const) {
    const execution = await executeProfileBlockTransition({
      cleanupSources: bootstrap.cleanupSources,
      candidateProfileBlockId: bootstrap.candidateProfileBlockId,
      origin: 'ACTIVITYPUB',
      ownerProfileId: owner.id,
      targetProfileId: target.id,
      protocolActivity: input,
    });
    assert.equal(execution.ok, true);
  }

  const preparations = await Promise.all(
    [firstInput, secondInput].map(({ activityUri }) =>
      prepareProfileBlockProtocolUndo({
        activityUri,
        ownerProfileId: owner.id,
        targetProfileId: target.id,
      }),
    ),
  );

  assert.deepEqual(preparations.map(({ kind }) => kind).sort(), ['CLOSE_ONLY', 'REMOVE']);
  assert.ok(
    preparations.every(
      ({ profileBlockId }) => profileBlockId === firstBootstrap.candidateProfileBlockId,
    ),
  );

  const removeActivityUri = [firstInput.activityUri, secondInput.activityUri][
    preparations.findIndex(({ kind }) => kind === 'REMOVE')
  ];
  assert.ok(removeActivityUri);
  assert.equal(
    await finalizeProfileBlockProtocolUndo({
      activityUri: removeActivityUri,
      ownerProfileId: owner.id,
      targetProfileId: target.id,
      profileBlockId: firstBootstrap.candidateProfileBlockId,
    }),
    true,
  );

  assert.equal(
    await db
      .select()
      .from(ProfileBlocks)
      .where(eq(ProfileBlocks.id, firstBootstrap.candidateProfileBlockId))
      .then((rows) => rows.length),
    0,
  );
  assert.deepEqual(
    await db
      .select({
        activityUri: ProfileBlockActivities.activityUri,
        state: ProfileBlockActivities.state,
      })
      .from(ProfileBlockActivities)
      .where(
        inArray(ProfileBlockActivities.activityUri, [
          firstInput.activityUri,
          secondInput.activityUri,
        ]),
      )
      .then((rows) =>
        rows.sort((left, right) => left.activityUri.localeCompare(right.activityUri)),
      ),
    [
      { activityUri: firstInput.activityUri, state: 'CLOSED' },
      { activityUri: secondInput.activityUri, state: 'CLOSED' },
    ].sort((left, right) => left.activityUri.localeCompare(right.activityUri)),
  );
});

test('Undo-before-Block tombstone은 뒤늦은 Block에서 관계를 만들지 않는다', async () => {
  const { profile: owner } = await createProfile(InstanceKind.ACTIVITYPUB);
  const { profile: target } = await createProfile(InstanceKind.LOCAL);
  const input = createProtocolInput({
    activityUri: `https://remote.example/activities/${crypto.randomUUID()}`,
    actorUri: `https://remote.example/users/${owner.handle}`,
    objectUri: `https://local.example/ap/actor/${target.id}`,
    ownerProfileId: owner.id,
    targetProfileId: target.id,
  });

  const bootstrap = await loadProfileBlockTransitionBootstrap({
    firstProfileId: owner.id,
    secondProfileId: target.id,
  });
  await recordProfileBlockProtocolTombstone({
    ...input,
    profileBlockId: bootstrap.candidateProfileBlockId,
  });
  const execution = await executeProfileBlockTransition({
    cleanupSources: bootstrap.cleanupSources,
    candidateProfileBlockId: bootstrap.candidateProfileBlockId,
    origin: 'ACTIVITYPUB',
    ownerProfileId: owner.id,
    targetProfileId: target.id,
    protocolActivity: input,
  });

  assert.equal(execution.ok, true);
  if (!execution.ok) {
    return;
  }
  assert.equal(execution.result.protocol?.status, 'CLOSED');
  assert.equal(
    await db
      .select()
      .from(ProfileBlocks)
      .where(
        and(
          eq(ProfileBlocks.ownerProfileId, owner.id),
          eq(ProfileBlocks.targetProfileId, target.id),
        ),
      )
      .then((rows) => rows.length),
    0,
  );
});
