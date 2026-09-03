import { and, eq, or } from 'drizzle-orm';
import { db, first, getDatabaseConnection, ProfileBlocks, Profiles } from '../db';
import { ConflictError, KosmoError, NotFoundError, ValidationError } from '../error';
import { removeProfileFollowExactSourceWithEffect } from './profile-follow-command';
import type { DatabaseHandle, Transaction } from '../db';
import type { ProfileFollowPairEffect } from './profile-follow-command';
import type { ProfileFollowRemovalSource } from './profile-follow-transaction';

export type ProfileBlockCleanupSource = ProfileFollowRemovalSource;
export type ProfileBlockCleanupSources = readonly ProfileBlockCleanupSource[];

export type ProfileBlockEffectOrigin = 'LOCAL' | 'ACTIVITYPUB';

export type ProfileBlockTransitionInput = {
  readonly ownerProfileId: string;
  readonly targetProfileId: string;
  /** Origin is transport metadata; the relation itself accepts either Profile kind. */
  readonly origin: ProfileBlockEffectOrigin;
  /** Exact source IDs captured before this transaction is scheduled. */
  readonly cleanupSources: ProfileBlockCleanupSources;
  /** Stable candidate ID allocated by a durable Workflow when creating the relation. */
  readonly candidateProfileBlockId?: string;
};

export type ProfileBlockTransitionResult = {
  readonly created: boolean;
  readonly profileBlockId: string;
  readonly ownerProfileId: string;
  readonly targetProfileId: string;
};

export type ProfileBlockEffect = Extract<ProfileFollowPairEffect, { readonly kind: 'DELETE' }>;
export type ProfileBlockEffectPlan = readonly ProfileBlockEffect[];

export type ProfileBlockTransitionFailure = {
  readonly code: 'CONFLICT' | 'NOT_FOUND' | 'PERMISSION_DENIED' | 'VALIDATION';
  readonly message: string;
  readonly field?: string;
};

export type ProfileBlockTransitionExecution =
  | {
      readonly ok: true;
      readonly result: ProfileBlockTransitionResult;
      readonly effectPlan: ProfileBlockEffectPlan;
    }
  | { readonly ok: false; readonly error: ProfileBlockTransitionFailure };

export type ProfileUnblockTransitionInput = {
  readonly ownerProfileId: string;
  readonly targetProfileId: string;
  /** Origin is transport metadata; the relation itself accepts either Profile kind. */
  readonly origin: ProfileBlockEffectOrigin;
  /** Exact Block generation captured before cleanup is scheduled. */
  readonly expectedProfileBlockId: string;
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
      readonly effectPlan: ProfileBlockEffectPlan;
    }
  | { readonly ok: false; readonly error: ProfileBlockTransitionFailure };

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

const profileBlockPairCondition = ({
  ownerProfileId,
  targetProfileId,
}: Pick<ProfileBlockTransitionInput, 'ownerProfileId' | 'targetProfileId'>) =>
  and(
    eq(ProfileBlocks.ownerProfileId, ownerProfileId),
    eq(ProfileBlocks.targetProfileId, targetProfileId),
  );

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

/**
 * Applies the Profile Block relation and its DB-owned Follow cleanup in one
 * Activity transaction. Follow effect plans are returned even when their exact
 * source row was already removed, allowing a retry to reconstruct post-commit
 * effects after lost Activity completion.
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

  const inserted = await tx
    .insert(ProfileBlocks)
    .values(
      input.candidateProfileBlockId === undefined
        ? {
            ownerProfileId: input.ownerProfileId,
            targetProfileId: input.targetProfileId,
          }
        : {
            id: input.candidateProfileBlockId,
            ownerProfileId: input.ownerProfileId,
            targetProfileId: input.targetProfileId,
          },
    )
    .onConflictDoNothing({
      target: [ProfileBlocks.ownerProfileId, ProfileBlocks.targetProfileId],
    })
    .returning()
    .then(first);
  const profileBlock =
    inserted ??
    (await tx
      .select()
      .from(ProfileBlocks)
      .where(profileBlockPairCondition(input))
      .limit(1)
      .then(first));
  if (!profileBlock) {
    throw new Error('Profile Block not found after insert conflict');
  }

  const effectPlan: ProfileBlockEffect[] = [];
  for (const source of cleanupSources) {
    effectPlan.push(await removeProfileFollowExactSourceWithEffect(source, input.origin, tx));
  }

  return {
    ok: true,
    result: {
      created: inserted !== undefined,
      profileBlockId: profileBlock.id,
      ownerProfileId: input.ownerProfileId,
      targetProfileId: input.targetProfileId,
    },
    effectPlan,
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
 * settles the returned effects and deletes that exact generation.
 */
export const executeProfileUnblockTransitionInTransaction = async (
  input: ProfileUnblockTransitionInput,
  tx: Transaction,
): Promise<Extract<ProfileUnblockTransitionExecution, { readonly ok: true }>> => {
  if (input.ownerProfileId === input.targetProfileId) {
    throw new ConflictError({ message: 'Profile cannot unblock itself' });
  }

  const profileBlock = await tx
    .select({ id: ProfileBlocks.id })
    .from(ProfileBlocks)
    .where(
      and(
        eq(ProfileBlocks.ownerProfileId, input.ownerProfileId),
        eq(ProfileBlocks.targetProfileId, input.targetProfileId),
        eq(ProfileBlocks.id, input.expectedProfileBlockId),
      ),
    )
    .limit(1)
    .then(first);
  if (!profileBlock) {
    return {
      ok: true,
      result: {
        removed: false,
        profileBlockId: null,
        ownerProfileId: input.ownerProfileId,
        targetProfileId: input.targetProfileId,
      },
      effectPlan: [],
    };
  }

  const effectPlan: ProfileBlockEffect[] = [];
  for (const source of uniqueCleanupSources(input)) {
    effectPlan.push(await removeProfileFollowExactSourceWithEffect(source, input.origin, tx));
  }

  return {
    ok: true,
    result: {
      removed: true,
      profileBlockId: profileBlock.id,
      ownerProfileId: input.ownerProfileId,
      targetProfileId: input.targetProfileId,
    },
    effectPlan,
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
