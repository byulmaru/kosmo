import { and, eq, inArray, ne, sql } from 'drizzle-orm';
import { db, first, getDatabaseConnection, ProfileBlockActivities, ProfileBlocks } from '../db';
import { ConflictError, ValidationError } from '../error';
import type { DatabaseHandle, Transaction } from '../db';
import type {
  ProfileBlockActivityOrigin,
  ProfileBlockActivityState,
  ProfileBlockDeliveryState,
} from '../enums';

export type ProfileBlockProtocolActivityInput = {
  readonly activityUri: string;
  readonly actorUri: string;
  readonly objectUri: string;
  readonly ownerProfileId: string;
  readonly targetProfileId: string;
  readonly origin: ProfileBlockActivityOrigin;
  /** Candidate or already-created product relation identity. */
  readonly profileBlockId?: string;
};

export type ProfileBlockProtocolActivityRow = typeof ProfileBlockActivities.$inferSelect;

export type ProfileBlockProtocolUndoPreparation =
  | { readonly kind: 'NOOP'; readonly profileBlockId: string | null }
  | { readonly kind: 'CLOSE_ONLY'; readonly profileBlockId: string | null }
  | { readonly kind: 'REMOVE'; readonly profileBlockId: string };

const protocolActivityCondition = (activityUri: string) =>
  eq(ProfileBlockActivities.activityUri, activityUri);

const protocolPairCondition = (ownerProfileId: string, targetProfileId: string) =>
  and(
    eq(ProfileBlockActivities.ownerProfileId, ownerProfileId),
    eq(ProfileBlockActivities.targetProfileId, targetProfileId),
  );

const assertProtocolActivityMatches = (
  existing: ProfileBlockProtocolActivityRow,
  input: ProfileBlockProtocolActivityInput,
): void => {
  if (
    existing.actorUri !== input.actorUri ||
    existing.objectUri !== input.objectUri ||
    existing.ownerProfileId !== input.ownerProfileId ||
    existing.targetProfileId !== input.targetProfileId ||
    existing.origin !== input.origin
  ) {
    throw new ValidationError(
      'Profile Block activity identity conflicts with its first observation',
    );
  }
};

const loadProtocolActivityInTransaction = async (
  activityUri: string,
  tx: Transaction,
): Promise<ProfileBlockProtocolActivityRow | undefined> =>
  tx
    .select()
    .from(ProfileBlockActivities)
    .where(protocolActivityCondition(activityUri))
    .limit(1)
    .then(first);

/**
 * Inserts one protocol identity without overwriting a first observation. The
 * caller owns the surrounding transaction when relation and identity must
 * commit together.
 */
export const ensureProfileBlockProtocolActivityInTransaction = async (
  input: ProfileBlockProtocolActivityInput,
  tx: Transaction,
): Promise<ProfileBlockProtocolActivityRow> => {
  if (input.ownerProfileId === input.targetProfileId) {
    throw new ConflictError({ message: 'Profile Block activity cannot target its actor' });
  }

  const existing = await loadProtocolActivityInTransaction(input.activityUri, tx);
  if (existing) {
    assertProtocolActivityMatches(existing, input);
    if (existing.profileBlockId === null && input.profileBlockId !== undefined) {
      return tx
        .update(ProfileBlockActivities)
        .set({ profileBlockId: input.profileBlockId, updatedAt: sql`now()` })
        .where(protocolActivityCondition(input.activityUri))
        .returning()
        .then(first)
        .then((row) => row ?? existing);
    }
    return existing;
  }

  const inserted = await tx
    .insert(ProfileBlockActivities)
    .values({
      activityUri: input.activityUri,
      actorUri: input.actorUri,
      objectUri: input.objectUri,
      origin: input.origin,
      ownerProfileId: input.ownerProfileId,
      targetProfileId: input.targetProfileId,
      ...(input.profileBlockId === undefined ? {} : { profileBlockId: input.profileBlockId }),
    })
    .onConflictDoNothing({ target: ProfileBlockActivities.activityUri })
    .returning()
    .then(first);
  if (inserted) {
    return inserted;
  }

  const raced = await loadProtocolActivityInTransaction(input.activityUri, tx);
  if (!raced) {
    throw new Error('Profile Block activity disappeared after conflict handling');
  }
  assertProtocolActivityMatches(raced, input);
  return raced;
};

