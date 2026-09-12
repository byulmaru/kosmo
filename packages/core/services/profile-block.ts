import { and, eq, inArray, or, sql } from 'drizzle-orm';
import {
  db,
  first,
  getDatabaseConnection,
  ProfileBlockActivities,
  ProfileBlockCleanupBatches,
  ProfileBlocks,
  Profiles,
} from '../db';
import { ConflictError, KosmoError, NotFoundError, ValidationError } from '../error';
import {
  ensureProfileBlockProtocolActivityInTransaction,
  loadProfileBlockProtocolActivity,
} from './profile-block-protocol';
import { removeProfileFollowExactSourceWithEffect } from './profile-follow-command';
import { loadProfileFollowRemovalSourcesBetweenProfiles } from './profile-follow-transaction';
import type { DatabaseHandle, Transaction } from '../db';
import type { ProfileBlockProtocolActivityInput } from './profile-block-protocol';
import type { ProfileFollowPairEffect } from './profile-follow-command';
import type { ProfileFollowRemovalSource } from './profile-follow-transaction';

export type ProfileBlockCleanupSource = ProfileFollowRemovalSource;
export type ProfileBlockCleanupSources = readonly ProfileBlockCleanupSource[];

export type ProfileBlockTransitionBootstrap = {
  readonly candidateProfileBlockId: string;
  readonly cleanupSources: ProfileBlockCleanupSources;
};

export type ProfileBlockEffectOrigin = 'LOCAL' | 'ACTIVITYPUB';

export type ProfileBlockTransitionInput = {
  readonly ownerProfileId: string;
  readonly targetProfileId: string;
  /** Origin is transport metadata; the relation itself accepts either Profile kind. */
  readonly origin: ProfileBlockEffectOrigin;
  /** Exact source IDs captured before this transaction is scheduled. */
  readonly cleanupSources: ProfileBlockCleanupSources;
  /** Stable candidate ID allocated by the bootstrap Activity for this relation. */
  readonly candidateProfileBlockId: string;
  /** Verified protocol identity, when this transition came from ActivityPub. */
  readonly protocolActivity?: ProfileBlockProtocolActivityInput;
};

export type ProfileBlockTransitionResult = {
  readonly created: boolean;
  readonly profileBlockId: string;
  readonly ownerProfileId: string;
  readonly targetProfileId: string;
  readonly protocol?: {
    readonly activityUri: string;
    readonly profileBlockId: string;
    readonly status: 'ACTIVE' | 'CLOSING' | 'CLOSED';
  };
};

export type ProfileBlockEffect = Extract<ProfileFollowPairEffect, { readonly kind: 'DELETE' }>;

export type ProfileBlockTransitionFailure = {
  readonly code: 'CONFLICT' | 'NOT_FOUND' | 'PERMISSION_DENIED' | 'VALIDATION';
  readonly message: string;
  readonly field?: string;
};

export type ProfileBlockTransitionExecution =
  | {
      readonly ok: true;
      readonly result: ProfileBlockTransitionResult;
    }
  | { readonly ok: false; readonly error: ProfileBlockTransitionFailure };

export type ProfileUnblockTransitionInput = {
  readonly ownerProfileId: string;
  readonly targetProfileId: string;
  /** Origin is transport metadata; the relation itself accepts either Profile kind. */
  readonly origin: ProfileBlockEffectOrigin;
  /** Exact Block generation captured before cleanup is scheduled. */
  readonly expectedProfileBlockId: string;
  /** Stable identity for this Workflow run; retries of the same run reuse it. */
  readonly operationId: string;
  /** Protocol original being closed, when this is an inbound or federated Undo. */
  readonly protocolActivityUri?: string;
  /** Exact Follow generations captured before this transaction is scheduled. */
  readonly cleanupSources: ProfileBlockCleanupSources;
};

export type ProfileUnblockTransitionResult = {
  readonly removed: boolean;
  readonly profileBlockId: string | null;
  readonly ownerProfileId: string;
  readonly targetProfileId: string;
};

