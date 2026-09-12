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
  executeProfileUnblockTransition,
  loadProfileBlockTransitionBootstrap,
} from './profile-block';
import {
  finalizeProfileBlockProtocolUndo,
  prepareProfileBlockProtocolUndo,
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
  return profile;
};

const createProtocolInput = ({
  activityUri,
  ownerProfileId,
  targetProfileId,
}: {
  readonly activityUri: string;
  readonly ownerProfileId: string;
  readonly targetProfileId: string;
}) => ({
  activityUri,
  actorUri: `https://remote.example/users/${ownerProfileId}`,
  objectUri: `https://local.example/actors/${targetProfileId}`,
  origin: 'INBOUND' as const,
  ownerProfileId,
  targetProfileId,
});

const escapeSqlLiteral = (value: string): string => value.replaceAll("'", "''");

const waitForAdvisoryLockBlock = async (
  lock: { readonly classId: number; readonly objectId: number },
  isSettled: () => boolean,
  message: string,
): Promise<void> => {
  for (let attempt = 0; attempt < 1_000; attempt += 1) {
    const [row] = await pg<{ waiting: number }[]>`
      SELECT count(*)::integer AS waiting
      FROM pg_locks
      WHERE locktype = 'advisory'
        AND NOT granted
        AND classid = ${lock.classId}
        AND objid = ${lock.objectId}
    `;
    if ((row?.waiting ?? 0) > 0) {
      return;
    }
    assert.equal(isSettled(), false, message);
    // This is only a bounded poll for PostgreSQL's observed lock state. The
    // lock observation, rather than elapsed time, establishes the ordering.
    await new Promise((resolve) => setTimeout(resolve, 10));
  }

  assert.fail(message);
};

const waitForProfileBlockWriteBlock = async (
  isSettled: () => boolean,
  message: string,
): Promise<boolean> => {
  for (let attempt = 0; attempt < 1_000; attempt += 1) {
    const [row] = await pg<{ waiting: number }[]>`
      SELECT count(*)::integer AS waiting
      FROM pg_locks AS locks
      INNER JOIN pg_stat_activity AS activity ON activity.pid = locks.pid
      WHERE NOT locks.granted
        AND locks.locktype IN ('transactionid', 'tuple')
        AND activity.query ILIKE '%profile_block%'
    `;
    if ((row?.waiting ?? 0) > 0) {
      return true;
    }
    if (isSettled()) {
      return false;
    }
    // See waitForAdvisoryLockBlock: the proof is the live PostgreSQL wait.
    await new Promise((resolve) => setTimeout(resolve, 10));
  }

  assert.fail(message);
};

const installRaceBarriers = async ({
  b2ProfileBlockId,
  b3ActivityUri,
  names,
  locks,
}: {
  readonly b2ProfileBlockId: string;
  readonly b3ActivityUri: string;
  readonly names: {
    readonly b2Function: string;
    readonly b2Trigger: string;
    readonly b3ActivityFunction: string;
    readonly b3ActivityTrigger: string;
  };
  readonly locks: {
    readonly b2: { readonly classId: number; readonly objectId: number };
    readonly b3: { readonly classId: number; readonly objectId: number };
  };
}): Promise<void> => {
  const b2ProfileBlockIdLiteral = escapeSqlLiteral(b2ProfileBlockId);
  const b3ActivityUriLiteral = escapeSqlLiteral(b3ActivityUri);

  await pg.unsafe(`
    CREATE FUNCTION "${names.b2Function}"() RETURNS trigger
    LANGUAGE plpgsql AS $function$
    BEGIN
      PERFORM pg_advisory_xact_lock(${locks.b2.classId}, ${locks.b2.objectId});
      RETURN NEW;
    END
    $function$;

    CREATE TRIGGER "${names.b2Trigger}"
    AFTER INSERT ON profile_block
    FOR EACH ROW
    WHEN (NEW.id = '${b2ProfileBlockIdLiteral}')
    EXECUTE FUNCTION "${names.b2Function}"();

    CREATE FUNCTION "${names.b3ActivityFunction}"() RETURNS trigger
    LANGUAGE plpgsql AS $function$
    BEGIN
      PERFORM pg_advisory_xact_lock(${locks.b3.classId}, ${locks.b3.objectId});
      RETURN NEW;
    END
    $function$;

    CREATE TRIGGER "${names.b3ActivityTrigger}"
    BEFORE UPDATE OF profile_block_id ON profile_block_activity
    FOR EACH ROW
    WHEN (
      NEW.activity_uri = '${b3ActivityUriLiteral}'
      AND NEW.profile_block_id IS DISTINCT FROM OLD.profile_block_id
    )
    EXECUTE FUNCTION "${names.b3ActivityFunction}"();
  `);
};

