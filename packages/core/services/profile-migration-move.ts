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
import { InstanceKind, InstanceState, ProfileState } from '../enums';
import { executeProfileFollowRemoval } from '../temporal/follow-command';
import { followProfile } from './profile-follow';
import { profileFollowPairCondition } from './profile-follow-transaction';

const PROFILE_MIGRATION_MOVE_BATCH_SIZE = 50;

export type ProfileMigrationMoveInput = {
  readonly sourceProfileId: string;
  readonly targetProfileId: string;
};

export type ProfileMigrationMoveFollower = {
  readonly followerProfileId: string;
  readonly sourceFollowId: string;
};

export type ProfileMigrationMoveFollowerInput = ProfileMigrationMoveInput &
  ProfileMigrationMoveFollower;

const findEligibleTarget = async ({
  sourceProfileId,
  targetProfileId,
}: ProfileMigrationMoveInput): Promise<boolean> => {
  const target = await db
    .select({
      instanceKind: Instances.kind,
      instanceState: Instances.state,
      profileState: Profiles.state,
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
    return false;
  }

  if (target.instanceKind === InstanceKind.LOCAL) {
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
      return false;
    }
  } else if (target.instanceKind !== InstanceKind.ACTIVITYPUB) {
    return false;
  } else if (
    !(await db
      .select({ id: ActivityPubActors.id })
      .from(ActivityPubActors)
      .where(eq(ActivityPubActors.profileId, targetProfileId))
      .limit(1)
      .then(first))
  ) {
    return false;
  }

  return true;
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
 * Performs target-first admission for one source Follow. Existing target
 * state and a transition that did not create a row preserve the source; only
 * a newly created target delegates cleanup to the exact-row removal lifecycle.
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
    .where(profileFollowPairCondition(ProfileFollows, targetPair))
    .limit(1)
    .then(first);
  const targetRequest = targetFollow
    ? undefined
    : await db
        .select({ id: ProfileFollowRequests.id })
        .from(ProfileFollowRequests)
        .where(profileFollowPairCondition(ProfileFollowRequests, targetPair))
        .limit(1)
        .then(first);

  if (targetFollow || targetRequest) {
    return;
  }

  const { created } = await followProfile(targetPair);
  if (!created) {
    return;
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
