import { and, eq, inArray, ne, notExists, or, sql } from 'drizzle-orm';
import {
  ActivityPubActors,
  db,
  first,
  firstOrThrowWith,
  getDatabaseConnection,
  Instances,
  ProfileFollowRequests,
  ProfileFollows,
  Profiles,
} from '../db';
import { InstanceKind, InstanceState, ProfileFollowPolicy, ProfileState } from '../enums';
import { ConflictError, NotFoundError, PermissionDeniedError } from '../error';
import { ensureProfileFollow } from './profile-follow-relation';
import type { Transaction } from '../db';
import type { ProfileFollowPair } from './profile-follow-relation';

export type ProfileFollowRequestRow = typeof ProfileFollowRequests.$inferSelect;

type ProfileFollowRow = typeof ProfileFollows.$inferSelect;

export type ProfileFollowRemovalSource = {
  readonly sourceId: string;
  readonly sourceKind: 'FOLLOW' | 'FOLLOW_REQUEST';
  readonly followerProfileId: string;
  readonly followeeProfileId: string;
};

export type FollowProfileResult =
  | { readonly kind: 'ESTABLISHED'; readonly profileFollow: ProfileFollowRow }
  | { readonly kind: 'PENDING'; readonly profileFollowRequest: ProfileFollowRequestRow };

type ProfileFollowInput = {
  followerProfileId: string;
  followeeProfileId: string;
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
  { followerProfileId, followeeProfileId }: ProfileFollowInput,
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
    );
    created = ensured.created;
    followResult = { kind: 'ESTABLISHED', profileFollow: ensured.profileFollow };
  }

  return { created, result: followResult, sendActivityPub };
};

export const profileFollowPairCondition = (
  table: typeof ProfileFollows | typeof ProfileFollowRequests,
  { followeeProfileId, followerProfileId }: ProfileFollowPair,
) =>
  and(
    eq(table.followerProfileId, followerProfileId),
    eq(table.followeeProfileId, followeeProfileId),
  );

/**
 * Captures exact Follow generations between two Profiles before a durable
 * cleanup transition. This is intentionally generic so Block and future
 * cleanup capabilities share the same source identity boundary.
 */
export const loadProfileFollowRemovalSourcesBetweenProfiles = async ({
  firstProfileId,
  secondProfileId,
}: {
  readonly firstProfileId: string;
  readonly secondProfileId: string;
}): Promise<readonly ProfileFollowRemovalSource[]> => {
  const [follows, requests] = await Promise.all([
    db
      .select({
        followeeProfileId: ProfileFollows.followeeProfileId,
        followerProfileId: ProfileFollows.followerProfileId,
        sourceId: ProfileFollows.id,
      })
      .from(ProfileFollows)
      .where(
        or(
          and(
            eq(ProfileFollows.followerProfileId, firstProfileId),
            eq(ProfileFollows.followeeProfileId, secondProfileId),
          ),
          and(
            eq(ProfileFollows.followerProfileId, secondProfileId),
            eq(ProfileFollows.followeeProfileId, firstProfileId),
          ),
        ),
      ),
    db
      .select({
        followeeProfileId: ProfileFollowRequests.followeeProfileId,
        followerProfileId: ProfileFollowRequests.followerProfileId,
        sourceId: ProfileFollowRequests.id,
      })
      .from(ProfileFollowRequests)
      .where(
        or(
          and(
            eq(ProfileFollowRequests.followerProfileId, firstProfileId),
            eq(ProfileFollowRequests.followeeProfileId, secondProfileId),
          ),
          and(
            eq(ProfileFollowRequests.followerProfileId, secondProfileId),
            eq(ProfileFollowRequests.followeeProfileId, firstProfileId),
          ),
        ),
      ),
  ]);

  return [
    ...follows.map((source) => ({ ...source, sourceKind: 'FOLLOW' as const })),
    ...requests.map((source) => ({ ...source, sourceKind: 'FOLLOW_REQUEST' as const })),
  ].sort((left, right) => {
    const leftDirection = left.followerProfileId === firstProfileId ? 0 : 1;
    const rightDirection = right.followerProfileId === firstProfileId ? 0 : 1;
    if (leftDirection !== rightDirection) {
      return leftDirection - rightDirection;
    }
    if (left.sourceKind !== right.sourceKind) {
      return left.sourceKind === 'FOLLOW' ? -1 : 1;
    }
    return left.sourceId.localeCompare(right.sourceId);
  });
};

