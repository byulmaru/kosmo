import { and, eq, inArray } from 'drizzle-orm';
import { db, first, Instances, ProfileFollowRequests, ProfileFollows, Profiles } from '../db';
import { InstanceKind, InstanceState } from '../enums';
import {
  ConflictError,
  KosmoError,
  NotFoundError,
  PermissionDeniedError,
  ValidationError,
} from '../error';
import { profileFollowRemovalInputSchema } from '../validation/profile-follow';
import {
  acceptProfileFollowRequestInTransaction,
  approveProfileFollowRequestInTransaction,
  deleteProfileFollowRequestAsActorInTransaction,
  followProfileInTransaction,
  removeProfileFollowProjection,
} from './profile-follow-transaction';
import type { Transaction } from '../db';
import type { ErrorCode } from '../error';
import type {
  ProfileFollowEffectOrigin,
  ProfileFollowPairCommand,
  ProfileFollowRemovalInput,
} from '../validation/profile-follow';
import type { ProfileFollowPair } from './profile-follow-relation';

export type { ProfileFollowEffectOrigin, ProfileFollowPairCommand, ProfileFollowRemovalInput };

type ProfileFollowRow = typeof ProfileFollows.$inferSelect;
export type ProfileFollowRequestRow = typeof ProfileFollowRequests.$inferSelect;

export type ProfileFollowPairLifecycleState =
  | 'INITIAL'
  | 'PENDING'
  | 'ESTABLISHED'
  | 'REJECTED'
  | 'CANCELLED';

/** Input for the pair transaction Activity. Values are JSON-safe. */
export type ProfileFollowPairTransitionInput = {
  readonly pair: ProfileFollowPair;
  readonly command: ProfileFollowPairCommand;
  /** Deterministic candidate ID allocated by the Workflow for a new Follow. */
  readonly candidateRowId?: string;
  /** Deterministic candidate Follow ID allocated for approval/accept. */
  readonly followCandidateId?: string;
  /** Only the pending request identity is retained across Activity retries. */
  readonly pendingRequestId?: string;
};

/** The committed projection identity needed by notification/Fedify Activities. */
export type ProfileFollowCreateEffectInput = {
  readonly sourceId: string;
  readonly sourceKind: 'FOLLOW' | 'FOLLOW_REQUEST';
  readonly sendActivityPub?: boolean;
};

/**
 * A delete never carries a deleted row or timestamp. `sourceId` is the exact
 * generation being removed and the pair is enough to rebuild an Undo after
 * an Activity completion is lost.
 */
export type ProfileFollowDeleteEffectInput = {
  readonly sourceId: string;
  readonly followerProfileId: string;
  readonly followeeProfileId: string;
  readonly sourceKind: 'FOLLOW' | 'FOLLOW_REQUEST';
  readonly sendActivityPub?: boolean;
};

export type ProfileFollowPairEffect =
  | { readonly kind: 'CREATE'; readonly input: ProfileFollowCreateEffectInput }
  | { readonly kind: 'DELETE'; readonly input: ProfileFollowDeleteEffectInput };
export type ProfileFollowPairEffectPlan = readonly ProfileFollowPairEffect[];

export type ProfileFollowPairTransitionResult =
  | {
      readonly commandKind: 'FOLLOW';
      readonly created: boolean;
      readonly kind: 'ESTABLISHED' | 'PENDING';
      readonly followerProfileId: string;
      readonly followeeProfileId: string;
      readonly profileFollowId?: string;
      readonly profileFollowRequestId?: string;
    }
  | {
      readonly commandKind: 'APPROVE' | 'ACCEPT';
      readonly kind: 'ACCEPTED' | 'ALREADY_ESTABLISHED' | 'NOOP';
      readonly followerProfileId: string;
      readonly followeeProfileId: string;
      readonly profileFollowId?: string;
      readonly profileFollowRequestId?: string;
    }
  | {
      readonly commandKind: 'REJECT' | 'CANCEL';
      readonly changed: boolean;
      readonly followerProfileId: string;
      readonly followeeProfileId: string;
      readonly profileFollowRequestId: string;
    };

export type HydratedProfileFollowPairTransition = {
  readonly result: ProfileFollowPairTransitionResult;
  readonly followerProfile: typeof Profiles.$inferSelect;
  readonly followeeProfile: typeof Profiles.$inferSelect;
  readonly profileFollow?: ProfileFollowRow;
  readonly profileFollowRequest?: ProfileFollowRequestRow;
};

