import { and, eq, inArray } from 'drizzle-orm';
import { db, first, ProfileFollowRequests, ProfileFollows, Profiles } from '../db';
import {
  ConflictError,
  KosmoError,
  NotFoundError,
  PermissionDeniedError,
  ValidationError,
} from '../error';
import {
  acceptProfileFollowRequestInTransaction,
  approveProfileFollowRequestInTransaction,
  cancelProfileFollowRequestInTransaction,
  followProfileInTransaction,
  rejectProfileFollowRequestInTransaction,
  removeInboundFollowInTransaction,
  removeProfileFollowProjection,
} from './profile-follow-transaction';
import type { Transaction } from '../db';
import type { ErrorCode } from '../error';
import type {
  ProfileFollowEffectOrigin,
  ProfileFollowRequestRow,
} from './profile-follow-transaction';

type ProfileFollowRow = typeof ProfileFollows.$inferSelect;

export type ProfileFollowPair = {
  readonly followerProfileId: string;
  readonly followeeProfileId: string;
};

export type ProfileFollowPairLifecycleState =
  | 'INITIAL'
  | 'PENDING'
  | 'ESTABLISHED'
  | 'REJECTED'
  | 'CANCELLED';

/** Minimum immutable data needed to clean a deleted pending request. */
export type ProfileFollowPendingSnapshot = ProfileFollowEntitySnapshot;

export type ProfileFollowPairCommand =
  | (ProfileFollowPair & {
      readonly kind: 'FOLLOW';
      readonly origin: ProfileFollowEffectOrigin;
    })
  | (ProfileFollowPair & {
      readonly kind: 'APPROVE';
      readonly actorProfileId: string;
      readonly expectedRowId: string;
      readonly origin: 'LOCAL';
    })
  | (ProfileFollowPair & {
      readonly kind: 'ACCEPT';
      readonly expectedRowId: string;
      readonly origin: 'ACTIVITYPUB';
    })
  | (ProfileFollowPair & {
      readonly kind: 'REJECT';
      readonly actorProfileId?: string;
      readonly expectedRowId: string;
      readonly origin: ProfileFollowEffectOrigin;
    })
  | (ProfileFollowPair & {
      readonly kind: 'CANCEL';
      readonly actorProfileId?: string;
      readonly expectedRowId: string;
      readonly origin: ProfileFollowEffectOrigin;
    });

/**
 * Immutable row data captured by the transaction Activity.  The row itself
 * may be deleted by a subsequent pair transition before the API rehydrates
 * the Update result, so the Temporal wire result must carry enough data to
 * preserve the committed mutation without serializing Temporal.Instant or a
 * full database row into Workflow history.
 */
export type ProfileFollowEntitySnapshot = {
  readonly id: string;
  readonly followerProfileId: string;
  readonly followeeProfileId: string;
  readonly createdAt: string;
};

/** Input for the pair transaction Activity. Values are all JSON-safe. */
export type ProfileFollowPairTransitionInput = {
  readonly pair: ProfileFollowPair;
  readonly command: ProfileFollowPairCommand;
  /** Deterministic candidate ID allocated by the Workflow for initial Follow. */
  readonly candidateRowId?: string;
  /** Deterministic candidate Follow ID allocated for approval/accept. */
  readonly followCandidateId?: string;
  readonly pendingSnapshot?: ProfileFollowPendingSnapshot;
};

export type ProfileFollowCreateEffectInput = {
  readonly sourceId: string;
} & (
  | {
      readonly origin: 'LOCAL';
      readonly sourceKind: 'FOLLOW';
      readonly transition: 'FOLLOW' | 'APPROVE';
    }
  | {
      readonly origin: 'LOCAL';
      readonly sourceKind: 'FOLLOW_REQUEST';
      readonly transition: 'FOLLOW';
    }
  | {
      readonly origin: 'ACTIVITYPUB';
      readonly sourceKind: 'FOLLOW';
      readonly transition: 'INBOUND_FOLLOW' | 'INBOUND_ACCEPT';
    }
  | {
      readonly origin: 'ACTIVITYPUB';
      readonly sourceKind: 'FOLLOW_REQUEST';
      readonly transition: 'INBOUND_FOLLOW';
    }
);