const removeProfileFollowExactSource = async (
  source: ProfileFollowRemovalSource,
  tx: Transaction,
  extraCondition?: ReturnType<typeof and>,
): Promise<{
  readonly profileFollow: ProfileFollowRow | undefined;
  readonly profileFollowRequest: ProfileFollowRequestRow | undefined;
}> => {
  if (source.sourceKind === 'FOLLOW') {
    const profileFollow = await tx
      .delete(ProfileFollows)
      .where(
        and(
          eq(ProfileFollows.id, source.sourceId),
          profileFollowPairCondition(ProfileFollows, source),
          extraCondition,
        ),
      )
      .returning()
      .then(first);
    if (!profileFollow) {
      return { profileFollow: undefined, profileFollowRequest: undefined };
    }

    await tx
      .update(Profiles)
      .set({ followingCount: sql`greatest(${Profiles.followingCount} - 1, 0)` })
      .where(eq(Profiles.id, source.followerProfileId));
    await tx
      .update(Profiles)
      .set({ followersCount: sql`greatest(${Profiles.followersCount} - 1, 0)` })
      .where(eq(Profiles.id, source.followeeProfileId));

    return { profileFollow, profileFollowRequest: undefined };
  }

  const profileFollowRequest = await tx
    .delete(ProfileFollowRequests)
    .where(
      and(
        eq(ProfileFollowRequests.id, source.sourceId),
        profileFollowPairCondition(ProfileFollowRequests, source),
        extraCondition,
      ),
    )
    .returning()
    .then(first);
  return { profileFollow: undefined, profileFollowRequest };
};

/**
 * Removes one exact Follow generation without participant admission checks.
 * Callers that expose Unfollow keep their own participant guard; durable
 * cleanup callers provide the source identity captured before the transition.
 */
export const removeProfileFollowExactSourceInTransaction = (
  source: ProfileFollowRemovalSource,
  tx: Transaction,
) => removeProfileFollowExactSource(source, tx);

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
    .where(profileFollowPairCondition(ProfileFollows, { followerProfileId, followeeProfileId }))
    .limit(1)
    .then(first);

  if (profileFollow) {
    if (expectedRowId !== undefined && profileFollow.id !== expectedRowId) {
      return { profileFollow: undefined, profileFollowRequest: undefined };
    }

    return removeProfileFollowExactSource(
      {
        sourceId: profileFollow.id,
        sourceKind: 'FOLLOW',
        followerProfileId,
        followeeProfileId,
      },
      tx,
      notExists(unavailableParticipants),
    );
  }

  if (!removePendingRequest) {
    return { profileFollow: undefined, profileFollowRequest: undefined };
  }

  const profileFollowRequest = await tx
    .select()
    .from(ProfileFollowRequests)
    .where(
      profileFollowPairCondition(ProfileFollowRequests, { followerProfileId, followeeProfileId }),
    )
    .limit(1)
    .then(first);
  if (
    !profileFollowRequest ||
    (expectedRowId !== undefined && profileFollowRequest.id !== expectedRowId)
  ) {
    return { profileFollow: undefined, profileFollowRequest: undefined };
  }

  return removeProfileFollowExactSource(
    {
      sourceId: profileFollowRequest.id,
      sourceKind: 'FOLLOW_REQUEST',
      followerProfileId,
      followeeProfileId,
    },
    tx,
    notExists(unavailableParticipants),
  );
};

export type AcceptProfileFollowRequestResult =
  | { readonly kind: 'ACCEPTED' }
  | { readonly kind: 'ALREADY_ESTABLISHED' }
  | { readonly kind: 'NOOP' };

export const ensureProfileFollowRequest = async (
  pair: ProfileFollowPair,
  tx?: Transaction,
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
      .where(profileFollowPairCondition(ProfileFollows, pair))
      .limit(1)
      .then(first);

    if (profileFollow) {
      await tx
        .delete(ProfileFollowRequests)
        .where(profileFollowPairCondition(ProfileFollowRequests, pair));
      return { created: false, kind: 'ESTABLISHED', profileFollow };
    }

    const inserted = await tx
      .insert(ProfileFollowRequests)
      .values(pair)
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
          .where(profileFollowPairCondition(ProfileFollowRequests, pair))
          .limit(1)
          .then(firstOrThrowWith(() => new Error('Profile follow request not found')))),
    };
  });

export type AcceptProfileFollowRequestInput = ProfileFollowPair & {
  readonly expectedRowId: string;
};

export type AcceptProfileFollowRequestTransactionResult = {
  readonly result: AcceptProfileFollowRequestResult;
  readonly deletedRequestId: string | undefined;
  readonly createdFollowId: string | undefined;
};