const removeRaceBarriers = async (names: {
  readonly b2Function: string;
  readonly b2Trigger: string;
  readonly b3ActivityFunction: string;
  readonly b3ActivityTrigger: string;
}): Promise<void> => {
  await pg.unsafe(`
    DROP TRIGGER IF EXISTS "${names.b2Trigger}" ON profile_block;
    DROP FUNCTION IF EXISTS "${names.b2Function}"();
    DROP TRIGGER IF EXISTS "${names.b3ActivityTrigger}" ON profile_block_activity;
    DROP FUNCTION IF EXISTS "${names.b3ActivityFunction}"();
  `);
};

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

test('B2 Undo cannot delete the product row that a raced B3 attaches to', async () => {
  const owner = await createProfile(InstanceKind.ACTIVITYPUB);
  const target = await createProfile(InstanceKind.LOCAL);
  const pair = { ownerProfileId: owner.id, targetProfileId: target.id };
  const b1 = createProtocolInput({
    ...pair,
    activityUri: `https://remote.example/activities/${crypto.randomUUID()}`,
  });
  const b2 = createProtocolInput({
    ...pair,
    activityUri: `https://remote.example/activities/${crypto.randomUUID()}`,
  });
  const b3 = createProtocolInput({
    ...pair,
    activityUri: `https://remote.example/activities/${crypto.randomUUID()}`,
  });
  const b1Bootstrap = await loadProfileBlockTransitionBootstrap({
    firstProfileId: owner.id,
    secondProfileId: target.id,
  });
  const b2Bootstrap = await loadProfileBlockTransitionBootstrap({
    firstProfileId: owner.id,
    secondProfileId: target.id,
  });
  const b3Bootstrap = await loadProfileBlockTransitionBootstrap({
    firstProfileId: owner.id,
    secondProfileId: target.id,
  });
  const b1Transition = await executeProfileBlockTransition({
    ...pair,
    candidateProfileBlockId: b1Bootstrap.candidateProfileBlockId,
    cleanupSources: b1Bootstrap.cleanupSources,
    origin: 'ACTIVITYPUB',
    protocolActivity: b1,
  });
  assert.equal(b1Transition.ok, true);
  if (!b1Transition.ok) {
    return;
  }

  const b1Undo = await prepareProfileBlockProtocolUndo({
    ...pair,
    activityUri: b1.activityUri,
  });
  assert.deepEqual(b1Undo, {
    kind: 'REMOVE',
    profileBlockId: b1Bootstrap.candidateProfileBlockId,
  });

  const barrierSuffix = crypto.randomUUID().replaceAll('-', '');
  const names = {
    b2Function: `profile_block_generation_race_b2_${barrierSuffix}`,
    b2Trigger: `profile_block_generation_race_b2_trigger_${barrierSuffix}`,
    b3ActivityFunction: `profile_block_generation_race_b3_activity_${barrierSuffix}`,
    b3ActivityTrigger: `profile_block_generation_race_b3_activity_trigger_${barrierSuffix}`,
  };
  const locks = {
    b2: { classId: 818_001, objectId: 818_002 },
    b3: { classId: 818_001, objectId: 818_003 },
  } as const;
  const barrierSession = await pg.reserve();
  let b2LockHeld = false;
  let b3LockHeld = false;
  let barriersInstalled = false;
  let b2Transition: Promise<Awaited<ReturnType<typeof executeProfileBlockTransition>>> | undefined;
  let b3Transition: Promise<Awaited<ReturnType<typeof executeProfileBlockTransition>>> | undefined;
  let b2Undo: Promise<unknown> | undefined;
  let b2TransitionSettled = false;
  let b3TransitionSettled = false;
  let b2UndoSettled = false;

  try {
    await barrierSession`SELECT pg_advisory_lock(${locks.b2.classId}, ${locks.b2.objectId})`;
    b2LockHeld = true;
    await barrierSession`SELECT pg_advisory_lock(${locks.b3.classId}, ${locks.b3.objectId})`;
    b3LockHeld = true;
    await installRaceBarriers({
      b2ProfileBlockId: b2Bootstrap.candidateProfileBlockId,
      b3ActivityUri: b3.activityUri,
      names,
      locks,
    });
    barriersInstalled = true;

    b2Transition = executeProfileBlockTransition({
      ...pair,
      candidateProfileBlockId: b2Bootstrap.candidateProfileBlockId,
      cleanupSources: b2Bootstrap.cleanupSources,
      origin: 'ACTIVITYPUB',
      protocolActivity: b2,
    }).then(
      (result) => {
        b2TransitionSettled = true;
        return result;
      },
      (error: unknown) => {
        b2TransitionSettled = true;
        throw error;
      },
    );
    await waitForAdvisoryLockBlock(
      locks.b2,
      () => b2TransitionSettled,
      'B2 transition did not reach its post-insert barrier',
    );

    b3Transition = executeProfileBlockTransition({
      ...pair,
      candidateProfileBlockId: b3Bootstrap.candidateProfileBlockId,
      cleanupSources: b3Bootstrap.cleanupSources,
      origin: 'ACTIVITYPUB',
      protocolActivity: b3,
    }).then(
      (result) => {
        b3TransitionSettled = true;
        return result;
      },
      (error: unknown) => {
        b3TransitionSettled = true;
        throw error;
      },
    );
    assert.equal(
      await waitForProfileBlockWriteBlock(
        () => b3TransitionSettled,
        'B3 transition did not wait on B2 replacing the old product row',
      ),
      true,
    );

    await barrierSession`SELECT pg_advisory_unlock(${locks.b2.classId}, ${locks.b2.objectId})`;
    b2LockHeld = false;
    const b2Result = await b2Transition;
    assert.equal(b2Result.ok, true);
    if (!b2Result.ok) {
      return;
    }
    assert.equal(b2Result.result.profileBlockId, b2Bootstrap.candidateProfileBlockId);

    // B2 replaced the CLOSING B1 product. Finish B1's already-prepared Undo
    // before starting B2's Undo so B1's terminal state cannot make B2's
    // preparation take the CLOSE_ONLY branch.
    assert.equal(
      await finalizeProfileBlockProtocolUndo({
        ...pair,
        activityUri: b1.activityUri,
        profileBlockId: b1Bootstrap.candidateProfileBlockId,
      }),
      false,
    );

    await waitForAdvisoryLockBlock(
      locks.b3,
      () => b3TransitionSettled,
      'B3 transition did not reach its real protocol attachment update',
    );

    const runB2Undo = async () => {
      const preparation = await prepareProfileBlockProtocolUndo({
        ...pair,
        activityUri: b2.activityUri,
      });
      if (preparation.kind === 'CLOSE_ONLY') {
        return { preparation, execution: null, finalized: null };
      }
      if (preparation.kind !== 'REMOVE') {
        throw new Error(`Unexpected B2 Undo preparation: ${preparation.kind}`);
      }
      const execution = await executeProfileUnblockTransition({
        ...pair,
        cleanupSources: [],
        expectedProfileBlockId: b2Bootstrap.candidateProfileBlockId,
        operationId: b2Bootstrap.candidateProfileBlockId,
        origin: 'ACTIVITYPUB',
        protocolActivityUri: b2.activityUri,
      });
      if (!execution.ok) {
        throw new Error(`B2 Undo transition failed: ${execution.error.message}`);
      }
      const finalized = await finalizeProfileBlockProtocolUndo({
        ...pair,
        activityUri: b2.activityUri,
        profileBlockId: b2Bootstrap.candidateProfileBlockId,
      });
      return { preparation, execution, finalized };
    };

    // The fixed path holds the current product row through B3's attachment,
    // so B2 preparation waits here. The old path may finish before B3 commits;
    // the final product/protocol assertions below expose that outcome.
    b2Undo = runB2Undo().then(
      (result) => {
        b2UndoSettled = true;
        return result;
      },
      (error: unknown) => {
        b2UndoSettled = true;
        throw error;
      },
    );
    await waitForProfileBlockWriteBlock(
      () => b2UndoSettled,
      'B2 Undo did not settle or wait for the raced B3 attachment',
    );

    await barrierSession`SELECT pg_advisory_unlock(${locks.b3.classId}, ${locks.b3.objectId})`;
    b3LockHeld = false;
    const [b3Result] = await Promise.all([b3Transition, b2Undo]);
    assert.equal(b3Result.ok, true);
    if (!b3Result.ok) {
      return;
    }

    const products = await db
      .select({ id: ProfileBlocks.id })
      .from(ProfileBlocks)
      .where(
        and(
          eq(ProfileBlocks.ownerProfileId, owner.id),
          eq(ProfileBlocks.targetProfileId, target.id),
        ),
      );
    const protocols = await db
      .select({
        activityUri: ProfileBlockActivities.activityUri,
        profileBlockId: ProfileBlockActivities.profileBlockId,
        state: ProfileBlockActivities.state,
      })
      .from(ProfileBlockActivities)
      .where(
        inArray(ProfileBlockActivities.activityUri, [
          b1.activityUri,
          b2.activityUri,
          b3.activityUri,
        ]),
      )
      .then((rows) =>
        rows.sort((left, right) => left.activityUri.localeCompare(right.activityUri)),
      );
    const b3Protocol = protocols.find(({ activityUri }) => activityUri === b3.activityUri);
    assert.ok(b3Protocol);
    assert.equal(b3Protocol.state, 'ACTIVE');
    assert.notEqual(b3Protocol.profileBlockId, null);
    assert.deepEqual(products, [{ id: b3Protocol.profileBlockId }]);
    assert.deepEqual(
      protocols,
      [
        {
          activityUri: b1.activityUri,
          profileBlockId: b1Bootstrap.candidateProfileBlockId,
          state: 'CLOSED',
        },
        {
          activityUri: b2.activityUri,
          profileBlockId: b2Bootstrap.candidateProfileBlockId,
          state: 'CLOSED',
        },
        {
          activityUri: b3.activityUri,
          profileBlockId: b3Protocol.profileBlockId,
          state: 'ACTIVE',
        },
      ].sort((left, right) => left.activityUri.localeCompare(right.activityUri)),
    );
  } finally {
    if (b3LockHeld) {
      await barrierSession`SELECT pg_advisory_unlock(${locks.b3.classId}, ${locks.b3.objectId})`;
    }
    if (b2LockHeld) {
      await barrierSession`SELECT pg_advisory_unlock(${locks.b2.classId}, ${locks.b2.objectId})`;
    }
    const pending: Promise<unknown>[] = [];
    if (b3Transition) {
      pending.push(b3Transition);
    }
    if (b2Undo) {
      pending.push(b2Undo);
    }
    if (b2Transition) {
      pending.push(b2Transition);
    }
    await Promise.allSettled(pending);
    if (barriersInstalled) {
      await removeRaceBarriers(names);
    }
    barrierSession.release();
  }
});
