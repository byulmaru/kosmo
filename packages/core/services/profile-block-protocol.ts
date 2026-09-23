import { eq, sql } from 'drizzle-orm';
import { db, first, getDatabaseConnection, ProfileBlockActivities } from '../db';
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
  /** A reconstructed original after its product relation was removed. */
  readonly state?: ProfileBlockActivityState;
  /** Candidate or already-created product relation identity. */
  readonly profileBlockId?: string;
};

export type ProfileBlockProtocolActivityRow = typeof ProfileBlockActivities.$inferSelect;

const protocolActivityCondition = (activityUri: string) =>
  eq(ProfileBlockActivities.activityUri, activityUri);

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

const reconcileProtocolActivityInTransaction = async (
  existing: ProfileBlockProtocolActivityRow,
  input: ProfileBlockProtocolActivityInput,
  tx: Transaction,
): Promise<ProfileBlockProtocolActivityRow> => {
  assertProtocolActivityMatches(existing, input);
  if (
    input.profileBlockId !== undefined &&
    existing.profileBlockId !== null &&
    existing.profileBlockId !== input.profileBlockId
  ) {
    throw new ValidationError(
      'Profile Block activity generation conflicts with its first observation',
    );
  }
  if (existing.profileBlockId === null && input.profileBlockId !== undefined) {
    const [updated] = await tx
      .update(ProfileBlockActivities)
      .set({
        profileBlockId: input.profileBlockId,
        ...(input.state === 'CLOSED' ? { state: 'CLOSED' as const, closedAt: sql`now()` } : {}),
        updatedAt: sql`now()`,
      })
      .where(protocolActivityCondition(input.activityUri))
      .returning();
    return updated ?? existing;
  }
  if (input.state === 'CLOSED' && existing.state !== 'CLOSED') {
    const [updated] = await tx
      .update(ProfileBlockActivities)
      .set({ state: 'CLOSED', closedAt: sql`now()`, updatedAt: sql`now()` })
      .where(protocolActivityCondition(input.activityUri))
      .returning();
    return updated ?? existing;
  }
  return existing;
};

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
    return reconcileProtocolActivityInTransaction(existing, input, tx);
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
      ...(input.state === undefined ? {} : { state: input.state }),
      ...(input.state === 'CLOSED' ? { closedAt: sql`now()` } : {}),
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
  return reconcileProtocolActivityInTransaction(raced, input, tx);
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
        state: 'CLOSED',
        closedAt: sql`now()`,
      })
      .onConflictDoNothing({ target: ProfileBlockActivities.activityUri })
      .returning()
      .then(first);
    if (inserted) {
      return inserted;
    }
    const raced = await loadProtocolActivityInTransaction(input.activityUri, tx);
    if (!raced) {
      throw new Error('Profile Block Undo original disappeared after conflict handling');
    }
    assertProtocolActivityMatches(raced, input);
    return raced;
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
    .where(protocolActivityCondition(activityUri));
};

export type { ProfileBlockActivityOrigin, ProfileBlockActivityState, ProfileBlockDeliveryState };