export const acceptProfileFollowRequestInTransaction = async (
  { expectedRowId, followeeProfileId, followerProfileId }: AcceptProfileFollowRequestInput,
  tx: Transaction,
): Promise<AcceptProfileFollowRequestTransactionResult> => {
  const pair = { followeeProfileId, followerProfileId };
  const established = await tx
    .select({ id: ProfileFollows.id })
    .from(ProfileFollows)
    .where(profileFollowPairCondition(ProfileFollows, pair))
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
        profileFollowPairCondition(ProfileFollowRequests, pair),
      ),
    )
    .limit(1)
    .then(first);

  const deleted = await tx
    .delete(ProfileFollowRequests)
    .where(
      and(
        eq(ProfileFollowRequests.id, expectedRowId),
        profileFollowPairCondition(ProfileFollowRequests, pair),
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
          .where(profileFollowPairCondition(ProfileFollows, pair))
          .limit(1)
          .then(first))
          ? { kind: 'ALREADY_ESTABLISHED' }
          : { kind: 'NOOP' },
      deletedRequestId: undefined,
      createdFollowId: undefined,
    };
  }

  const ensured = await ensureProfileFollow(pair, tx);
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
  readonly followeeProfile: typeof Profiles.$inferSelect;
  readonly followerProfile: typeof Profiles.$inferSelect;
};

export const approveProfileFollowRequestInTransaction = async (
  {
    actorProfileId,
    profileFollowRequestId,
    unauthorizedError,
  }: {
    readonly actorProfileId: string;
    readonly profileFollowRequestId: string;
    readonly unauthorizedError?: 'NOT_FOUND' | 'PERMISSION_DENIED';
  },
  tx: Transaction,
): Promise<ApproveProfileFollowRequestTransactionResult> => {
  const request = await tx
    .select()
    .from(ProfileFollowRequests)
    .where(eq(ProfileFollowRequests.id, profileFollowRequestId))
    .limit(1)
    .then(firstOrThrowWith(() => new NotFoundError('Profile follow request not found')));
  if (request.followeeProfileId !== actorProfileId) {
    throw unauthorizedError === 'PERMISSION_DENIED'
      ? new PermissionDeniedError()
      : new NotFoundError('Profile follow request not found');
  }
  if (request.followerProfileId === request.followeeProfileId) {
    throw new NotFoundError('Profile not found');
  }

  const participants = await tx
    .select({ id: Profiles.id })
    .from(Profiles)
    .innerJoin(Instances, eq(Instances.id, Profiles.instanceId))
    .where(
      and(
        inArray(Profiles.id, [request.followerProfileId, request.followeeProfileId]),
        eq(Profiles.state, ProfileState.ACTIVE),
        ne(Instances.state, InstanceState.SUSPENDED),
      ),
    );
  if (participants.length !== 2) {
    throw new NotFoundError('Profile not found');
  }

  const { created, profileFollow } = await ensureProfileFollow(
    {
      followeeProfileId: request.followeeProfileId,
      followerProfileId: request.followerProfileId,
    },
    tx,
  );
  const updatedProfiles = await tx
    .select()
    .from(Profiles)
    .where(inArray(Profiles.id, [request.followerProfileId, request.followeeProfileId]));
  const updatedFollowerProfile = updatedProfiles.find(({ id }) => id === request.followerProfileId);
  const updatedFolloweeProfile = updatedProfiles.find(({ id }) => id === request.followeeProfileId);
  if (!updatedFollowerProfile || !updatedFolloweeProfile) {
    throw new NotFoundError('Profile not found');
  }

  return {
    created,
    profileFollow,
    profileFollowRequestId: request.id,
    followerProfile: updatedFollowerProfile,
    followeeProfile: updatedFolloweeProfile,
  };
};

export const deleteProfileFollowRequestAsActorInTransaction = async (
  {
    actorProfileId,
    actorRole,
    profileFollowRequestId,
    unauthorizedError,
  }: {
    readonly actorProfileId: string;
    readonly actorRole: 'FOLLOWEE' | 'FOLLOWER';
    readonly profileFollowRequestId: string;
    readonly unauthorizedError?: 'NOT_FOUND' | 'PERMISSION_DENIED';
  },
  tx: Transaction,
) => {
  const request = await tx
    .select()
    .from(ProfileFollowRequests)
    .where(eq(ProfileFollowRequests.id, profileFollowRequestId))
    .limit(1)
    .then(firstOrThrowWith(() => new NotFoundError('Profile follow request not found')));
  const expectedActorProfileId =
    actorRole === 'FOLLOWEE' ? request.followeeProfileId : request.followerProfileId;
  if (expectedActorProfileId !== actorProfileId) {
    throw unauthorizedError === 'PERMISSION_DENIED'
      ? new PermissionDeniedError()
      : new NotFoundError('Profile follow request not found');
  }

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