export const ensureProfileBlockProtocolActivity = async (
  input: ProfileBlockProtocolActivityInput,
): Promise<ProfileBlockProtocolActivityRow> =>
  db.transaction((tx) => ensureProfileBlockProtocolActivityInTransaction(input, tx));

export const loadProfileBlockProtocolActivity = async (
  activityUri: string,
  handle?: DatabaseHandle,
): Promise<ProfileBlockProtocolActivityRow | undefined> =>
  getDatabaseConnection(handle)
    .select()
    .from(ProfileBlockActivities)
    .where(protocolActivityCondition(activityUri))
    .limit(1)
    .then(first);

/** Stores an already verified Undo before its Block has been observed. */
export const recordProfileBlockProtocolTombstone = async (
  input: ProfileBlockProtocolActivityInput,
): Promise<ProfileBlockProtocolActivityRow> =>
  db.transaction(async (tx) => {
    const existing = await loadProtocolActivityInTransaction(input.activityUri, tx);
    if (existing) {
      assertProtocolActivityMatches(existing, input);
      return existing;
    }

    return tx
      .insert(ProfileBlockActivities)
      .values({
        activityUri: input.activityUri,
        actorUri: input.actorUri,
        objectUri: input.objectUri,
        origin: input.origin,
        ownerProfileId: input.ownerProfileId,
        targetProfileId: input.targetProfileId,
        ...(input.profileBlockId === undefined ? {} : { profileBlockId: input.profileBlockId }),
        state: 'CLOSED',
        closedAt: sql`now()`,
      })
      .returning()
      .then(first)
      .then((row) => {
        if (!row) {
          throw new Error('Profile Block Undo tombstone was not created');
        }
        return row;
      });
  });

const activeProtocolStates = ['ACTIVE', 'CLOSING'] as const;

/**
 * Claims one verified protocol original for Undo. A relation can be removed
 * only when this is the last active original for the directed pair.
 */
export const prepareProfileBlockProtocolUndo = async ({
  activityUri,
  ownerProfileId,
  targetProfileId,
  expectedProfileBlockId,
}: {
  readonly activityUri: string;
  readonly ownerProfileId: string;
  readonly targetProfileId: string;
  readonly expectedProfileBlockId?: string;
}): Promise<ProfileBlockProtocolUndoPreparation> =>
  db.transaction(async (tx) => {
    const activity = await loadProtocolActivityInTransaction(activityUri, tx);
    if (!activity) {
      return { kind: 'NOOP', profileBlockId: null };
    }
    if (
      activity.ownerProfileId !== ownerProfileId ||
      activity.targetProfileId !== targetProfileId
    ) {
      throw new ValidationError('Profile Block Undo pair does not match its original activity');
    }
    if (
      expectedProfileBlockId !== undefined &&
      activity.profileBlockId !== expectedProfileBlockId
    ) {
      throw new ValidationError(
        'Profile Block Undo generation does not match its original activity',
      );
    }
    if (activity.state === 'CLOSED') {
      return { kind: 'NOOP', profileBlockId: activity.profileBlockId };
    }
    if (activity.profileBlockId === null) {
      await tx
        .update(ProfileBlockActivities)
        .set({ closedAt: sql`now()`, state: 'CLOSED', updatedAt: sql`now()` })
        .where(protocolActivityCondition(activityUri));
      return { kind: 'NOOP', profileBlockId: null };
    }
    if (activity.state === 'CLOSING') {
      return { kind: 'REMOVE', profileBlockId: activity.profileBlockId };
    }

    const otherActive = await tx
      .select({ id: ProfileBlockActivities.id })
      .from(ProfileBlockActivities)
      .where(
        and(
          protocolPairCondition(ownerProfileId, targetProfileId),
          ne(ProfileBlockActivities.activityUri, activityUri),
          inArray(ProfileBlockActivities.state, activeProtocolStates),
        ),
      )
      .limit(1)
      .then(first);

    if (otherActive) {
      await tx
        .update(ProfileBlockActivities)
        .set({ closedAt: sql`now()`, state: 'CLOSED', updatedAt: sql`now()` })
        .where(protocolActivityCondition(activityUri));
      return { kind: 'CLOSE_ONLY', profileBlockId: activity.profileBlockId };
    }

    await tx
      .update(ProfileBlockActivities)
      .set({ state: 'CLOSING', updatedAt: sql`now()` })
      .where(protocolActivityCondition(activityUri));
    return { kind: 'REMOVE', profileBlockId: activity.profileBlockId };
  });