export type ProfileFollowPairTransitionFailure = {
  readonly code: ErrorCode;
  readonly message: string;
  readonly field?: string;
};

/** Public transition result; effect orchestration stays inside the Worker. */
export type ProfileFollowPairTransitionOutcome =
  | {
      readonly ok: true;
      readonly result: ProfileFollowPairTransitionResult;
    }
  | { readonly ok: false; readonly error: ProfileFollowPairTransitionFailure };

/** Activity result with the Worker-only lifecycle and effect plan metadata. */
export type ProfileFollowPairTransitionExecution =
  | (Extract<ProfileFollowPairTransitionOutcome, { readonly ok: true }> & {
      readonly nextState: Exclude<ProfileFollowPairLifecycleState, 'INITIAL'>;
      readonly effectPlan: ProfileFollowPairEffectPlan;
      readonly pendingRequestId?: string;
    })
  | Extract<ProfileFollowPairTransitionOutcome, { readonly ok: false }>;

type ProfileFollowPairTransitionSuccess = Extract<
  ProfileFollowPairTransitionExecution,
  { readonly ok: true }
>;

/** Public removal result; effect orchestration stays inside the Worker. */
export type ProfileFollowRemovalOutcome =
  | {
      readonly ok: true;
      readonly changed: boolean;
      readonly profileFollowId: string | null;
      readonly followerProfileId: string;
      readonly followeeProfileId: string;
    }
  | { readonly ok: false; readonly error: ProfileFollowPairTransitionFailure };

/** Activity result with the Worker-only effect plan metadata. */
export type ProfileFollowRemovalExecution =
  | (Extract<ProfileFollowRemovalOutcome, { readonly ok: true }> & {
      readonly effectPlan: ProfileFollowPairEffectPlan;
    })
  | Extract<ProfileFollowRemovalOutcome, { readonly ok: false }>;

const serializeFailure = (error: KosmoError): ProfileFollowPairTransitionFailure => {
  const field = 'field' in error && typeof error.field === 'string' ? error.field : undefined;
  return {
    code: error.code,
    message: error.message,
    ...(field === undefined ? {} : { field }),
  };
};

export const rehydrateProfileFollowFailure = (
  failure: ProfileFollowPairTransitionFailure,
): KosmoError => {
  switch (failure.code) {
    case 'CONFLICT':
      return new ConflictError({ message: failure.message, field: failure.field });
    case 'NOT_FOUND':
      return new NotFoundError(failure.message);
    case 'PERMISSION_DENIED':
      return new PermissionDeniedError(failure.message);
    case 'VALIDATION':
      return new ValidationError(failure.message, { field: failure.field });
  }
};

const pairCondition = (
  table: typeof ProfileFollows | typeof ProfileFollowRequests,
  pair: ProfileFollowPair,
) =>
  and(
    eq(table.followerProfileId, pair.followerProfileId),
    eq(table.followeeProfileId, pair.followeeProfileId),
  );

const deleteEffect = ({
  sourceId,
  pair,
  sourceKind,
  sendActivityPub,
}: {
  readonly sourceId: string;
  readonly pair: ProfileFollowPair;
  readonly sourceKind: ProfileFollowDeleteEffectInput['sourceKind'];
  readonly sendActivityPub?: boolean;
}): ProfileFollowPairEffect => ({
  kind: 'DELETE',
  input: {
    sourceId,
    followerProfileId: pair.followerProfileId,
    followeeProfileId: pair.followeeProfileId,
    sourceKind,
    ...(sendActivityPub === undefined ? {} : { sendActivityPub }),
  },
});

const shouldSendActivityPub = async (tx: Transaction, pair: ProfileFollowPair) => {
  const participants = await tx
    .select({ id: Profiles.id, kind: Instances.kind, state: Instances.state })
    .from(Profiles)
    .innerJoin(Instances, eq(Instances.id, Profiles.instanceId))
    .where(inArray(Profiles.id, [pair.followerProfileId, pair.followeeProfileId]));
  const followee = participants.find(({ id }) => id === pair.followeeProfileId);
  return (
    participants.find(({ id }) => id === pair.followerProfileId)?.kind === InstanceKind.LOCAL &&
    followee?.kind === InstanceKind.ACTIVITYPUB &&
    followee.state === InstanceState.ACTIVE
  );
};