export type ProfileUnblockTransitionExecution =
  | {
      readonly ok: true;
      readonly result: ProfileUnblockTransitionResult;
    }
  | { readonly ok: false; readonly error: ProfileBlockTransitionFailure };

export type ProfileBlockCleanupBatch = typeof ProfileBlockCleanupBatches.$inferSelect;

/**
 * Captures the Follow sources and allocates the Profile Block ID for one
 * Activity result. The candidate is returned in Activity history before the
 * transition inserts it, so a completion-loss retry reuses the same ID.
 */
export const loadProfileBlockTransitionBootstrap = async ({
  firstProfileId,
  secondProfileId,
}: {
  readonly firstProfileId: string;
  readonly secondProfileId: string;
}): Promise<ProfileBlockTransitionBootstrap> => {
  const [cleanupSources, candidateRows] = await Promise.all([
    loadProfileFollowRemovalSourcesBetweenProfiles({ firstProfileId, secondProfileId }),
    db.execute<{ candidateProfileBlockId: string }>(
      sql`SELECT uuidv7() AS "candidateProfileBlockId"`,
    ),
  ]);
  const candidateProfileBlockId = candidateRows[0]?.candidateProfileBlockId;
  if (candidateProfileBlockId === undefined) {
    throw new Error('Profile Block bootstrap did not allocate a candidate ID');
  }

  return { candidateProfileBlockId, cleanupSources };
};

const serializeFailure = (error: KosmoError): ProfileBlockTransitionFailure => {
  const field = 'field' in error && typeof error.field === 'string' ? error.field : undefined;
  return {
    code: error.code,
    message: error.message,
    ...(field === undefined ? {} : { field }),
  };
};

const isPairSource = (
  source: ProfileBlockCleanupSource,
  {
    ownerProfileId,
    targetProfileId,
  }: Pick<ProfileBlockTransitionInput, 'ownerProfileId' | 'targetProfileId'>,
) =>
  (source.followerProfileId === ownerProfileId && source.followeeProfileId === targetProfileId) ||
  (source.followerProfileId === targetProfileId && source.followeeProfileId === ownerProfileId);

const uniqueCleanupSources = (
  input: Pick<
    ProfileBlockTransitionInput | ProfileUnblockTransitionInput,
    'ownerProfileId' | 'targetProfileId' | 'cleanupSources'
  >,
): ProfileBlockCleanupSources => {
  const seen = new Set<string>();
  const sources: ProfileBlockCleanupSource[] = [];
  for (const source of input.cleanupSources) {
    if (!isPairSource(source, input)) {
      throw new ValidationError('Profile Block cleanup source does not match Owner/Target pair');
    }
    const key = `${source.sourceKind}:${source.sourceId}`;
    if (!seen.has(key)) {
      seen.add(key);
      sources.push(source);
    }
  }
  return sources;
};

const loadProfileBlockParticipants = async (
  tx: Transaction,
  {
    ownerProfileId,
    targetProfileId,
  }: Pick<ProfileBlockTransitionInput, 'ownerProfileId' | 'targetProfileId'>,
) => {
  const participants = await tx
    .select({ id: Profiles.id })
    .from(Profiles)
    .where(or(eq(Profiles.id, ownerProfileId), eq(Profiles.id, targetProfileId)));
  if (participants.length !== 2) {
    throw new NotFoundError('Profile not found');
  }
};

const profileBlockCleanupBatchResult = (
  batch: ProfileBlockCleanupBatch,
): ProfileBlockTransitionResult => {
  if (batch.protocolActivityUri !== null && batch.protocolState === null) {
    throw new Error('Profile Block cleanup batch is missing its protocol state snapshot');
  }
  const protocolState = batch.protocolState;
  return {
    created: batch.changed,
    profileBlockId: batch.profileBlockId,
    ownerProfileId: batch.ownerProfileId,
    targetProfileId: batch.targetProfileId,
    ...(batch.protocolActivityUri
      ? {
          protocol: {
            activityUri: batch.protocolActivityUri,
            profileBlockId: batch.profileBlockId,
            status: protocolState as 'ACTIVE' | 'CLOSING' | 'CLOSED',
          },
        }
      : {}),
  };
};

