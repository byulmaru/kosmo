import { and, eq, inArray, ne, notExists, or, sql } from 'drizzle-orm';
import {
  ActivityPubActors,
  first,
  firstOrThrow,
  firstOrThrowWith,
  getDatabaseConnection,
  Instances,
  ProfileFollowRequests,
  ProfileFollows,
  Profiles,
} from '../db';
import { InstanceKind, InstanceState, ProfileFollowPolicy, ProfileState } from '../enums';
import { ConflictError, NotFoundError } from '../error';
import { ensureProfileFollow } from './profile-follow-relation';
import type { Transaction } from '../db';

export type ProfileFollowRequestRow = typeof ProfileFollowRequests.$inferSelect;

type ProfileFollowRow = typeof ProfileFollows.$inferSelect;
type ProfileRow = typeof Profiles.$inferSelect;

export type ProfileFollowEffectOrigin = 'LOCAL' | 'ACTIVITYPUB';

export type FollowProfileResult =
  | { readonly kind: 'ESTABLISHED'; readonly profileFollow: ProfileFollowRow }
  | { readonly kind: 'PENDING'; readonly profileFollowRequest: ProfileFollowRequestRow };

type ProfileFollowInput = {
  followerProfileId: string;
  followeeProfileId: string;
  origin: ProfileFollowEffectOrigin;
  candidateProfileFollowId?: string;
  candidateProfileFollowRequestId?: string;
};

export type InboundFollowDeletionTransition = 'INBOUND_UNDO' | 'INBOUND_REJECT';

const loadProfileFollowParticipants = async (
  tx: Transaction,
  {
    followerProfileId,
    followeeProfileId,
  }: Pick<ProfileFollowInput, 'followerProfileId' | 'followeeProfileId'>,
) => {
  const participants = await tx
    .select({
      actorUri: ActivityPubActors.uri,
      followPolicy: Profiles.followPolicy,
      id: Profiles.id,
      instanceKind: Instances.kind,
      instanceState: Instances.state,
    })
    .from(Profiles)
    .innerJoin(Instances, eq(Instances.id, Profiles.instanceId))
    .leftJoin(ActivityPubActors, eq(ActivityPubActors.profileId, Profiles.id))
    .where(
      and(
        inArray(Profiles.id, [followerProfileId, followeeProfileId]),
        eq(Profiles.state, ProfileState.ACTIVE),
        ne(Instances.state, InstanceState.SUSPENDED),
      ),
    );

  const follower = participants.find(({ id }) => id === followerProfileId);
  const target = participants.find(({ id }) => id === followeeProfileId);
  if (!follower || !target) {
    throw new NotFoundError('Profile not found');
  }

  const isRemoteTarget = target.instanceKind === InstanceKind.ACTIVITYPUB;
  const isActivityPubInbound =
    follower.instanceKind === InstanceKind.ACTIVITYPUB &&
    target.instanceKind === InstanceKind.LOCAL;
  const validOriginPair = isActivityPubInbound
    ? follower.instanceState === InstanceState.ACTIVE &&
      target.instanceState === InstanceState.ACTIVE
    : follower.instanceKind === InstanceKind.LOCAL &&
      (target.instanceKind === InstanceKind.LOCAL || (isRemoteTarget && target.actorUri));
  if (!validOriginPair) {
    throw new NotFoundError('Profile not found');
  }

  return { isActivityPubInbound, target };
};