/** Read only the pending request identity before a mutating Update. */
export const loadPendingFollowRequestId = async (input: {
  readonly pair: ProfileFollowPair;
  readonly expectedRowId?: string;
}): Promise<string | undefined> =>
  db
    .select({ id: ProfileFollowRequests.id })
    .from(ProfileFollowRequests)
    .where(
      and(
        pairCondition(ProfileFollowRequests, input.pair),
        input.expectedRowId === undefined
          ? undefined
          : eq(ProfileFollowRequests.id, input.expectedRowId),
      ),
    )
    .limit(1)
    .then(first)
    .then((row) => row?.id);

const executeFollow = async (
  input: ProfileFollowPairTransitionInput,
  tx: Transaction,
): Promise<ProfileFollowPairTransitionSuccess> => {
  const command = input.command;
  if (command.kind !== 'FOLLOW') {
    throw new Error('Invalid Follow command');
  }

  const requestToDeleteId =
    (
      await tx
        .select({ id: ProfileFollowRequests.id })
        .from(ProfileFollowRequests)
        .where(pairCondition(ProfileFollowRequests, input.pair))
        .limit(1)
        .then(first)
    )?.id ?? input.pendingRequestId;
  const followed = await followProfileInTransaction(
    {
      ...input.pair,
      candidateProfileFollowId: input.candidateRowId,
      candidateProfileFollowRequestId: input.candidateRowId,
    },
    tx,
  );
  const followResult = followed.result;
  const profileFollowId =
    followResult.kind === 'ESTABLISHED' ? followResult.profileFollow.id : undefined;
  const profileFollowRequestId =
    followResult.kind === 'PENDING' ? followResult.profileFollowRequest.id : undefined;
  const created =
    followed.created ||
    (input.candidateRowId !== undefined &&
      (profileFollowId === input.candidateRowId ||
        profileFollowRequestId === input.candidateRowId));
  const effectPlan: ProfileFollowPairEffect[] = [];

  if (followResult.kind === 'ESTABLISHED' && requestToDeleteId !== undefined) {
    effectPlan.push(
      deleteEffect({
        sourceId: requestToDeleteId,
        pair: input.pair,
        sourceKind: 'FOLLOW_REQUEST',
      }),
    );
  }
  if (created) {
    effectPlan.push({
      kind: 'CREATE',
      input: {
        sourceId: profileFollowId ?? profileFollowRequestId!,
        sourceKind: followResult.kind === 'ESTABLISHED' ? 'FOLLOW' : 'FOLLOW_REQUEST',
        ...(command.origin === 'LOCAL' ? { sendActivityPub: followed.sendActivityPub } : {}),
      },
    });
  }

  return {
    ok: true,
    result: {
      commandKind: 'FOLLOW',
      created,
      kind: followResult.kind,
      followerProfileId: input.pair.followerProfileId,
      followeeProfileId: input.pair.followeeProfileId,
      ...(profileFollowId === undefined ? {} : { profileFollowId }),
      ...(profileFollowRequestId === undefined ? {} : { profileFollowRequestId }),
    },
    nextState: followResult.kind === 'ESTABLISHED' ? 'ESTABLISHED' : 'PENDING',
    effectPlan,
    ...(followResult.kind === 'PENDING' ? { pendingRequestId: profileFollowRequestId } : {}),
  };
};

type ApprovalCommand = Extract<ProfileFollowPairCommand, { kind: 'APPROVE' | 'ACCEPT' }>;