const profileUnblockCleanupBatchResult = (
  batch: ProfileBlockCleanupBatch,
): ProfileUnblockTransitionResult => ({
  removed: batch.changed,
  profileBlockId: batch.changed ? batch.profileBlockId : null,
  ownerProfileId: batch.ownerProfileId,
  targetProfileId: batch.targetProfileId,
});

const assertBlockCleanupBatchIdentity = (
  batch: ProfileBlockCleanupBatch,
  input: Pick<ProfileBlockTransitionInput, 'ownerProfileId' | 'targetProfileId' | 'origin'> & {
    readonly protocolActivityUri?: string;
  },
) => {
  if (
    batch.ownerProfileId !== input.ownerProfileId ||
    batch.targetProfileId !== input.targetProfileId ||
    batch.origin !== input.origin ||
    (batch.protocolActivityUri ?? undefined) !== input.protocolActivityUri
  ) {
    throw new ValidationError(
      'Profile Block cleanup operation conflicts with its first observation',
    );
  }
};

const reserveProfileBlockCleanupBatch = async ({
  operation,
  operationId,
  ownerProfileId,
  targetProfileId,
  profileBlockId,
  origin,
  protocolActivityUri,
  tx,
}: {
  readonly operation: 'BLOCK' | 'UNBLOCK';
  readonly operationId: string;
  readonly ownerProfileId: string;
  readonly targetProfileId: string;
  readonly profileBlockId: string;
  readonly origin: ProfileBlockEffectOrigin;
  readonly protocolActivityUri?: string;
  readonly tx: Transaction;
}): Promise<{ readonly batch: ProfileBlockCleanupBatch; readonly winner: boolean }> => {
  const inserted = await tx
    .insert(ProfileBlockCleanupBatches)
    .values({
      operation,
      operationId,
      ownerProfileId,
      targetProfileId,
      profileBlockId,
      origin,
      protocolActivityUri,
      changed: false,
      effectPlan: [],
    })
    .onConflictDoNothing({
      target: [ProfileBlockCleanupBatches.operation, ProfileBlockCleanupBatches.operationId],
    })
    .returning()
    .then(first);
  if (inserted) {
    return { batch: inserted, winner: true };
  }

  const existing = await tx
    .select()
    .from(ProfileBlockCleanupBatches)
    .where(
      and(
        eq(ProfileBlockCleanupBatches.operation, operation),
        eq(ProfileBlockCleanupBatches.operationId, operationId),
      ),
    )
    .limit(1)
    .then(first);
  if (!existing) {
    throw new Error('Profile Block cleanup batch disappeared after conflict handling');
  }
  if (operation === 'BLOCK') {
    assertBlockCleanupBatchIdentity(existing, {
      ownerProfileId,
      targetProfileId,
      origin,
      protocolActivityUri,
    });
  } else if (
    existing.ownerProfileId !== ownerProfileId ||
    existing.targetProfileId !== targetProfileId ||
    existing.profileBlockId !== profileBlockId
  ) {
    throw new ValidationError(
      'Profile Block Unblock cleanup operation conflicts with its generation',
    );
  }
  return { batch: existing, winner: false };
};

export const loadPendingProfileBlockCleanupBatches = async ({
  ownerProfileId,
  targetProfileId,
}: {
  readonly ownerProfileId: string;
  readonly targetProfileId: string;
}): Promise<readonly ProfileBlockCleanupBatch[]> =>
  db
    .select()
    .from(ProfileBlockCleanupBatches)
    .where(
      and(
        eq(ProfileBlockCleanupBatches.ownerProfileId, ownerProfileId),
        eq(ProfileBlockCleanupBatches.targetProfileId, targetProfileId),
        sql`${ProfileBlockCleanupBatches.settledAt} IS NULL`,
      ),
    )
    .orderBy(ProfileBlockCleanupBatches.createdAt, ProfileBlockCleanupBatches.id);