export const followProfileInTransaction = async (
  {
    followerProfileId,
    followeeProfileId,
    candidateProfileFollowId,
    candidateProfileFollowRequestId,
  }: ProfileFollowInput,
  tx: Transaction,
): Promise<{
  readonly pendingRequest: ProfileFollowRequestRow | undefined;
  readonly result: {
    readonly created: boolean;
    readonly followeeProfile: ProfileRow;
    readonly followerProfile: ProfileRow;
    readonly result: FollowProfileResult;
  };
}> => {
  if (followerProfileId === followeeProfileId) {
    throw new ConflictError({ message: 'Profile cannot follow itself' });
  }

  const { target } = await loadProfileFollowParticipants(tx, {
    followerProfileId,
    followeeProfileId,
  });

  const pendingRequest = await tx
    .select()
    .from(ProfileFollowRequests)
    .where(pairCondition(ProfileFollowRequests, followerProfileId, target.id))
    .limit(1)
    .then(first);

  let created: boolean;
  let followResult: FollowProfileResult;
  if (target.followPolicy === ProfileFollowPolicy.APPROVAL_REQUIRED) {
    const ensured = await ensureProfileFollowRequest(
      { followeeProfileId: target.id, followerProfileId },
      tx,
      { id: candidateProfileFollowRequestId },
    );
    created = ensured.created;
    followResult =
      ensured.kind === 'ESTABLISHED'
        ? { kind: 'ESTABLISHED', profileFollow: ensured.profileFollow }
        : { kind: 'PENDING', profileFollowRequest: ensured.profileFollowRequest };
  } else {
    const ensured = await ensureProfileFollow(
      { followeeProfileId: target.id, followerProfileId },
      tx,
      { id: candidateProfileFollowId },
    );
    created = ensured.created;
    followResult = { kind: 'ESTABLISHED', profileFollow: ensured.profileFollow };
  }

  const profiles = await tx
    .select()
    .from(Profiles)
    .where(inArray(Profiles.id, [followerProfileId, target.id]));
  const followerProfile = profiles.find(({ id }) => id === followerProfileId);
  const followeeProfile = profiles.find(({ id }) => id === target.id);
  if (!followerProfile || !followeeProfile) {
    throw new NotFoundError('Profile not found');
  }

  const result = { created, followeeProfile, followerProfile, result: followResult };
  return { pendingRequest, result };
};

export type DeletedProfileFollowProjection = {
  readonly profileFollow: ProfileFollowRow | undefined;
  readonly profileFollowRequest: ProfileFollowRequestRow | undefined;
};

export const unfollowProfileInTransaction = async (
  { followerProfileId, followeeProfileId }: ProfileFollowInput,
  tx: Transaction,
): Promise<{
  readonly deleted: DeletedProfileFollowProjection;
  readonly result: {
    readonly changed: boolean;
    readonly followeeProfile: ProfileRow;
    readonly followerProfile: ProfileRow;
    readonly profileFollowId: string | null;
  };
}> => {
  const { isActivityPubInbound, target } = await loadProfileFollowParticipants(tx, {
    followerProfileId,
    followeeProfileId,
  });

  const deleted = await removeProfileFollowProjection(
    {
      followeeProfileId: target.id,
      followerProfileId,
      removePendingRequest: isActivityPubInbound,
    },
    tx,
  );

  const profiles = await tx
    .select()
    .from(Profiles)
    .where(inArray(Profiles.id, [followerProfileId, target.id]));
  const followerProfile = profiles.find(({ id }) => id === followerProfileId);
  const followeeProfile = profiles.find(({ id }) => id === target.id);
  if (!followerProfile || !followeeProfile) {
    throw new NotFoundError('Profile not found');
  }

  const result = {
    changed: deleted.profileFollow !== undefined || deleted.profileFollowRequest !== undefined,
    followeeProfile,
    followerProfile,
    profileFollowId: deleted.profileFollow?.id ?? null,
  };
  return { deleted, result };
};

const pairCondition = (
  table: typeof ProfileFollows | typeof ProfileFollowRequests,
  followerProfileId: string,
  followeeProfileId: string,
) =>
  and(
    eq(table.followerProfileId, followerProfileId),
    eq(table.followeeProfileId, followeeProfileId),
  );