const executeApproveOrAccept = async (
  input: ProfileFollowPairTransitionInput,
  tx: Transaction,
): Promise<ProfileFollowPairTransitionSuccess> => {
  const command = input.command as ApprovalCommand;
  if (command.kind !== 'APPROVE' && command.kind !== 'ACCEPT') {
    throw new Error('Invalid approval command');
  }

  const expectedRowId = command.expectedRowId;
  const existingFollow = await tx
    .select({ id: ProfileFollows.id })
    .from(ProfileFollows)
    .where(pairCondition(ProfileFollows, input.pair))
    .limit(1)
    .then(first);
  const currentRequest = await tx
    .select({ id: ProfileFollowRequests.id })
    .from(ProfileFollowRequests)
    .where(
      and(
        pairCondition(ProfileFollowRequests, input.pair),
        eq(ProfileFollowRequests.id, expectedRowId),
      ),
    )
    .limit(1)
    .then(first);
  const pendingRequestId =
    currentRequest?.id ??
    (
      await tx
        .select({ id: ProfileFollowRequests.id })
        .from(ProfileFollowRequests)
        .where(pairCondition(ProfileFollowRequests, input.pair))
        .limit(1)
        .then(first)
    )?.id ??
    input.pendingRequestId;
  const followId = input.followCandidateId;

  if (!currentRequest && existingFollow) {
    if (followId !== existingFollow.id) {
      return {
        ok: true,
        result: {
          commandKind: command.kind,
          kind: 'NOOP',
          followerProfileId: input.pair.followerProfileId,
          followeeProfileId: input.pair.followeeProfileId,
        },
        nextState: 'PENDING',
        effectPlan: [],
        ...(pendingRequestId === undefined ? {} : { pendingRequestId }),
      };
    }

    const effectPlan: ProfileFollowPairEffect[] = [];
    if (pendingRequestId === expectedRowId) {
      effectPlan.push(
        deleteEffect({
          sourceId: expectedRowId,
          pair: input.pair,
          sourceKind: 'FOLLOW_REQUEST',
        }),
      );
    }
    effectPlan.push({
      kind: 'CREATE',
      input: { sourceId: existingFollow.id, sourceKind: 'FOLLOW' },
    });
    return {
      ok: true,
      result: {
        commandKind: command.kind,
        kind: 'ACCEPTED',
        followerProfileId: input.pair.followerProfileId,
        followeeProfileId: input.pair.followeeProfileId,
        profileFollowId: existingFollow.id,
        profileFollowRequestId: expectedRowId,
      },
      nextState: 'ESTABLISHED',
      effectPlan,
    };
  }

  if (!currentRequest) {
    return {
      ok: true,
      result: {
        commandKind: command.kind,
        kind: 'NOOP',
        followerProfileId: input.pair.followerProfileId,
        followeeProfileId: input.pair.followeeProfileId,
      },
      nextState: 'PENDING',
      effectPlan: [],
      ...(pendingRequestId === undefined ? {} : { pendingRequestId }),
    };
  }

  const effectPlan: ProfileFollowPairEffect[] = [];
  let kind: 'ACCEPTED' | 'ALREADY_ESTABLISHED' | 'NOOP';
  let committedFollowId: string | undefined;
  let committedRequestId = currentRequest.id;
  if (command.kind === 'APPROVE') {
    const approved = await approveProfileFollowRequestInTransaction(
      {
        actorProfileId: command.actorProfileId,
        profileFollowRequestId: expectedRowId,
        candidateProfileFollowId: followId,
      },
      tx,
    );
    kind = approved.created ? 'ACCEPTED' : 'ALREADY_ESTABLISHED';
    committedFollowId = approved.profileFollow.id;
    committedRequestId = approved.profileFollowRequestId;
    effectPlan.push(
      deleteEffect({
        sourceId: approved.profileFollowRequestId,
        pair: input.pair,
        sourceKind: 'FOLLOW_REQUEST',
      }),
    );
    if (approved.created || committedFollowId === followId) {
      effectPlan.push({
        kind: 'CREATE',
        input: { sourceId: committedFollowId, sourceKind: 'FOLLOW' },
      });
    }
  } else {
    const accepted = await acceptProfileFollowRequestInTransaction(
      {
        ...input.pair,
        expectedRowId,
        candidateProfileFollowId: followId,
      },
      tx,
    );
    kind = accepted.result.kind;
    committedFollowId = accepted.createdFollowId;
    committedRequestId = accepted.deletedRequestId ?? currentRequest.id;
    if (accepted.deletedRequestId !== undefined) {
      effectPlan.push(
        deleteEffect({
          sourceId: accepted.deletedRequestId,
          pair: input.pair,
          sourceKind: 'FOLLOW_REQUEST',
        }),
      );
    }
    if (accepted.createdFollowId !== undefined) {
      effectPlan.push({
        kind: 'CREATE',
        input: { sourceId: accepted.createdFollowId, sourceKind: 'FOLLOW' },
      });
    }
  }

  return {
    ok: true,
    result: {
      commandKind: command.kind,
      kind,
      followerProfileId: input.pair.followerProfileId,
      followeeProfileId: input.pair.followeeProfileId,
      ...(committedFollowId === undefined ? {} : { profileFollowId: committedFollowId }),
      ...(kind === 'NOOP' ? {} : { profileFollowRequestId: expectedRowId }),
    },
    nextState: kind === 'NOOP' ? 'PENDING' : 'ESTABLISHED',
    effectPlan,
    ...(kind === 'NOOP' && committedRequestId !== undefined
      ? { pendingRequestId: committedRequestId }
      : {}),
  };
};