export const markProfileBlockCleanupBatchSettled = async (batchId: string): Promise<void> => {
  await db
    .update(ProfileBlockCleanupBatches)
    .set({ settledAt: sql`now()`, updatedAt: sql`now()` })
    .where(eq(ProfileBlockCleanupBatches.id, batchId));
};

/**
 * Applies the Profile Block relation and its DB-owned Follow cleanup in one
 * Activity transaction. Follow effect plans are persisted even when their exact
 * source row was already removed, allowing the Worker to reconstruct
 * post-commit effects after lost Activity completion.
 */
export const executeProfileBlockTransitionInTransaction = async (
  input: ProfileBlockTransitionInput,
  tx: Transaction,
): Promise<Extract<ProfileBlockTransitionExecution, { readonly ok: true }>> => {
  if (input.ownerProfileId === input.targetProfileId) {
    throw new ConflictError({ message: 'Profile cannot block itself' });
  }
  const cleanupSources = uniqueCleanupSources(input);
  await loadProfileBlockParticipants(tx, input);
  const operationId = input.candidateProfileBlockId;
  const reserved = await reserveProfileBlockCleanupBatch({
    operation: 'BLOCK',
    operationId,
    ownerProfileId: input.ownerProfileId,
    targetProfileId: input.targetProfileId,
    profileBlockId: operationId,
    origin: input.origin,
    protocolActivityUri: input.protocolActivity?.activityUri,
    tx,
  });
  if (!reserved.winner) {
    return {
      ok: true,
      result: profileBlockCleanupBatchResult(reserved.batch),
    };
  }

  const existingProtocol = input.protocolActivity
    ? await loadProfileBlockProtocolActivity(input.protocolActivity.activityUri, tx)
    : undefined;
  if (existingProtocol && existingProtocol.state !== 'ACTIVE') {
    const protocolProfileBlockId = existingProtocol.profileBlockId ?? operationId;
    const finalizedBatch = await tx
      .update(ProfileBlockCleanupBatches)
      .set({
        profileBlockId: protocolProfileBlockId,
        protocolState: existingProtocol.state,
        changed: false,
        effectPlan: [],
        updatedAt: sql`now()`,
      })
      .where(eq(ProfileBlockCleanupBatches.id, reserved.batch.id))
      .returning()
      .then(first);
    if (!finalizedBatch) {
      throw new Error('Profile Block cleanup batch disappeared while finalizing tombstone');
    }
    return {
      ok: true,
      result: profileBlockCleanupBatchResult(finalizedBatch),
    };
  }

  const acquired = await tx
    .insert(ProfileBlocks)
    .values({
      id: operationId,
      ownerProfileId: input.ownerProfileId,
      targetProfileId: input.targetProfileId,
    })
    .onConflictDoUpdate({
      target: [ProfileBlocks.ownerProfileId, ProfileBlocks.targetProfileId],
      set: { ownerProfileId: sql`${ProfileBlocks.ownerProfileId}` },
    })
    .returning({
      id: ProfileBlocks.id,
      closingAt: ProfileBlocks.closingAt,
      inserted: sql<boolean>`old.id IS NULL`,
    })
    .then(first);
  if (!acquired) {
    throw new Error('Profile Block pair acquisition did not return its row');
  }

  const ensuredProtocol = input.protocolActivity
    ? await ensureProfileBlockProtocolActivityInTransaction(
        {
          ...input.protocolActivity,
          // The candidate is stable across this operation. It is attached to
          // the actual retained generation only after the pair decision below.
          profileBlockId: operationId,
        },
        tx,
      )
    : undefined;
  if (ensuredProtocol && ensuredProtocol.state !== 'ACTIVE') {
    if (acquired.inserted) {
      await tx.delete(ProfileBlocks).where(eq(ProfileBlocks.id, acquired.id));
    }
    const finalizedBatch = await tx
      .update(ProfileBlockCleanupBatches)
      .set({
        profileBlockId: ensuredProtocol.profileBlockId ?? operationId,
        protocolState: ensuredProtocol.state,
        changed: false,
        effectPlan: [],
        updatedAt: sql`now()`,
      })
      .where(eq(ProfileBlockCleanupBatches.id, reserved.batch.id))
      .returning()
      .then(first);
    if (!finalizedBatch) {
      throw new Error('Profile Block cleanup batch disappeared while finalizing tombstone');
    }
    return {
      ok: true,
      result: profileBlockCleanupBatchResult(finalizedBatch),
    };
  }

  let profileBlockId = acquired.id;
  let created = acquired.inserted;
  const protocolStates = await tx
    .select({ state: ProfileBlockActivities.state })
    .from(ProfileBlockActivities)
    .where(
      and(
        eq(ProfileBlockActivities.profileBlockId, acquired.id),
        inArray(ProfileBlockActivities.state, ['ACTIVE', 'CLOSING']),
      ),
    );
  if (
    acquired.closingAt !== null ||
    (protocolStates.length > 0 && protocolStates.every(({ state }) => state === 'CLOSING'))
  ) {
    await tx.delete(ProfileBlocks).where(eq(ProfileBlocks.id, acquired.id));
    const replacement = await tx
      .insert(ProfileBlocks)
      .values({
        id: operationId,
        ownerProfileId: input.ownerProfileId,
        targetProfileId: input.targetProfileId,
      })
      .returning({ id: ProfileBlocks.id })
      .then(first);
    if (!replacement) {
      throw new Error('Profile Block closing generation replacement did not return its row');
    }
    profileBlockId = replacement.id;
    created = true;
  }

  if (input.protocolActivity) {
    await tx
      .update(ProfileBlockActivities)
      .set({ profileBlockId, updatedAt: sql`now()` })
      .where(eq(ProfileBlockActivities.activityUri, input.protocolActivity.activityUri));
  }

  const effectPlan: ProfileBlockEffect[] = [];
  for (const source of cleanupSources) {
    effectPlan.push(await removeProfileFollowExactSourceWithEffect(source, input.origin, tx));
  }
  const finalizedBatch = await tx
    .update(ProfileBlockCleanupBatches)
    .set({
      profileBlockId,
      protocolState: input.protocolActivity ? 'ACTIVE' : null,
      changed: created,
      effectPlan,
      updatedAt: sql`now()`,
    })
    .where(eq(ProfileBlockCleanupBatches.id, reserved.batch.id))
    .returning()
    .then(first);
  if (!finalizedBatch) {
    throw new Error('Profile Block cleanup batch disappeared while finalizing');
  }

  return {
    ok: true,
    result: {
      created,
      profileBlockId,
      ownerProfileId: input.ownerProfileId,
      targetProfileId: input.targetProfileId,
      ...(input.protocolActivity
        ? {
            protocol: {
              activityUri: input.protocolActivity.activityUri,
              profileBlockId,
              status: 'ACTIVE' as const,
            },
          }
        : {}),
    },
  };
};

