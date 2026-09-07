import { and, asc, eq, gt } from 'drizzle-orm';
import {
  ActivityPubActors,
  db,
  first,
  Instances,
  ProfileFollowRequests,
  ProfileFollows,
  ProfileMigrations,
  Profiles,
} from '../db';
import { InstanceKind, InstanceState, ProfileFollowPolicy, ProfileState } from '../enums';
import {
  executeProfileFollowPairTransition,
  executeProfileFollowRemoval,
} from '../temporal/follow-command';

const PROFILE_MIGRATION_MOVE_BATCH_SIZE = 50;

export type ProfileMigrationMoveInput = {
  readonly sourceProfileId: string;
  readonly targetProfileId: string;
};

export type ProfileMigrationMoveFollower = {
  readonly followerProfileId: string;
  readonly sourceFollowId: string;
};

export type ProfileMigrationMoveFollowerInput = ProfileMigrationMoveInput & {
  readonly followerProfileId: string;
  readonly sourceFollowId: string;
};

const findEligibleTarget = async ({
  sourceProfileId,
  targetProfileId,
}: ProfileMigrationMoveInput) => {
  const target = await db
    .select({
      instanceKind: Instances.kind,
      instanceState: Instances.state,
      profileState: Profiles.state,
      followPolicy: Profiles.followPolicy,
    })
    .from(Profiles)
    .innerJoin(Instances, eq(Instances.id, Profiles.instanceId))
    .where(eq(Profiles.id, targetProfileId))
    .limit(1)
    .then(first);

  if (
    !target ||
    target.profileState !== ProfileState.ACTIVE ||
    target.instanceState === InstanceState.SUSPENDED
  ) {
    return undefined;
  }

  if (target.instanceKind === InstanceKind.LOCAL) {
    if (target.followPolicy !== ProfileFollowPolicy.OPEN) {
      return undefined;
    }

    const migration = await db
      .select({ id: ProfileMigrations.id })
      .from(ProfileMigrations)
      .where(
        and(
          eq(ProfileMigrations.sourceProfileId, sourceProfileId),
          eq(ProfileMigrations.targetProfileId, targetProfileId),
        ),
      )
      .limit(1)
      .then(first);
    if (!migration) {
      return undefined;
    }
  } else if (target.instanceKind !== InstanceKind.ACTIVITYPUB) {
    return undefined;
  } else if (
    !(await db
      .select({ id: ActivityPubActors.id })
      .from(ActivityPubActors)
      .where(eq(ActivityPubActors.profileId, targetProfileId))
      .limit(1)
      .then(first))
  ) {
    return undefined;
  }

  return target;
};

/**
 * Returns only established follows whose follower is an active local Profile.
 * The caller advances a keyset cursor after each bounded batch. A successful
 * batch item also removes its source row, so retries can safely re-read the
 * same cursor boundary without a migration ledger.
 */
export const loadProfileMigrationMoveFollowerBatch = async (
  input: ProfileMigrationMoveInput & {
    readonly afterSourceFollowId?: string;
    readonly limit?: number;
  },
): Promise<ProfileMigrationMoveFollower[]> => {
  if (!(await findEligibleTarget(input))) {
    return [];
  }

  const limit = input.limit ?? PROFILE_MIGRATION_MOVE_BATCH_SIZE;
  return db
    .select({
      followerProfileId: Profiles.id,
      sourceFollowId: ProfileFollows.id,
    })
    .from(ProfileFollows)
    .innerJoin(Profiles, eq(Profiles.id, ProfileFollows.followerProfileId))
    .innerJoin(Instances, eq(Instances.id, Profiles.instanceId))
    .where(
      and(
        eq(ProfileFollows.followeeProfileId, input.sourceProfileId),
        input.afterSourceFollowId === undefined
          ? undefined
          : gt(ProfileFollows.id, input.afterSourceFollowId),
        eq(Instances.kind, InstanceKind.LOCAL),
        eq(Instances.state, InstanceState.ACTIVE),
        eq(Profiles.state, ProfileState.ACTIVE),
      ),
    )
    .orderBy(asc(ProfileFollows.id))
    .limit(limit);
};

/**
 * Performs target-first admission for one source Follow and then delegates
 * source cleanup to the existing exact-row Temporal removal lifecycle.
 */
export const executeProfileMigrationMoveFollower = async (
  input: ProfileMigrationMoveFollowerInput,
): Promise<void> => {
  if (input.followerProfileId === input.targetProfileId) {
    return;
  }

  if (!(await findEligibleTarget(input))) {
    return;
  }

  const targetPair = {
    followerProfileId: input.followerProfileId,
    followeeProfileId: input.targetProfileId,
  };
  const targetFollow = await db
    .select({ id: ProfileFollows.id })
    .from(ProfileFollows)
    .where(
      and(
        eq(ProfileFollows.followerProfileId, targetPair.followerProfileId),
        eq(ProfileFollows.followeeProfileId, targetPair.followeeProfileId),
      ),
    )
    .limit(1)
    .then(first);
  const targetRequest = targetFollow
    ? undefined
    : await db
        .select({ id: ProfileFollowRequests.id })
        .from(ProfileFollowRequests)
        .where(
          and(
            eq(ProfileFollowRequests.followerProfileId, targetPair.followerProfileId),
            eq(ProfileFollowRequests.followeeProfileId, targetPair.followeeProfileId),
          ),
        )
        .limit(1)
        .then(first);

  if (!targetFollow && !targetRequest) {
    const transition = await executeProfileFollowPairTransition({
      pair: targetPair,
      command: { kind: 'FOLLOW', origin: 'LOCAL' },
    });
    if (transition.result.commandKind !== 'FOLLOW') {
      throw new Error('Unexpected target Profile Follow transition result');
    }
  }

  const removal = await executeProfileFollowRemoval({
    followerProfileId: input.followerProfileId,
    followeeProfileId: input.sourceProfileId,
    expectedRowId: input.sourceFollowId,
    origin: 'LOCAL',
  });
  if (!removal.changed) {
    const sourceFollow = await db
      .select({ id: ProfileFollows.id })
      .from(ProfileFollows)
      .where(eq(ProfileFollows.id, input.sourceFollowId))
      .limit(1)
      .then(first);
    if (sourceFollow) {
      throw new Error('Source Profile Follow removal did not converge');
    }
  }
};