const executeRejectOrCancel = async (
  input: ProfileFollowPairTransitionInput,
  tx: Transaction,
): Promise<ProfileFollowPairTransitionSuccess> => {
  const command = input.command;
  if (command.kind !== 'REJECT' && command.kind !== 'CANCEL') {
    throw new Error('Invalid terminal command');
  }

  const expectedRowId = command.expectedRowId;
  const currentRequest = await tx
    .select({ id: ProfileFollowRequests.id })
    .from(ProfileFollowRequests)
    .where(
      and(
        pairCondition(ProfileFollowRequests, input.pair),
        eq(ProfileFollowRequests.id, expectedRowId),
      ),
    )
    .limit(1)
    .then(first);
  const conflictingRequest = await tx
    .select({ id: ProfileFollowRequests.id })
    .from(ProfileFollowRequests)
    .where(pairCondition(ProfileFollowRequests, input.pair))
    .limit(1)
    .then(first);

  if (!currentRequest && conflictingRequest) {
    return {
      ok: true,
      result: {
        commandKind: command.kind,
        changed: false,
        followerProfileId: input.pair.followerProfileId,
        followeeProfileId: input.pair.followeeProfileId,
        profileFollowRequestId: expectedRowId,
      },
      nextState: 'PENDING',
      effectPlan: [],
      pendingRequestId: conflictingRequest.id,
    };
  }

  if (command.origin === 'LOCAL' && command.actorProfileId === undefined) {
    throw new ValidationError('Actor profile is required for a local terminal command');
  }

  let deletedRequestId: string | undefined;
  if (currentRequest) {
    if (command.origin === 'LOCAL') {
      const deleted = await deleteProfileFollowRequestAsActorInTransaction(
        {
          actorProfileId: command.actorProfileId!,
          actorRole: command.kind === 'REJECT' ? 'FOLLOWEE' : 'FOLLOWER',
          profileFollowRequestId: expectedRowId,
        },
        tx,
      );
      deletedRequestId = deleted.id;
    } else {
      const deleted = await removeProfileFollowProjection(
        {
          ...input.pair,
          expectedRowId,
          removePendingRequest: true,
        },
        tx,
      );
      deletedRequestId = deleted.profileFollowRequest?.id;
    }
  }

  const sourceId =
    deletedRequestId ??
    (currentRequest === undefined && input.pendingRequestId === expectedRowId
      ? expectedRowId
      : undefined);
  if (sourceId === undefined) {
    return {
      ok: true,
      result: {
        commandKind: command.kind,
        changed: false,
        followerProfileId: input.pair.followerProfileId,
        followeeProfileId: input.pair.followeeProfileId,
        profileFollowRequestId: expectedRowId,
      },
      nextState: 'PENDING',
      effectPlan: [],
      ...(currentRequest === undefined ? {} : { pendingRequestId: currentRequest.id }),
    };
  }

  return {
    ok: true,
    result: {
      commandKind: command.kind,
      changed: true,
      followerProfileId: input.pair.followerProfileId,
      followeeProfileId: input.pair.followeeProfileId,
      profileFollowRequestId: expectedRowId,
    },
    nextState: command.kind === 'REJECT' ? 'REJECTED' : 'CANCELLED',
    effectPlan: [
      deleteEffect({
        sourceId,
        pair: input.pair,
        sourceKind: 'FOLLOW_REQUEST',
        ...(command.kind === 'CANCEL' && command.origin === 'LOCAL'
          ? { sendActivityPub: await shouldSendActivityPub(tx, input.pair) }
          : {}),
      }),
    ],
  };
};