export const removeProfileFollowProjection = async (
  {
    expectedRowId,
    followeeProfileId,
    followerProfileId,
    removePendingRequest = true,
  }: {
    readonly expectedRowId?: string;
    readonly followeeProfileId: string;
    readonly followerProfileId: string;
    readonly removePendingRequest?: boolean;
  },
  tx: Transaction,
): Promise<{
  readonly profileFollow: ProfileFollowRow | undefined;
  readonly profileFollowRequest: ProfileFollowRequestRow | undefined;
}> => {
  const unavailableParticipants = tx
    .select({ id: Profiles.id })
    .from(Profiles)
    .innerJoin(Instances, eq(Instances.id, Profiles.instanceId))
    .where(
      and(
        inArray(Profiles.id, [followerProfileId, followeeProfileId]),
        or(ne(Profiles.state, ProfileState.ACTIVE), eq(Instances.state, InstanceState.SUSPENDED)),
      ),
    );
  const profileFollow = await tx
    .select()
    .from(ProfileFollows)
    .where(pairCondition(ProfileFollows, followerProfileId, followeeProfileId))
    .limit(1)
    .then(first);

  if (profileFollow) {
    if (expectedRowId !== undefined && profileFollow.id !== expectedRowId) {
      return { profileFollow: undefined, profileFollowRequest: undefined };
    }

    const deleted = await tx
      .delete(ProfileFollows)
      .where(and(eq(ProfileFollows.id, profileFollow.id), notExists(unavailableParticipants)))
      .returning()
      .then(first);
    if (!deleted) {
      return { profileFollow: undefined, profileFollowRequest: undefined };
    }

    await tx
      .update(Profiles)
      .set({ followingCount: sql`greatest(${Profiles.followingCount} - 1, 0)` })
      .where(eq(Profiles.id, followerProfileId));
    await tx
      .update(Profiles)
      .set({ followersCount: sql`greatest(${Profiles.followersCount} - 1, 0)` })
      .where(eq(Profiles.id, followeeProfileId));

    return { profileFollow: deleted, profileFollowRequest: undefined };
  }

  if (!removePendingRequest) {
    return { profileFollow: undefined, profileFollowRequest: undefined };
  }

  const profileFollowRequest = await tx
    .select()
    .from(ProfileFollowRequests)
    .where(pairCondition(ProfileFollowRequests, followerProfileId, followeeProfileId))
    .limit(1)
    .then(first);
  if (
    !profileFollowRequest ||
    (expectedRowId !== undefined && profileFollowRequest.id !== expectedRowId)
  ) {
    return { profileFollow: undefined, profileFollowRequest: undefined };
  }

  const deleted = await tx
    .delete(ProfileFollowRequests)
    .where(
      and(
        eq(ProfileFollowRequests.id, profileFollowRequest.id),
        notExists(unavailableParticipants),
      ),
    )
    .returning()
    .then(first);

  return { profileFollow: undefined, profileFollowRequest: deleted };
};

export type RemoveInboundFollowInput = {
  readonly expectedRowId?: string;
  readonly followeeProfileId: string;
  readonly followerProfileId: string;
  readonly origin: 'ACTIVITYPUB';
  readonly transition: InboundFollowDeletionTransition;
};

export type AcceptProfileFollowRequestResult =
  | { readonly kind: 'ACCEPTED' }
  | { readonly kind: 'ALREADY_ESTABLISHED' }
  | { readonly kind: 'NOOP' };

type ProfileFollowPair = {
  readonly followeeProfileId: string;
  readonly followerProfileId: string;
};

const requestPairCondition = (
  table: typeof ProfileFollows | typeof ProfileFollowRequests,
  { followeeProfileId, followerProfileId }: ProfileFollowPair,
) =>
  and(
    eq(table.followerProfileId, followerProfileId),
    eq(table.followeeProfileId, followeeProfileId),
  );

export const ensureProfileFollowRequest = async (
  pair: ProfileFollowPair,
  tx?: Transaction,
  options?: { readonly id?: string },
): Promise<
  | {
      readonly created: false;
      readonly kind: 'ESTABLISHED';
      readonly profileFollow: ProfileFollowRow;
    }
  | {
      readonly created: boolean;
      readonly kind: 'PENDING';
      readonly profileFollowRequest: ProfileFollowRequestRow;
    }
> =>
  getDatabaseConnection(tx).transaction(async (tx) => {
    const profileFollow = await tx
      .select()
      .from(ProfileFollows)
      .where(requestPairCondition(ProfileFollows, pair))
      .limit(1)
      .then(first);

    if (profileFollow) {
      await tx
        .delete(ProfileFollowRequests)
        .where(requestPairCondition(ProfileFollowRequests, pair));
      return { created: false, kind: 'ESTABLISHED', profileFollow };
    }

    const inserted = await tx
      .insert(ProfileFollowRequests)
      .values(options?.id === undefined ? pair : { ...pair, id: options.id })
      .onConflictDoNothing({
        target: [ProfileFollowRequests.followerProfileId, ProfileFollowRequests.followeeProfileId],
      })
      .returning()
      .then(first);
    const profileFollowRequest =
      inserted ??
      (await tx
        .select()
        .from(ProfileFollowRequests)
        .where(requestPairCondition(ProfileFollowRequests, pair))
        .limit(1)
        .then(firstOrThrow));
    if (!profileFollowRequest) {
      throw new Error('Profile follow request not found after insert conflict');
    }

    return {
      created: inserted !== undefined,
      kind: 'PENDING',
      profileFollowRequest,
    };
  });

export type AcceptProfileFollowRequestInput = ProfileFollowPair & {
  readonly expectedRowId: string;
  readonly origin: ProfileFollowEffectOrigin;
  readonly candidateProfileFollowId?: string;
};

