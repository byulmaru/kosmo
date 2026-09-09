import { and, eq, ne } from 'drizzle-orm';
import { ActivityPubActors, db, first, Instances, ProfileMigrations, Profiles } from '../db';
import { InstanceKind, InstanceState, ProfileFollowPolicy, ProfileState } from '../enums';
import { ConflictError, NotFoundError } from '../error';
import type { Transaction } from '../db';

export type ProfileMigrationTargetInput = {
  readonly targetProfileId: string;
};

export type PrepareProfileMigrationInput = ProfileMigrationTargetInput & {
  readonly sourceProfileId: string;
};

const assertProfileMigrationTargetInTransaction = async (
  tx: Transaction,
  input: ProfileMigrationTargetInput,
) => {
  const target = await tx
    .select({ instance: Instances, profile: Profiles })
    .from(Profiles)
    .innerJoin(Instances, eq(Instances.id, Profiles.instanceId))
    .where(eq(Profiles.id, input.targetProfileId))
    .limit(1)
    .then(first);
  if (!target) {
    throw new NotFoundError('Profile not found');
  }

  if (
    target.profile.state !== ProfileState.ACTIVE ||
    target.instance.kind !== InstanceKind.LOCAL ||
    target.instance.state === InstanceState.SUSPENDED ||
    target.profile.followPolicy !== ProfileFollowPolicy.OPEN
  ) {
    throw new NotFoundError('Profile not found');
  }

  return target.profile;
};

/**
 * Validates the target before a caller performs remote source materialization.
 * The check is intentionally read-only; the mutating method repeats it in its
 * transaction so a caller cannot bypass the domain eligibility check.
 */
export const assertProfileMigrationTarget = async (input: ProfileMigrationTargetInput) =>
  db.transaction((tx) => assertProfileMigrationTargetInTransaction(tx, input));

export const prepareProfileMigration = async (
  input: PrepareProfileMigrationInput,
): Promise<typeof Profiles.$inferSelect> =>
  db.transaction(async (tx) => {
    const targetProfile = await assertProfileMigrationTargetInTransaction(tx, input);

    if (input.sourceProfileId === input.targetProfileId) {
      throw new ConflictError({ message: 'Profile cannot migrate to itself' });
    }

    const source = await tx
      .select({ id: Profiles.id })
      .from(Profiles)
      .innerJoin(Instances, eq(Instances.id, Profiles.instanceId))
      .innerJoin(ActivityPubActors, eq(ActivityPubActors.profileId, Profiles.id))
      .where(
        and(
          eq(Profiles.id, input.sourceProfileId),
          eq(Instances.kind, InstanceKind.ACTIVITYPUB),
          ne(Instances.state, InstanceState.SUSPENDED),
          eq(Profiles.state, ProfileState.ACTIVE),
        ),
      )
      .limit(1)
      .then(first);
    if (!source) {
      throw new NotFoundError('Remote profile not found');
    }

    const inserted = await tx
      .insert(ProfileMigrations)
      .values({
        sourceProfileId: input.sourceProfileId,
        targetProfileId: input.targetProfileId,
      })
      .onConflictDoNothing()
      .returning()
      .then(first);

    if (inserted) {
      return targetProfile;
    }

    // A concurrent request won either unique key. Re-read the exact pair once
    // to preserve same-pair idempotency while rejecting the other pair.
    const concurrent = await tx
      .select()
      .from(ProfileMigrations)
      .where(
        and(
          eq(ProfileMigrations.targetProfileId, input.targetProfileId),
          eq(ProfileMigrations.sourceProfileId, input.sourceProfileId),
        ),
      )
      .limit(1)
      .then(first);
    if (concurrent) {
      return targetProfile;
    }

    throw new ConflictError({ message: 'Profile migration pair conflicts' });
  });