/** Transaction Activity entry point used by the durable Block Workflow. */
export const executeProfileBlockTransition = async (
  input: ProfileBlockTransitionInput,
): Promise<ProfileBlockTransitionExecution> => {
  try {
    return await db.transaction((tx) => executeProfileBlockTransitionInTransaction(input, tx));
  } catch (error) {
    if (error instanceof KosmoError) {
      return { ok: false, error: serializeFailure(error) };
    }
    throw error;
  }
};

/**
 * Applies the Follow cleanup for an existing Block generation in one
 * transaction. The Block row intentionally remains active until the Worker
 * settles the persisted effects and deletes that exact generation.
 */
export const executeProfileUnblockTransitionInTransaction = async (
  input: ProfileUnblockTransitionInput,
  tx: Transaction,
): Promise<Extract<ProfileUnblockTransitionExecution, { readonly ok: true }>> => {
  if (input.ownerProfileId === input.targetProfileId) {
    throw new ConflictError({ message: 'Profile cannot unblock itself' });
  }

  const cleanupSources = uniqueCleanupSources(input);
  const reserved = await reserveProfileBlockCleanupBatch({
    operation: 'UNBLOCK',
    operationId: input.operationId,
    ownerProfileId: input.ownerProfileId,
    targetProfileId: input.targetProfileId,
    profileBlockId: input.expectedProfileBlockId,
    origin: input.origin,
    protocolActivityUri: input.protocolActivityUri,
    tx,
  });
  if (!reserved.winner) {
    return {
      ok: true,
      result: profileUnblockCleanupBatchResult(reserved.batch),
    };
  }

  const profileBlock = await tx
    .update(ProfileBlocks)
    .set({ closingAt: sql`now()` })
    .where(
      and(
        eq(ProfileBlocks.ownerProfileId, input.ownerProfileId),
        eq(ProfileBlocks.targetProfileId, input.targetProfileId),
        eq(ProfileBlocks.id, input.expectedProfileBlockId),
      ),
    )
    .returning({ id: ProfileBlocks.id })
    .then(first);
  if (!profileBlock) {
    const finalizedBatch = await tx
      .update(ProfileBlockCleanupBatches)
      .set({ changed: false, effectPlan: [], updatedAt: sql`now()` })
      .where(eq(ProfileBlockCleanupBatches.id, reserved.batch.id))
      .returning()
      .then(first);
    if (!finalizedBatch) {
      throw new Error(
        'Profile Block cleanup batch disappeared while finalizing missing generation',
      );
    }
    return {
      ok: true,
      result: profileUnblockCleanupBatchResult(finalizedBatch),
    };
  }

  const effectPlan: ProfileBlockEffect[] = [];
  for (const source of cleanupSources) {
    effectPlan.push(await removeProfileFollowExactSourceWithEffect(source, input.origin, tx));
  }

  const finalizedBatch = await tx
    .update(ProfileBlockCleanupBatches)
    .set({
      changed: true,
      effectPlan,
      updatedAt: sql`now()`,
    })
    .where(eq(ProfileBlockCleanupBatches.id, reserved.batch.id))
    .returning()
    .then(first);
  if (!finalizedBatch) {
    throw new Error('Profile Block cleanup batch disappeared while finalizing');
  }

  return {
    ok: true,
    result: {
      removed: true,
      profileBlockId: profileBlock.id,
      ownerProfileId: input.ownerProfileId,
      targetProfileId: input.targetProfileId,
    },
  };
};