/**
 * Closes the claimed original and removes only its exact product relation.
 * A newer active original wins a race with finalization and keeps the pair
 * relation alive.
 */
export const finalizeProfileBlockProtocolUndo = async ({
  activityUri,
  ownerProfileId,
  targetProfileId,
  profileBlockId,
}: {
  readonly activityUri: string;
  readonly ownerProfileId: string;
  readonly targetProfileId: string;
  readonly profileBlockId: string;
}): Promise<boolean> =>
  db.transaction(async (tx) => {
    await tx
      .update(ProfileBlockActivities)
      .set({ closedAt: sql`now()`, state: 'CLOSED', updatedAt: sql`now()` })
      .where(
        and(
          protocolActivityCondition(activityUri),
          eq(ProfileBlockActivities.ownerProfileId, ownerProfileId),
          eq(ProfileBlockActivities.targetProfileId, targetProfileId),
          eq(ProfileBlockActivities.profileBlockId, profileBlockId),
        ),
      );

    const otherActive = await tx
      .select({ id: ProfileBlockActivities.id })
      .from(ProfileBlockActivities)
      .where(
        and(
          protocolPairCondition(ownerProfileId, targetProfileId),
          ne(ProfileBlockActivities.activityUri, activityUri),
          inArray(ProfileBlockActivities.state, activeProtocolStates),
        ),
      )
      .limit(1)
      .then(first);

    await tx
      .update(ProfileBlockActivities)
      .set({ closedAt: sql`now()`, state: 'CLOSED', updatedAt: sql`now()` })
      .where(
        and(
          protocolActivityCondition(activityUri),
          eq(ProfileBlockActivities.ownerProfileId, ownerProfileId),
          eq(ProfileBlockActivities.targetProfileId, targetProfileId),
          eq(ProfileBlockActivities.profileBlockId, profileBlockId),
        ),
      );

    if (otherActive) {
      return false;
    }

    const deleted = await tx
      .delete(ProfileBlocks)
      .where(
        and(
          eq(ProfileBlocks.id, profileBlockId),
          eq(ProfileBlocks.ownerProfileId, ownerProfileId),
          eq(ProfileBlocks.targetProfileId, targetProfileId),
        ),
      )
      .returning({ id: ProfileBlocks.id })
      .then(first);
    return deleted !== undefined;
  });

export const loadProfileBlockProtocolActivityByProfileBlockId = async (
  profileBlockId: string,
): Promise<ProfileBlockProtocolActivityRow | undefined> =>
  db
    .select()
    .from(ProfileBlockActivities)
    .where(eq(ProfileBlockActivities.profileBlockId, profileBlockId))
    .limit(1)
    .then(first);

export const markProfileBlockProtocolDeliveryPending = async (
  activityUri: string,
): Promise<void> => {
  await db
    .update(ProfileBlockActivities)
    .set({ deliveryState: 'PENDING', updatedAt: sql`now()` })
    .where(protocolActivityCondition(activityUri));
};

export const markProfileBlockProtocolDeliverySettled = async (
  activityUri: string,
): Promise<void> => {
  await db
    .update(ProfileBlockActivities)
    .set({ deliveryState: 'SETTLED', updatedAt: sql`now()` })
    .where(protocolActivityCondition(activityUri));
};

export const markProfileBlockProtocolUndoSettled = async (activityUri: string): Promise<void> => {
  await db
    .update(ProfileBlockActivities)
    .set({ undoDeliveryState: 'SETTLED', updatedAt: sql`now()` })
    .where(
      and(
        protocolActivityCondition(activityUri),
        inArray(ProfileBlockActivities.state, ['ACTIVE', 'CLOSING']),
      ),
    );
};

export const markProfileBlockProtocolUndoPending = async (activityUri: string): Promise<void> => {
  await db
    .update(ProfileBlockActivities)
    .set({ undoDeliveryState: 'PENDING', updatedAt: sql`now()` })
    .where(protocolActivityCondition(activityUri));
};

export type { ProfileBlockActivityOrigin, ProfileBlockActivityState, ProfileBlockDeliveryState };