export type AcceptProfileFollowRequestTransactionResult = {
  readonly result: AcceptProfileFollowRequestResult;
  readonly deletedRequest: ProfileFollowRequestRow | undefined;
  readonly createdFollow: ProfileFollowRow | undefined;
};

export const acceptProfileFollowRequestInTransaction = async (
  {
    expectedRowId,
    followeeProfileId,
    followerProfileId,
    candidateProfileFollowId,
  }: AcceptProfileFollowRequestInput,
  tx: Transaction,
): Promise<AcceptProfileFollowRequestTransactionResult> => {
  const pair = { followeeProfileId, followerProfileId };
  const established = await tx
    .select({ id: ProfileFollows.id })
    .from(ProfileFollows)
    .where(requestPairCondition(ProfileFollows, pair))
    .limit(1)
    .then(first);

  if (established) {
    return {
      result: established.id === expectedRowId ? { kind: 'ALREADY_ESTABLISHED' } : { kind: 'NOOP' },
      deletedRequest: undefined,
      createdFollow: undefined,
    };
  }

  const pendingRequest = await tx
    .select()
    .from(ProfileFollowRequests)
    .where(
      and(
        eq(ProfileFollowRequests.id, expectedRowId),
        requestPairCondition(ProfileFollowRequests, pair),
      ),
    )
    .limit(1)
    .then(first);

  const unavailableParticipants = tx
    .select({ id: Profiles.id })
    .from(Profiles)
    .innerJoin(Instances, eq(Instances.id, Profiles.instanceId))
    .where(
      and(
        inArray(Profiles.id, [followerProfileId, followeeProfileId]),
        or(ne(Profiles.state, ProfileState.ACTIVE), eq(Instances.state, InstanceState.SUSPENDED)),
      ),
    );
  const deleted = await tx
    .delete(ProfileFollowRequests)
    .where(
      and(
        eq(ProfileFollowRequests.id, expectedRowId),
        requestPairCondition(ProfileFollowRequests, pair),
        notExists(unavailableParticipants),
      ),
    )
    .returning()
    .then(first);

  if (!deleted) {
    const establishedAfterDelete = await tx
      .select({ id: ProfileFollows.id })
      .from(ProfileFollows)
      .where(requestPairCondition(ProfileFollows, pair))
      .limit(1)
      .then(first);

    return {
      result:
        pendingRequest && establishedAfterDelete
          ? { kind: 'ALREADY_ESTABLISHED' }
          : { kind: 'NOOP' },
      deletedRequest: undefined,
      createdFollow: undefined,
    };
  }

  const ensured = await ensureProfileFollow(pair, tx, {
    id: candidateProfileFollowId,
  });
  return {
    createdFollow: ensured.created ? ensured.profileFollow : undefined,
    deletedRequest: deleted,
    result: ensured.created ? { kind: 'ACCEPTED' } : { kind: 'ALREADY_ESTABLISHED' },
  };
};

export type ApproveProfileFollowRequestResult = {
  readonly followeeProfile: typeof Profiles.$inferSelect;
  readonly followerProfile: typeof Profiles.$inferSelect;
  readonly profileFollow: ProfileFollowRow;
  readonly profileFollowRequestId: string;
};

export type ApproveProfileFollowRequestTransactionResult = ApproveProfileFollowRequestResult & {
  readonly profileFollowRequest: ProfileFollowRequestRow;
};