/** Transaction Activity entry point used by the durable Unblock Workflow. */
export const executeProfileUnblockTransition = async (
  input: ProfileUnblockTransitionInput,
): Promise<ProfileUnblockTransitionExecution> => {
  try {
    return await db.transaction((tx) => executeProfileUnblockTransitionInTransaction(input, tx));
  } catch (error) {
    if (error instanceof KosmoError) {
      return { ok: false, error: serializeFailure(error) };
    }
    throw error;
  }
};

/** Owner-scoped relation deletion; removed Follow Request/Relationship rows are not restored. */
export const deleteProfileBlock = async (
  {
    ownerProfileId,
    targetProfileId,
    profileBlockId,
  }: {
    readonly ownerProfileId: string;
    readonly targetProfileId: string;
    /** Expected generation; prevents deleting a later Block. */
    readonly profileBlockId: string;
  },
  handle?: DatabaseHandle,
): Promise<typeof ProfileBlocks.$inferSelect | null> =>
  getDatabaseConnection(handle)
    .delete(ProfileBlocks)
    .where(
      and(
        eq(ProfileBlocks.ownerProfileId, ownerProfileId),
        eq(ProfileBlocks.targetProfileId, targetProfileId),
        eq(ProfileBlocks.id, profileBlockId),
      ),
    )
    .returning()
    .then(first)
    .then((profileBlock) => profileBlock ?? null);
