import { and, eq, ne } from 'drizzle-orm';
import { ActivityPubActors, db, first, Instances, ProfileMigrations, Profiles } from '../db';
import { InstanceKind, InstanceState, ProfileState } from '../enums';
import { ConflictError, NotFoundError } from '../error';

export type PrepareProfileMigrationInput = {
  readonly sourceProfileId: string;
  readonly targetProfileId: string;
};

export const prepareProfileMigration = async (input: PrepareProfileMigrationInput): Promise<void> =>
  db.transaction(async (tx) => {
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
      return;
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
      return;
    }

    throw new ConflictError({ message: 'Profile migration pair conflicts' });
  });
