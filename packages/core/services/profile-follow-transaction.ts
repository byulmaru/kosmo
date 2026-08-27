import { and, eq, inArray, ne, notExists, or, sql } from 'drizzle-orm';
import {
  ActivityPubActors,
  first,
  firstOrThrowWith,
  Instances,
  ProfileFollowRequests,
  ProfileFollows,
  Profiles,
} from '../db';
import { InstanceKind, InstanceState, ProfileFollowPolicy, ProfileState } from '../enums';
import { ConflictError, NotFoundError } from '../error';
import { ensureProfileFollow } from './profile-follow-relation';
import type { Transaction } from '../db';
import type { ProfileFollowPair } from './profile-follow-relation';

export type ProfileFollowRequestRow = typeof ProfileFollowRequests.$inferSelect;

type ProfileFollowRow = typeof ProfileFollows.$inferSelect;

export type FollowProfileResult =
  | { readonly kind: 'ESTABLISHED'; readonly profileFollow: ProfileFollowRow }
  | { readonly kind: 'PENDING'; readonly profileFollowRequest: ProfileFollowRequestRow };

type ProfileFollowInput = {
  followerProfileId: string;
  followeeProfileId: string;
  candidateProfileFollowId?: string;
  candidateProfileFollowRequestId?: string;
};

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

  if (
    !(follower.instanceKind === InstanceKind.ACTIVITYPUB &&
    target.instanceKind === InstanceKind.LOCAL
      ? follower.instanceState === InstanceState.ACTIVE &&
        target.instanceState === InstanceState.ACTIVE
      : follower.instanceKind === InstanceKind.LOCAL &&
        (target.instanceKind === InstanceKind.LOCAL ||
          (target.instanceKind === InstanceKind.ACTIVITYPUB && target.actorUri)))
  ) {
    throw new NotFoundError('Profile not found');
  }

  return {
    sendActivityPub:
      follower.instanceKind === InstanceKind.LOCAL &&
      target.instanceKind === InstanceKind.ACTIVITYPUB &&
      target.instanceState === InstanceState.ACTIVE,
    target,
  };
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
  readonly sendActivityPub: boolean;
  readonly created: boolean;
  readonly result: FollowProfileResult;
}> => {
  if (followerProfileId === followeeProfileId) {
    throw new ConflictError({ message: 'Profile cannot follow itself' });
  }

  const { sendActivityPub, target } = await loadProfileFollowParticipants(tx, {
    followerProfileId,
    followeeProfileId,
  });

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

  return { created, result: followResult, sendActivityPub };
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

export type AcceptProfileFollowRequestResult =
  | { readonly kind: 'ACCEPTED' }
  | { readonly kind: 'ALREADY_ESTABLISHED' }
  | { readonly kind: 'NOOP' };

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
  tx: Transaction,
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
> => {
  const profileFollow = await tx
    .select()
    .from(ProfileFollows)
    .where(requestPairCondition(ProfileFollows, pair))
    .limit(1)
    .then(first);

  if (profileFollow) {
    await tx.delete(ProfileFollowRequests).where(requestPairCondition(ProfileFollowRequests, pair));
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
  return {
    created: inserted !== undefined,
    kind: 'PENDING',
    profileFollowRequest:
      inserted ??
      (await tx
        .select()
        .from(ProfileFollowRequests)
        .where(requestPairCondition(ProfileFollowRequests, pair))
        .limit(1)
        .then(firstOrThrowWith(() => new Error('Profile follow request not found')))),
  };
};

export type AcceptProfileFollowRequestInput = ProfileFollowPair & {
  readonly expectedRowId: string;
  readonly candidateProfileFollowId?: string;
};

export type AcceptProfileFollowRequestTransactionResult = {
  readonly result: AcceptProfileFollowRequestResult;
  readonly deletedRequestId: string | undefined;
  readonly createdFollowId: string | undefined;
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
      deletedRequestId: undefined,
      createdFollowId: undefined,
    };
  }

  const pendingRequest = await tx
    .select({ id: ProfileFollowRequests.id })
    .from(ProfileFollowRequests)
    .where(
      and(
        eq(ProfileFollowRequests.id, expectedRowId),
        requestPairCondition(ProfileFollowRequests, pair),
      ),
    )
    .limit(1)
    .then(first);

  const deleted = await tx
    .delete(ProfileFollowRequests)
    .where(
      and(
        eq(ProfileFollowRequests.id, expectedRowId),
        requestPairCondition(ProfileFollowRequests, pair),
        notExists(
          tx
            .select({ id: Profiles.id })
            .from(Profiles)
            .innerJoin(Instances, eq(Instances.id, Profiles.instanceId))
            .where(
              and(
                inArray(Profiles.id, [followerProfileId, followeeProfileId]),
                or(
                  ne(Profiles.state, ProfileState.ACTIVE),
                  eq(Instances.state, InstanceState.SUSPENDED),
                ),
              ),
            ),
        ),
      ),
    )
    .returning({ id: ProfileFollowRequests.id })
    .then(first);

  if (!deleted) {
    return {
      result:
        pendingRequest &&
        (await tx
          .select({ id: ProfileFollows.id })
          .from(ProfileFollows)
          .where(requestPairCondition(ProfileFollows, pair))
          .limit(1)
          .then(first))
          ? { kind: 'ALREADY_ESTABLISHED' }
          : { kind: 'NOOP' },
      deletedRequestId: undefined,
      createdFollowId: undefined,
    };
  }

  const ensured = await ensureProfileFollow(pair, tx, {
    id: candidateProfileFollowId,
  });
  return {
    createdFollowId: ensured.created ? ensured.profileFollow.id : undefined,
    deletedRequestId: deleted.id,
    result: ensured.created ? { kind: 'ACCEPTED' } : { kind: 'ALREADY_ESTABLISHED' },
  };
};

export type ApproveProfileFollowRequestTransactionResult = {
  readonly created: boolean;
  readonly profileFollow: ProfileFollowRow;
  readonly profileFollowRequestId: string;
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
): Promise<ApproveProfileFollowRequestTransactionResult> => {
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

  if (
    (
      await tx
        .select({ id: Profiles.id })
        .from(Profiles)
        .innerJoin(Instances, eq(Instances.id, Profiles.instanceId))
        .where(
          and(
            inArray(Profiles.id, [request.followerProfileId, request.followeeProfileId]),
            eq(Profiles.state, ProfileState.ACTIVE),
            ne(Instances.state, InstanceState.SUSPENDED),
          ),
        )
    ).length !== 2
  ) {
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

  return {
    created,
    profileFollow,
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

  await tx
    .select({ id: Profiles.id })
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

  return request;
};