export type ProfileFollowDeleteEffectInput = {
  readonly createdAt: string;
  readonly followerProfileId: string;
  readonly followeeProfileId: string;
  readonly id: string;
  readonly sourceId: string;
} & (
  | {
      readonly origin: 'LOCAL';
      readonly sourceKind: 'FOLLOW_REQUEST';
      readonly transition: 'APPROVE' | 'REJECT' | 'CANCEL';
    }
  | {
      readonly origin: 'ACTIVITYPUB';
      readonly sourceKind: 'FOLLOW_REQUEST';
      readonly transition: 'INBOUND_FOLLOW' | 'INBOUND_ACCEPT' | 'INBOUND_UNDO' | 'INBOUND_REJECT';
    }
  | {
      readonly origin: 'LOCAL';
      readonly sourceKind: 'FOLLOW';
      readonly transition: 'UNFOLLOW';
    }
  | {
      readonly origin: 'ACTIVITYPUB';
      readonly sourceKind: 'FOLLOW';
      readonly transition: 'INBOUND_UNDO' | 'INBOUND_REJECT';
    }
);

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
      readonly profileFollowSnapshot?: ProfileFollowEntitySnapshot;
      readonly profileFollowRequestSnapshot?: ProfileFollowEntitySnapshot;
    }
  | {
      readonly commandKind: 'APPROVE' | 'ACCEPT';
      readonly kind: 'ACCEPTED' | 'ALREADY_ESTABLISHED' | 'NOOP';
      readonly followerProfileId: string;
      readonly followeeProfileId: string;
      readonly profileFollowId?: string;
      readonly profileFollowRequestId?: string;
      readonly profileFollowSnapshot?: ProfileFollowEntitySnapshot;
      readonly profileFollowRequestSnapshot?: ProfileFollowEntitySnapshot;
    }
  | {
      readonly commandKind: 'REJECT' | 'CANCEL';
      readonly changed: boolean;
      readonly followerProfileId: string;
      readonly followeeProfileId: string;
      readonly profileFollowRequestId: string;
      readonly profileFollowSnapshot?: ProfileFollowEntitySnapshot;
      readonly profileFollowRequestSnapshot?: ProfileFollowEntitySnapshot;
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

export type ProfileFollowPairTransitionExecution =
  | {
      readonly ok: true;
      readonly result: ProfileFollowPairTransitionResult;
      readonly nextState: Exclude<ProfileFollowPairLifecycleState, 'INITIAL'>;
      readonly effectPlan: ProfileFollowPairEffectPlan;
      readonly pendingSnapshot?: ProfileFollowPendingSnapshot;
    }
  | { readonly ok: false; readonly error: ProfileFollowPairTransitionFailure };

type ProfileFollowPairTransitionSuccess = Extract<
  ProfileFollowPairTransitionExecution,
  { readonly ok: true }
>;

const entitySnapshotFromRow = (
  row: Pick<
    ProfileFollowRow | ProfileFollowRequestRow,
    'id' | 'followerProfileId' | 'followeeProfileId' | 'createdAt'
  >,
): ProfileFollowEntitySnapshot => ({
  id: row.id,
  followerProfileId: row.followerProfileId,
  followeeProfileId: row.followeeProfileId,
  createdAt: row.createdAt.toString(),
});

const entityRowFromSnapshot = (snapshot: ProfileFollowEntitySnapshot) => ({
  id: snapshot.id,
  followerProfileId: snapshot.followerProfileId,
  followeeProfileId: snapshot.followeeProfileId,
  createdAt: Temporal.Instant.from(snapshot.createdAt),
});

/** Separate short command input for established relation removal. */
export type ProfileFollowRemovalInput =
  | (ProfileFollowPair & {
      readonly expectedRowId: string;
      readonly origin: 'LOCAL';
      readonly transition: 'UNFOLLOW';
      readonly snapshot?: ProfileFollowRemovalSnapshot;
    })
  | (ProfileFollowPair & {
      readonly expectedRowId: string;
      readonly origin: 'ACTIVITYPUB';
      readonly transition: 'INBOUND_UNDO' | 'INBOUND_REJECT';
      readonly snapshot?: ProfileFollowRemovalSnapshot;
    });

export type ProfileFollowRemovalSnapshot = {
  readonly id: string;
  readonly followerProfileId: string;
  readonly followeeProfileId: string;
  readonly createdAt: string;
};

export type ProfileFollowRemovalExecution =
  | {
      readonly ok: true;
      readonly changed: boolean;
      readonly profileFollowId: string | null;
      readonly followerProfileId: string;
      readonly followeeProfileId: string;
      readonly effectPlan: ProfileFollowPairEffectPlan;
    }
  | { readonly ok: false; readonly error: ProfileFollowPairTransitionFailure };

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

type DeleteEffectDetails = ProfileFollowDeleteEffectInput extends infer Input
  ? Input extends ProfileFollowDeleteEffectInput
    ? Omit<Input, 'createdAt' | 'followerProfileId' | 'followeeProfileId' | 'id' | 'sourceId'>
    : never
  : never;

const deleteEffect = (
  row: Pick<
    ProfileFollowRow | ProfileFollowRequestRow,
    'id' | 'createdAt' | 'followerProfileId' | 'followeeProfileId'
  >,
  details: DeleteEffectDetails,
): ProfileFollowPairEffect => ({
  kind: 'DELETE',
  input: {
    createdAt: row.createdAt.toString(),
    followerProfileId: row.followerProfileId,
    followeeProfileId: row.followeeProfileId,
    id: row.id,
    sourceId: row.id,
    ...details,
  },
});

const createEffect = (input: ProfileFollowCreateEffectInput): ProfileFollowPairEffect => ({
  kind: 'CREATE',
  input,
});

const pairCondition = (
  table: typeof ProfileFollows | typeof ProfileFollowRequests,
  pair: ProfileFollowPair,
) =>
  and(
    eq(table.followerProfileId, pair.followerProfileId),
    eq(table.followeeProfileId, pair.followeeProfileId),
  );

const pendingSnapshotFromRow = (row: ProfileFollowRequestRow): ProfileFollowPendingSnapshot => ({
  id: row.id,
  followerProfileId: row.followerProfileId,
  followeeProfileId: row.followeeProfileId,
  createdAt: row.createdAt.toString(),
});

const pendingSnapshotForInput = (
  input: ProfileFollowPairTransitionInput,
  row: ProfileFollowRequestRow | undefined,
): ProfileFollowPendingSnapshot | undefined =>
  row === undefined ? input.pendingSnapshot : pendingSnapshotFromRow(row);

/** Read-only Activity used to bootstrap a terminal Update for an orphan run. */
export const loadPendingFollowRequestSnapshot = async (input: {
  readonly pair: ProfileFollowPair;
  readonly expectedRowId?: string;
}): Promise<ProfileFollowPendingSnapshot | undefined> => {
  const row = await db
    .select()
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
    .then(first);
  return row === undefined ? undefined : pendingSnapshotFromRow(row);
};

const executeFollow = async (
  input: ProfileFollowPairTransitionInput,
  tx: Transaction,
): Promise<ProfileFollowPairTransitionSuccess> => {
  const command = input.command;
  const beforeRequest = await tx
    .select()
    .from(ProfileFollowRequests)
    .where(pairCondition(ProfileFollowRequests, input.pair))
    .limit(1)
    .then(first);
  const { result } = await followProfileInTransaction(
    {
      ...input.pair,
      origin: command.origin,
      candidateProfileFollowId: input.candidateRowId,
      candidateProfileFollowRequestId: input.candidateRowId,
    },
    tx,
  );
  const followResult = result.result;
  const profileFollowId =
    followResult.kind === 'ESTABLISHED' ? followResult.profileFollow.id : undefined;
  const profileFollowRequestId =
    followResult.kind === 'PENDING' ? followResult.profileFollowRequest.id : undefined;
  const created =
    result.created ||
    (input.candidateRowId !== undefined &&
      (profileFollowId === input.candidateRowId ||
        profileFollowRequestId === input.candidateRowId));

  const effectPlan: ProfileFollowPairEffect[] = [];
  const requestToDelete =
    beforeRequest ??
    (input.pendingSnapshot === undefined
      ? undefined
      : entityRowFromSnapshot(input.pendingSnapshot));
  if (requestToDelete && followResult.kind === 'ESTABLISHED') {
    effectPlan.push(
      command.origin === 'ACTIVITYPUB'
        ? deleteEffect(requestToDelete, {
            sourceKind: 'FOLLOW_REQUEST',
            origin: 'ACTIVITYPUB',
            transition: 'INBOUND_FOLLOW',
          })
        : deleteEffect(requestToDelete, {
            sourceKind: 'FOLLOW_REQUEST',
            origin: 'LOCAL',
            transition: 'APPROVE',
          }),
    );
  }
  if (created) {
    if (followResult.kind === 'ESTABLISHED') {
      effectPlan.push(
        command.origin === 'ACTIVITYPUB'
          ? createEffect({
              sourceId: profileFollowId!,
              sourceKind: 'FOLLOW',
              origin: 'ACTIVITYPUB',
              transition: 'INBOUND_FOLLOW',
            })
          : createEffect({
              sourceId: profileFollowId!,
              sourceKind: 'FOLLOW',
              origin: 'LOCAL',
              transition: 'FOLLOW',
            }),
      );
    } else {
      effectPlan.push(
        command.origin === 'ACTIVITYPUB'
          ? createEffect({
              sourceId: profileFollowRequestId!,
              sourceKind: 'FOLLOW_REQUEST',
              origin: 'ACTIVITYPUB',
              transition: 'INBOUND_FOLLOW',
            })
          : createEffect({
              sourceId: profileFollowRequestId!,
              sourceKind: 'FOLLOW_REQUEST',
              origin: 'LOCAL',
              transition: 'FOLLOW',
            }),
      );
    }
  }
  return {
    ok: true as const,
    result: {
      commandKind: 'FOLLOW' as const,
      created,
      kind: followResult.kind,
      followerProfileId: input.pair.followerProfileId,
      followeeProfileId: input.pair.followeeProfileId,
      ...(profileFollowId === undefined ? {} : { profileFollowId }),
      ...(profileFollowRequestId === undefined ? {} : { profileFollowRequestId }),
      ...(followResult.kind === 'ESTABLISHED'
        ? { profileFollowSnapshot: entitySnapshotFromRow(followResult.profileFollow) }
        : {
            profileFollowRequestSnapshot: entitySnapshotFromRow(followResult.profileFollowRequest),
          }),
    },
    nextState: followResult.kind === 'ESTABLISHED' ? 'ESTABLISHED' : 'PENDING',
    effectPlan,
    ...(followResult.kind === 'PENDING'
      ? {
          pendingSnapshot: {
            id: profileFollowRequestId!,
            followerProfileId: input.pair.followerProfileId,
            followeeProfileId: input.pair.followeeProfileId,
            createdAt: followResult.profileFollowRequest.createdAt.toString(),
          },
        }
      : {}),
  };
};

const executeApprove = async (
  input: ProfileFollowPairTransitionInput,
  tx: Transaction,
): Promise<ProfileFollowPairTransitionSuccess> => {
  const command = input.command;
  if (command.kind !== 'APPROVE') {
    throw new Error('Invalid approve command');
  }
  const expectedRowId = command.expectedRowId;
  const existingFollow = await tx
    .select()
    .from(ProfileFollows)
    .where(pairCondition(ProfileFollows, input.pair))
    .limit(1)
    .then(first);
  const currentRequest = await tx
    .select()
    .from(ProfileFollowRequests)
    .where(
      and(
        pairCondition(ProfileFollowRequests, input.pair),
        eq(ProfileFollowRequests.id, expectedRowId),
      ),
    )
    .limit(1)
    .then(first);
  const pendingRequest =
    currentRequest ??
    (await tx
      .select()
      .from(ProfileFollowRequests)
      .where(pairCondition(ProfileFollowRequests, input.pair))
      .limit(1)
      .then(first));
  const pendingSnapshot = pendingSnapshotForInput(input, pendingRequest);
  const followId = input.followCandidateId ?? input.candidateRowId;
  if (!currentRequest && existingFollow) {
    if (followId !== existingFollow.id) {
      return {
        ok: true as const,
        result: {
          commandKind: 'APPROVE' as const,
          kind: 'NOOP' as const,
          followerProfileId: input.pair.followerProfileId,
          followeeProfileId: input.pair.followeeProfileId,
          profileFollowSnapshot: entitySnapshotFromRow(existingFollow),
        },
        nextState: 'PENDING' as const,
        effectPlan: [] as ProfileFollowPairEffectPlan,
        ...(pendingSnapshot === undefined ? {} : { pendingSnapshot }),
      };
    }
    const effectPlan =
      input.pendingSnapshot?.id === expectedRowId
        ? [
            deleteEffect(entityRowFromSnapshot(input.pendingSnapshot), {
              sourceKind: 'FOLLOW_REQUEST',
              origin: 'LOCAL',
              transition: 'APPROVE',
            }),
          ]
        : [];
    effectPlan.push(
      createEffect({
        sourceId: existingFollow.id,
        sourceKind: 'FOLLOW',
        origin: 'LOCAL',
        transition: 'APPROVE',
      }),
    );
    return {
      ok: true as const,
      result: {
        commandKind: 'APPROVE' as const,
        kind: 'ACCEPTED' as const,
        followerProfileId: input.pair.followerProfileId,
        followeeProfileId: input.pair.followeeProfileId,
        profileFollowId: existingFollow.id,
        profileFollowRequestId: expectedRowId,
        profileFollowSnapshot: entitySnapshotFromRow(existingFollow),
      },
      nextState: 'ESTABLISHED' as const,
      effectPlan,
    };
  }
  if (!currentRequest) {
    return {
      ok: true as const,
      result: {
        commandKind: 'APPROVE' as const,
        kind: 'NOOP' as const,
        followerProfileId: input.pair.followerProfileId,
        followeeProfileId: input.pair.followeeProfileId,
      },
      nextState: 'PENDING' as const,
      effectPlan: [] as ProfileFollowPairEffectPlan,
      ...(pendingSnapshot === undefined ? {} : { pendingSnapshot }),
    };
  }
  const approved = await approveProfileFollowRequestInTransaction(
    {
      actorProfileId: command.actorProfileId,
      profileFollowRequestId: expectedRowId,
      candidateProfileFollowId: followId,
    },
    tx,
  );
  const effectPlan: ProfileFollowPairEffect[] = [
    deleteEffect(approved.profileFollowRequest, {
      sourceKind: 'FOLLOW_REQUEST',
      origin: 'LOCAL',
      transition: 'APPROVE',
    }),
  ];
  const committedFollowId = approved.profileFollow.id;
  if (approved.created || committedFollowId === followId) {
    effectPlan.push(
      createEffect({
        sourceId: committedFollowId,
        sourceKind: 'FOLLOW',
        origin: 'LOCAL',
        transition: 'APPROVE',
      }),
    );
  }
  return {
    ok: true as const,
    result: {
      commandKind: 'APPROVE' as const,
      kind: approved.created ? 'ACCEPTED' : 'ALREADY_ESTABLISHED',
      followerProfileId: input.pair.followerProfileId,
      followeeProfileId: input.pair.followeeProfileId,
      profileFollowId: committedFollowId,
      profileFollowRequestId: expectedRowId,
      profileFollowSnapshot: entitySnapshotFromRow(approved.profileFollow),
    },
    nextState: 'ESTABLISHED' as const,
    effectPlan,
  };
};

const executeAccept = async (
  input: ProfileFollowPairTransitionInput,
  tx: Transaction,
): Promise<ProfileFollowPairTransitionSuccess> => {
  const command = input.command;
  if (command.kind !== 'ACCEPT') {
    throw new Error('Invalid accept command');
  }
  const expectedRowId = command.expectedRowId;
  const existingFollow = await tx
    .select()
    .from(ProfileFollows)
    .where(pairCondition(ProfileFollows, input.pair))
    .limit(1)
    .then(first);
  const currentRequest = await tx
    .select()
    .from(ProfileFollowRequests)
    .where(
      and(
        pairCondition(ProfileFollowRequests, input.pair),
        eq(ProfileFollowRequests.id, expectedRowId),
      ),
    )
    .limit(1)
    .then(first);
  const pendingRequest =
    currentRequest ??
    (await tx
      .select()
      .from(ProfileFollowRequests)
      .where(pairCondition(ProfileFollowRequests, input.pair))
      .limit(1)
      .then(first));
  const pendingSnapshot = pendingSnapshotForInput(input, pendingRequest);
  const followId = input.followCandidateId ?? input.candidateRowId;
  if (!currentRequest && existingFollow) {
    if (followId !== existingFollow.id) {
      return {
        ok: true as const,
        result: {
          commandKind: 'ACCEPT' as const,
          kind: 'NOOP' as const,
          followerProfileId: input.pair.followerProfileId,
          followeeProfileId: input.pair.followeeProfileId,
        },
        nextState: 'PENDING' as const,
        effectPlan: [] as ProfileFollowPairEffectPlan,
        ...(pendingSnapshot === undefined ? {} : { pendingSnapshot }),
      };
    }
    const effectPlan =
      input.pendingSnapshot?.id === expectedRowId
        ? [
            deleteEffect(entityRowFromSnapshot(input.pendingSnapshot), {
              sourceKind: 'FOLLOW_REQUEST',
              origin: 'ACTIVITYPUB',
              transition: 'INBOUND_ACCEPT',
            }),
          ]
        : [];
    effectPlan.push(
      createEffect({
        sourceId: existingFollow.id,
        sourceKind: 'FOLLOW',
        origin: 'ACTIVITYPUB',
        transition: 'INBOUND_ACCEPT',
      }),
    );
    return {
      ok: true as const,
      result: {
        commandKind: 'ACCEPT' as const,
        kind: 'ACCEPTED' as const,
        followerProfileId: input.pair.followerProfileId,
        followeeProfileId: input.pair.followeeProfileId,
        profileFollowId: existingFollow.id,
        profileFollowRequestId: expectedRowId,
        profileFollowSnapshot: entitySnapshotFromRow(existingFollow),
      },
      nextState: 'ESTABLISHED' as const,
      effectPlan,
    };
  }
  if (!currentRequest) {
    return {
      ok: true as const,
      result: {
        commandKind: 'ACCEPT' as const,
        kind: 'NOOP' as const,
        followerProfileId: input.pair.followerProfileId,
        followeeProfileId: input.pair.followeeProfileId,
      },
      nextState: 'PENDING' as const,
      effectPlan: [] as ProfileFollowPairEffectPlan,
      ...(pendingSnapshot === undefined ? {} : { pendingSnapshot }),
    };
  }
  const accepted = await acceptProfileFollowRequestInTransaction(
    {
      ...input.pair,
      expectedRowId,
      origin: 'ACTIVITYPUB',
      candidateProfileFollowId: followId,
    },
    tx,
  );
  const effectPlan: ProfileFollowPairEffect[] = [];
  if (accepted.deletedRequest) {
    effectPlan.push(
      deleteEffect(accepted.deletedRequest, {
        sourceKind: 'FOLLOW_REQUEST',
        origin: 'ACTIVITYPUB',
        transition: 'INBOUND_ACCEPT',
      }),
    );
  }
  const committedFollowId = accepted.createdFollow?.id;
  if (committedFollowId !== undefined) {
    effectPlan.push(
      createEffect({
        sourceId: committedFollowId,
        sourceKind: 'FOLLOW',
        origin: 'ACTIVITYPUB',
        transition: 'INBOUND_ACCEPT',
      }),
    );
  }
  return {
    ok: true as const,
    result: {
      commandKind: 'ACCEPT' as const,
      kind: accepted.result.kind,
      followerProfileId: input.pair.followerProfileId,
      followeeProfileId: input.pair.followeeProfileId,
      ...(committedFollowId === undefined ? {} : { profileFollowId: committedFollowId }),
      profileFollowRequestId: expectedRowId,
      ...(accepted.createdFollow === undefined
        ? {}
        : { profileFollowSnapshot: entitySnapshotFromRow(accepted.createdFollow) }),
    },
    nextState: accepted.result.kind === 'NOOP' ? ('PENDING' as const) : ('ESTABLISHED' as const),
    effectPlan,
    ...(accepted.result.kind === 'NOOP' && pendingSnapshot !== undefined
      ? { pendingSnapshot }
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
    .select()
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
    .select()
    .from(ProfileFollowRequests)
    .where(pairCondition(ProfileFollowRequests, input.pair))
    .limit(1)
    .then(first);
  if (!currentRequest && conflictingRequest) {
    return {
      ok: true as const,
      result: {
        commandKind: command.kind,
        changed: false,
        followerProfileId: input.pair.followerProfileId,
        followeeProfileId: input.pair.followeeProfileId,
        profileFollowRequestId: expectedRowId,
      },
      nextState: 'PENDING' as const,
      effectPlan: [] as ProfileFollowPairEffectPlan,
      pendingSnapshot: pendingSnapshotFromRow(conflictingRequest),
    };
  }

  if (command.origin === 'LOCAL' && command.actorProfileId === undefined) {
    throw new ValidationError('Actor profile is required for a local terminal command');
  }
  const deleted = currentRequest
    ? command.kind === 'REJECT'
      ? command.origin === 'LOCAL'
        ? await rejectProfileFollowRequestInTransaction(
            {
              actorProfileId: command.actorProfileId!,
              profileFollowRequestId: expectedRowId,
              origin: 'LOCAL',
            },
            tx,
          )
        : await removeInboundFollowInTransaction(
            {
              ...input.pair,
              expectedRowId,
              origin: 'ACTIVITYPUB',
              transition: 'INBOUND_REJECT',
            },
            tx,
          ).then(
            (value) =>
              ({ request: value.profileFollowRequest }) as {
                request: ProfileFollowRequestRow | undefined;
              },
          )
      : command.origin === 'LOCAL'
        ? await cancelProfileFollowRequestInTransaction(
            {
              actorProfileId: command.actorProfileId!,
              profileFollowRequestId: expectedRowId,
              origin: 'LOCAL',
            },
            tx,
          )
        : await removeInboundFollowInTransaction(
            {
              ...input.pair,
              expectedRowId,
              origin: 'ACTIVITYPUB',
              transition: 'INBOUND_UNDO',
            },
            tx,
          ).then(
            (value) =>
              ({ request: value.profileFollowRequest }) as {
                request: ProfileFollowRequestRow | undefined;
              },
          )
    : undefined;
  const source =
    deleted?.request ??
    // A remote removal is guarded by participant availability.  If the row
    // was present but that guarded DELETE did not commit, keep the pair
    // pending; the snapshot is only a retry reconstruction after the row has
    // already been deleted, not permission to report a deletion that never
    // happened.
    (currentRequest === undefined && input.pendingSnapshot?.id === expectedRowId
      ? entityRowFromSnapshot(input.pendingSnapshot)
      : undefined);
  const pendingSnapshot = pendingSnapshotForInput(input, currentRequest);
  if (!source) {
    return {
      ok: true as const,
      result: {
        commandKind: command.kind,
        changed: false,
        followerProfileId: input.pair.followerProfileId,
        followeeProfileId: input.pair.followeeProfileId,
        profileFollowRequestId: expectedRowId,
      },
      nextState: 'PENDING' as const,
      effectPlan: [] as ProfileFollowPairEffectPlan,
      ...(pendingSnapshot === undefined ? {} : { pendingSnapshot }),
    };
  }
  const effect =
    command.origin === 'ACTIVITYPUB'
      ? deleteEffect(source, {
          sourceKind: 'FOLLOW_REQUEST',
          origin: 'ACTIVITYPUB',
          transition: command.kind === 'REJECT' ? 'INBOUND_REJECT' : 'INBOUND_UNDO',
        })
      : deleteEffect(source, {
          sourceKind: 'FOLLOW_REQUEST',
          origin: 'LOCAL',
          transition: command.kind === 'REJECT' ? 'REJECT' : 'CANCEL',
        });
  return {
    ok: true as const,
    result: {
      commandKind: command.kind,
      changed: true,
      followerProfileId: input.pair.followerProfileId,
      followeeProfileId: input.pair.followeeProfileId,
      profileFollowRequestId: expectedRowId,
    },
    nextState: command.kind === 'REJECT' ? ('REJECTED' as const) : ('CANCELLED' as const),
    effectPlan: effect === undefined ? [] : [effect],
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
          return executeApprove(input, tx);
        case 'ACCEPT':
          return executeAccept(input, tx);
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

/**
 * Rehydrates a minimal Update result after the Temporal boundary.  This is
 * deliberately a separate query helper: full Profile rows and Temporal.Instant
 * values do not belong in Workflow history.
 */
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
      ? ((await db
          .select()
          .from(ProfileFollows)
          .where(eq(ProfileFollows.id, result.profileFollowId))
          .limit(1)
          .then(first)) ??
        (result.profileFollowSnapshot === undefined
          ? undefined
          : entityRowFromSnapshot(result.profileFollowSnapshot)))
      : undefined;
  const profileFollowRequest =
    'profileFollowRequestId' in result && result.profileFollowRequestId !== undefined
      ? ((await db
          .select()
          .from(ProfileFollowRequests)
          .where(eq(ProfileFollowRequests.id, result.profileFollowRequestId))
          .limit(1)
          .then(first)) ??
        (result.profileFollowRequestSnapshot === undefined
          ? undefined
          : entityRowFromSnapshot(result.profileFollowRequestSnapshot)))
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
    return await db.transaction(async (tx) => {
      const currentFollow = await tx
        .select({ id: ProfileFollows.id })
        .from(ProfileFollows)
        .where(pairCondition(ProfileFollows, input))
        .limit(1)
        .then(first);
      const deleted = await removeProfileFollowProjection(
        {
          expectedRowId: input.expectedRowId,
          followerProfileId: input.followerProfileId,
          followeeProfileId: input.followeeProfileId,
          removePendingRequest: false,
        },
        tx,
      );
      // Rebuild the committed row's effect when the pair has no row or has
      // advanced to a newer generation, but never report deletion while the
      // expected row is still present and its guarded DELETE did not commit.
      const source =
        deleted.profileFollow ??
        (currentFollow?.id !== input.expectedRowId && input.snapshot?.id === input.expectedRowId
          ? entityRowFromSnapshot(input.snapshot)
          : undefined);
      const effect = source
        ? input.origin === 'LOCAL'
          ? deleteEffect(source, {
              sourceKind: 'FOLLOW',
              origin: 'LOCAL',
              transition: 'UNFOLLOW',
            })
          : deleteEffect(source, {
              sourceKind: 'FOLLOW',
              origin: 'ACTIVITYPUB',
              transition: input.transition,
            })
        : undefined;
      return {
        ok: true as const,
        changed: effect !== undefined,
        profileFollowId: deleted.profileFollow?.id ?? null,
        followerProfileId: input.followerProfileId,
        followeeProfileId: input.followeeProfileId,
        effectPlan: effect === undefined ? [] : [effect],
      };
    });
  } catch (error) {
    if (error instanceof KosmoError) {
      return { ok: false, error: serializeFailure(error) };
    }
    throw error;
  }
};