export const approveProfileFollowRequestInTransaction = async (
  {
    actorProfileId,
    profileFollowRequestId,
    candidateProfileFollowId,
  }: {
    readonly actorProfileId: string;
    readonly profileFollowRequestId: string;
    readonly candidateProfileFollowId?: string;
  },
  tx: Transaction,
): Promise<ApproveProfileFollowRequestTransactionResult & { readonly created: boolean }> => {
  const request = await tx
    .select()
    .from(ProfileFollowRequests)
    .where(
      and(
        eq(ProfileFollowRequests.id, profileFollowRequestId),
        eq(ProfileFollowRequests.followeeProfileId, actorProfileId),
      ),
    )
    .limit(1)
    .then(firstOrThrowWith(() => new NotFoundError('Profile follow request not found')));

  const participants = await tx
    .select({
      instanceState: Instances.state,
      profile: Profiles,
    })
    .from(Profiles)
    .innerJoin(Instances, eq(Instances.id, Profiles.instanceId))
    .where(
      and(
        inArray(Profiles.id, [request.followerProfileId, request.followeeProfileId]),
        eq(Profiles.state, ProfileState.ACTIVE),
        ne(Instances.state, InstanceState.SUSPENDED),
      ),
    )
    .orderBy(Profiles.id);
  const followerProfile = participants.find(
    ({ profile }) => profile.id === request.followerProfileId,
  )?.profile;
  const followeeProfile = participants.find(
    ({ profile }) => profile.id === request.followeeProfileId,
  )?.profile;
  if (!followerProfile || !followeeProfile) {
    throw new NotFoundError('Profile not found');
  }

  const { created, profileFollow } = await ensureProfileFollow(
    {
      followeeProfileId: request.followeeProfileId,
      followerProfileId: request.followerProfileId,
    },
    tx,
    { id: candidateProfileFollowId },
  );

  const updatedProfiles = await tx
    .select()
    .from(Profiles)
    .where(inArray(Profiles.id, [request.followerProfileId, request.followeeProfileId]));

  return {
    created,
    followeeProfile: updatedProfiles.find(({ id }) => id === request.followeeProfileId)!,
    followerProfile: updatedProfiles.find(({ id }) => id === request.followerProfileId)!,
    profileFollow,
    profileFollowRequest: request,
    profileFollowRequestId: request.id,
  };
};

export const deleteProfileFollowRequestAsActorInTransaction = async (
  {
    actorProfileId,
    actorRole,
    profileFollowRequestId,
  }: {
    readonly actorProfileId: string;
    readonly actorRole: 'FOLLOWEE' | 'FOLLOWER';
    readonly profileFollowRequestId: string;
  },
  tx: Transaction,
) => {
  const request = await tx
    .select()
    .from(ProfileFollowRequests)
    .where(
      and(
        eq(ProfileFollowRequests.id, profileFollowRequestId),
        actorRole === 'FOLLOWEE'
          ? eq(ProfileFollowRequests.followeeProfileId, actorProfileId)
          : eq(ProfileFollowRequests.followerProfileId, actorProfileId),
      ),
    )
    .limit(1)
    .then(firstOrThrowWith(() => new NotFoundError('Profile follow request not found')));

  const actorProfile = await tx
    .select({ profile: Profiles })
    .from(Profiles)
    .innerJoin(Instances, eq(Instances.id, Profiles.instanceId))
    .where(
      and(
        eq(Profiles.id, actorProfileId),
        eq(Profiles.state, ProfileState.ACTIVE),
        ne(Instances.state, InstanceState.SUSPENDED),
      ),
    )
    .limit(1)
    .then(firstOrThrowWith(() => new NotFoundError('Profile not found')));

  await tx
    .delete(ProfileFollowRequests)
    .where(
      and(
        eq(ProfileFollowRequests.id, request.id),
        actorRole === 'FOLLOWEE'
          ? eq(ProfileFollowRequests.followeeProfileId, actorProfileId)
          : eq(ProfileFollowRequests.followerProfileId, actorProfileId),
      ),
    )
    .returning({ id: ProfileFollowRequests.id })
    .then(firstOrThrowWith(() => new NotFoundError('Profile follow request not found')));

  return { actorProfile: actorProfile.profile, request };
};

export type DeleteProfileFollowRequestResult = {
  readonly actorProfile: typeof Profiles.$inferSelect;
  readonly request: ProfileFollowRequestRow;
};

export const rejectProfileFollowRequestInTransaction = async (
  input: {
    readonly actorProfileId: string;
    readonly profileFollowRequestId: string;
    readonly origin: ProfileFollowEffectOrigin;
  },
  tx: Transaction,
): Promise<DeleteProfileFollowRequestResult> =>
  deleteProfileFollowRequestAsActorInTransaction({ ...input, actorRole: 'FOLLOWEE' }, tx);

export const cancelProfileFollowRequestInTransaction = async (
  input: {
    readonly actorProfileId: string;
    readonly profileFollowRequestId: string;
    readonly origin: ProfileFollowEffectOrigin;
  },
  tx: Transaction,
): Promise<DeleteProfileFollowRequestResult> =>
  deleteProfileFollowRequestAsActorInTransaction({ ...input, actorRole: 'FOLLOWER' }, tx);

export const removeInboundFollowInTransaction = (
  input: RemoveInboundFollowInput,
  tx: Transaction,
) => removeProfileFollowProjection(input, tx);
