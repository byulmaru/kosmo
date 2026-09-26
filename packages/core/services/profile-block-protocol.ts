import { and, eq, inArray, sql } from 'drizzle-orm';
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
  | { readonly kind: 'NOOP' }
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

/**
 * Claims the current directed pair. The Undo identity records a retry against
 * the same product row, even if another Block is created before it completes.
 */
export const prepareProfileBlockProtocolUndo = async ({
  actorUri,
  objectUri,
  originalActivityUri,
  ownerProfileId,
  targetProfileId,
  undoActivityUri,
}: {
  readonly actorUri: string;
  readonly objectUri: string;
  readonly originalActivityUri?: string;
  readonly ownerProfileId: string;
  readonly targetProfileId: string;
  readonly undoActivityUri: string;
}): Promise<ProfileBlockProtocolUndoPreparation> =>
  db.transaction(async (tx) => {
    const existing = await loadProtocolActivityInTransaction(undoActivityUri, tx);
    if (existing) {
      assertProtocolActivityMatches(existing, {
        activityUri: undoActivityUri,
        actorUri,
        objectUri,
        origin: 'INBOUND',
        ownerProfileId,
        targetProfileId,
      });
      return existing.state === 'CLOSING' && existing.profileBlockId
        ? { kind: 'REMOVE', profileBlockId: existing.profileBlockId }
        : { kind: 'NOOP' };
    }

    if (originalActivityUri) {
      const original = await loadProtocolActivityInTransaction(originalActivityUri, tx);
      if (original) {
        assertProtocolActivityMatches(original, {
          activityUri: originalActivityUri,
          actorUri,
          objectUri,
          origin: 'INBOUND',
          ownerProfileId,
          targetProfileId,
        });
        if (original.state === 'CLOSED') {
          return { kind: 'NOOP' };
        }
      } else {
        await tx.insert(ProfileBlockActivities).values({
          activityUri: originalActivityUri,
          actorUri,
          objectUri,
          origin: 'INBOUND',
          ownerProfileId,
          targetProfileId,
          state: 'CLOSED',
          closedAt: sql`now()`,
        });
      }
    }

    const current = await tx
      .select({ id: ProfileBlocks.id })
      .from(ProfileBlocks)
      .where(
        and(
          eq(ProfileBlocks.ownerProfileId, ownerProfileId),
          eq(ProfileBlocks.targetProfileId, targetProfileId),
        ),
      )
      .limit(1)
      .then(first);
    if (!current) {
      await tx.insert(ProfileBlockActivities).values({
        activityUri: undoActivityUri,
        actorUri,
        objectUri,
        origin: 'INBOUND',
        ownerProfileId,
        targetProfileId,
        state: 'CLOSED',
        closedAt: sql`now()`,
      });
      return { kind: 'NOOP' };
    }

    await tx
      .update(ProfileBlockActivities)
      .set({ state: 'CLOSING', updatedAt: sql`now()` })
      .where(
        and(
          protocolPairCondition(ownerProfileId, targetProfileId),
          eq(ProfileBlockActivities.origin, 'INBOUND'),
          eq(ProfileBlockActivities.profileBlockId, current.id),
          inArray(ProfileBlockActivities.state, ['ACTIVE', 'CLOSING']),
        ),
      );
    await tx.insert(ProfileBlockActivities).values({
      activityUri: undoActivityUri,
      actorUri,
      objectUri,
      origin: 'INBOUND',
      ownerProfileId,
      targetProfileId,
      profileBlockId: current.id,
      state: 'CLOSING',
    });
    return { kind: 'REMOVE', profileBlockId: current.id };
  });

/** Closes the claimed pair generation after its exact product relation was removed. */
export const finalizeProfileBlockProtocolUndo = async ({
  ownerProfileId,
  targetProfileId,
  profileBlockId,
}: {
  readonly ownerProfileId: string;
  readonly targetProfileId: string;
  readonly profileBlockId: string;
}): Promise<boolean> =>
  db.transaction(async (tx) => {
    const closed = await tx
      .update(ProfileBlockActivities)
      .set({ closedAt: sql`now()`, state: 'CLOSED', updatedAt: sql`now()` })
      .where(
        and(
          eq(ProfileBlockActivities.ownerProfileId, ownerProfileId),
          eq(ProfileBlockActivities.targetProfileId, targetProfileId),
          eq(ProfileBlockActivities.profileBlockId, profileBlockId),
          eq(ProfileBlockActivities.origin, 'INBOUND'),
          eq(ProfileBlockActivities.state, 'CLOSING'),
        ),
      )
      .returning({ id: ProfileBlockActivities.id })
      .then(first);
    return closed !== undefined;
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
    .set({
      closedAt: sql`now()`,
      state: 'CLOSED',
      undoDeliveryState: 'SETTLED',
      updatedAt: sql`now()`,
    })
    .where(protocolActivityCondition(activityUri));
};

export const markProfileBlockProtocolUndoPending = async (activityUri: string): Promise<void> => {
  await db
    .update(ProfileBlockActivities)
    .set({ undoDeliveryState: 'PENDING', updatedAt: sql`now()` })
    .where(protocolActivityCondition(activityUri));
};

export type { ProfileBlockActivityOrigin, ProfileBlockActivityState, ProfileBlockDeliveryState };
