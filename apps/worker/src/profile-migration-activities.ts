import { isActor } from '@fedify/vocab';
import {
  ActivityPubActors,
  db,
  first,
  Instances,
  ProfileFollowRequests,
  ProfileFollows,
  ProfileMigrations,
  Profiles,
} from '@kosmo/core/db';
import { InstanceKind, InstanceState, ProfileState } from '@kosmo/core/enums';
import { ConflictError, NotFoundError } from '@kosmo/core/error';
import { resolveConfiguredLocalInstance } from '@kosmo/core/local-instance';
import {
  followProfile,
  profileFollowPairCondition,
  ProfilePairBlockedError,
} from '@kosmo/core/services';
import { executeProfileFollowRemoval } from '@kosmo/core/temporal/follow-command';
import {
  federation,
  findOrMaterializeRemoteProfileActorByUri,
  findStoredRemoteProfileActorByUri,
  observeInbound,
  RemoteActorMaterializationError,
} from '@kosmo/fedify';
import { and, asc, eq, gt } from 'drizzle-orm';
import type { ProfileMigrationMoveWorkflowInput } from '@kosmo/core/temporal/profile-migration';

const PROFILE_MIGRATION_MOVE_BATCH_SIZE = 50;

type ProfileMigrationMoveInput = {
  readonly sourceProfileId: string;
  readonly targetProfileId: string;
};

type ProfileMigrationMoveFollower = {
  readonly followerProfileId: string;
  readonly sourceFollowId: string;
};

type LoadProfileMigrationMoveFollowerBatchInput = ProfileMigrationMoveInput & {
  readonly afterSourceFollowId?: string;
  readonly limit?: number;
};

type ExecuteProfileMigrationMoveFollowerInput = ProfileMigrationMoveInput &
  ProfileMigrationMoveFollower;

const observeMoveRejection = (
  input: ProfileMigrationMoveWorkflowInput,
  phase: 'validation' | 'protocol' | 'actor_lookup',
  reasonCode: string,
  error?: unknown,
) => {
  observeInbound({
    activityType: 'Move',
    handler: 'move',
    outcome: 'rejected',
    phase,
    reasonCode,
    actorOrigin: input.sourceActorUri,
    objectOrigin: input.targetActorUri,
    ...(error === undefined ? {} : { error }),
  });
};

const isExpectedRemoteActorRejection = (error: unknown) =>
  error instanceof RemoteActorMaterializationError ||
  error instanceof NotFoundError ||
  error instanceof ConflictError;

/**
 * Resolves a protocol-validated Move into durable Profile IDs before the follower transfer starts.
 */
export const prepareProfileMigrationMoveActivity = async (
  input: ProfileMigrationMoveWorkflowInput,
): Promise<ProfileMigrationMoveInput | null> => {
  const sourceActorUri = new URL(input.sourceActorUri);
  const targetActorUri = new URL(input.targetActorUri);

  const localInstance = await resolveConfiguredLocalInstance();
  const localOrigin = new URL(localInstance.canonicalOrigin).origin;
  const storedSource = await findStoredRemoteProfileActorByUri(sourceActorUri);
  let targetProfileId: string | undefined;

  if (storedSource) {
    const preparedTarget = await db
      .select({
        profileId: Profiles.id,
      })
      .from(ActivityPubActors)
      .innerJoin(Profiles, eq(Profiles.id, ActivityPubActors.profileId))
      .innerJoin(Instances, eq(Instances.id, Profiles.instanceId))
      .innerJoin(
        ProfileMigrations,
        and(
          eq(ProfileMigrations.sourceProfileId, storedSource.profile.id),
          eq(ProfileMigrations.targetProfileId, Profiles.id),
        ),
      )
      .where(
        and(
          eq(ActivityPubActors.uri, targetActorUri.href),
          eq(Instances.kind, InstanceKind.LOCAL),
          eq(Instances.state, InstanceState.ACTIVE),
          eq(Profiles.state, ProfileState.ACTIVE),
        ),
      )
      .limit(1)
      .then(first);
    targetProfileId = preparedTarget?.profileId;
  }

  if (targetProfileId === undefined && targetActorUri.origin === localOrigin) {
    observeMoveRejection(input, 'validation', 'move_local_target_not_prepared');
    return null;
  }

  const fedifyContext = federation.createContext(new URL(localInstance.canonicalOrigin), undefined);
  const lookupObject = async (...args: Parameters<typeof fedifyContext.lookupObject>) => {
    const actor = await fedifyContext.lookupObject(...args);
    if (actor === null) {
      throw new Error('Remote Move actor lookup returned no actor');
    }
    return actor;
  };
  const lookupContext = { lookupObject };

  if (targetProfileId === undefined) {
    const targetActor = await lookupContext.lookupObject(targetActorUri);

    if (!isActor(targetActor) || targetActor.id?.href !== targetActorUri.href) {
      observeMoveRejection(input, 'protocol', 'move_target_not_matching_actor');
      return null;
    }

    if (!targetActor.aliasIds.some((alias) => alias.href === sourceActorUri.href)) {
      observeMoveRejection(input, 'protocol', 'move_target_alias_missing');
      return null;
    }

    try {
      const target = await findOrMaterializeRemoteProfileActorByUri({
        actorUri: targetActorUri,
        context: lookupContext,
      });
      targetProfileId = target.profile.id;
    } catch (error) {
      if (!isExpectedRemoteActorRejection(error)) {
        throw error;
      }
      observeMoveRejection(input, 'actor_lookup', 'move_target_materialization_rejected', error);
      return null;
    }
  }

  try {
    const source = await findOrMaterializeRemoteProfileActorByUri({
      actorUri: sourceActorUri,
      context: lookupContext,
    });
    return { sourceProfileId: source.profile.id, targetProfileId };
  } catch (error) {
    if (!isExpectedRemoteActorRejection(error)) {
      throw error;
    }
    observeMoveRejection(input, 'actor_lookup', 'move_source_materialization_rejected', error);
    return null;
  }
};

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
export const loadProfileMigrationMoveFollowerBatchActivity = async (
  input: LoadProfileMigrationMoveFollowerBatchInput,
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
export const executeProfileMigrationMoveFollowerActivity = async (
  input: ExecuteProfileMigrationMoveFollowerInput,
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

  let created: boolean;
  try {
    ({ created } = await followProfile(targetPair));
  } catch (error) {
    if (error instanceof ProfilePairBlockedError) {
      return;
    }
    throw error;
  }
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