/** Transaction-only pair lifecycle Activity. */
export const executeProfileFollowPairTransition = async (
  input: ProfileFollowPairTransitionInput,
): Promise<ProfileFollowPairTransitionExecution> => {
  try {
    return await db.transaction((tx) => {
      switch (input.command.kind) {
        case 'FOLLOW':
          return executeFollow(input, tx);
        case 'APPROVE':
        case 'ACCEPT':
          return executeApproveOrAccept(input, tx);
        case 'REJECT':
        case 'CANCEL':
          return executeRejectOrCancel(input, tx);
      }
    });
  } catch (error) {
    if (error instanceof KosmoError) {
      return { ok: false, error: serializeFailure(error) };
    }
    throw error;
  }
};

/** Rehydrates only the public result after the Temporal boundary. */
export const hydrateProfileFollowPairTransition = async (
  result: ProfileFollowPairTransitionResult,
): Promise<HydratedProfileFollowPairTransition> => {
  const profiles = await db
    .select()
    .from(Profiles)
    .where(inArray(Profiles.id, [result.followerProfileId, result.followeeProfileId]));
  const followerProfile = profiles.find(({ id }) => id === result.followerProfileId);
  const followeeProfile = profiles.find(({ id }) => id === result.followeeProfileId);
  if (!followerProfile || !followeeProfile) {
    throw new NotFoundError('Profile not found');
  }

  const profileFollow =
    'profileFollowId' in result && result.profileFollowId !== undefined
      ? await db
          .select()
          .from(ProfileFollows)
          .where(eq(ProfileFollows.id, result.profileFollowId))
          .limit(1)
          .then(first)
      : undefined;
  const profileFollowRequest =
    'profileFollowRequestId' in result && result.profileFollowRequestId !== undefined
      ? await db
          .select()
          .from(ProfileFollowRequests)
          .where(eq(ProfileFollowRequests.id, result.profileFollowRequestId))
          .limit(1)
          .then(first)
      : undefined;
  return {
    result,
    followerProfile,
    followeeProfile,
    ...(profileFollow === undefined ? {} : { profileFollow }),
    ...(profileFollowRequest === undefined ? {} : { profileFollowRequest }),
  };
};

/** Short command used after an established Follow (local Unfollow or Undo). */
export const executeProfileFollowRemoval = async (
  input: ProfileFollowRemovalInput,
): Promise<ProfileFollowRemovalExecution> => {
  try {
    const parsedInput = profileFollowRemovalInputSchema.safeParse(input);
    if (!parsedInput.success) {
      throw new ValidationError('Invalid profile follow removal input');
    }
    const validatedInput = parsedInput.data;

    return await db.transaction(async (tx) => {
      const currentFollow = await tx
        .select({ id: ProfileFollows.id })
        .from(ProfileFollows)
        .where(pairCondition(ProfileFollows, validatedInput))
        .limit(1)
        .then(first);
      const deleted = await removeProfileFollowProjection(
        {
          expectedRowId: validatedInput.expectedRowId,
          followerProfileId: validatedInput.followerProfileId,
          followeeProfileId: validatedInput.followeeProfileId,
          removePendingRequest: false,
        },
        tx,
      );
      const sourceId =
        deleted.profileFollow?.id ??
        (currentFollow?.id === validatedInput.expectedRowId
          ? undefined
          : validatedInput.expectedRowId);
      if (sourceId === undefined) {
        return {
          ok: true,
          changed: false,
          profileFollowId: null,
          followerProfileId: validatedInput.followerProfileId,
          followeeProfileId: validatedInput.followeeProfileId,
          effectPlan: [],
        };
      }

      return {
        ok: true,
        changed: true,
        profileFollowId: deleted.profileFollow?.id ?? null,
        followerProfileId: validatedInput.followerProfileId,
        followeeProfileId: validatedInput.followeeProfileId,
        effectPlan: [
          deleteEffect({
            sourceId,
            pair: validatedInput,
            sourceKind: 'FOLLOW',
            ...(validatedInput.origin === 'LOCAL'
              ? { sendActivityPub: await shouldSendActivityPub(tx, validatedInput) }
              : {}),
          }),
        ],
      };
    });
  } catch (error) {
    if (error instanceof KosmoError) {
      return { ok: false, error: serializeFailure(error) };
    }
    throw error;
  }
};
