import { and, eq, sql } from 'drizzle-orm';
import {
  db,
  first,
  firstOrThrowWith,
  ProfileFollowRequests,
  ProfileFollows,
  Profiles,
} from '../db';
import { ProfileFollowPolicy, ProfileState } from '../enums';
import { ConflictError, NotFoundError } from '../error';

type ProfileFollowRow = typeof ProfileFollows.$inferSelect;
type ProfileFollowRequestRow = typeof ProfileFollowRequests.$inferSelect;
type Transaction = Parameters<Parameters<typeof db.transaction>[0]>[0];

type ProfileFollowInput = {
  followerProfileId: string;
  followeeProfileId: string;
};

export type FollowRequestSource =
  | { kind: 'local' }
  | { kind: 'activitypub'; activityId: URL; actorId: URL; objectId: URL };

export type FollowRequestDisposition = 'accepted' | 'rejected';

export type FollowRequestNotificationPort = {
  created(event: { request: ProfileFollowRequestRow }): Promise<void>;
  removed(event: {
    request: ProfileFollowRequestRow;
    reason: FollowRequestDisposition | 'cancelled';
  }): Promise<void>;
};

export type ActivityPubFollowPort = {
  requestCreated(event: {
    request: ProfileFollowRequestRow;
    source: Extract<FollowRequestSource, { kind: 'activitypub' }>;
  }): Promise<void>;
  respond(event: {
    request: ProfileFollowRequestRow;
    disposition: FollowRequestDisposition;
  }): Promise<void>;
};

export type FollowRequestActionPorts = {
  notifications?: FollowRequestNotificationPort;
  activityPub?: ActivityPubFollowPort;
};

export type CreateProfileFollowResult =
  | {
      kind: 'follow';
      created: boolean;
      profileFollow: ProfileFollowRow;
      profileFollowRequest: null;
    }
  | {
      kind: 'request';
      created: boolean;
      profileFollow: null;
      profileFollowRequest: ProfileFollowRequestRow;
    };

const noopNotifications: FollowRequestNotificationPort = {
  created: async () => undefined,
  removed: async () => undefined,
};

const noopActivityPub: ActivityPubFollowPort = {
  requestCreated: async () => undefined,
  respond: async () => undefined,
};

const incrementProfileFollowCounts = async (
  tx: Transaction,
  followerProfileId: string,
  followeeProfileId: string,
) => {
  await tx
    .update(Profiles)
    .set({ followingCount: sql`${Profiles.followingCount} + 1` })
    .where(eq(Profiles.id, followerProfileId));
  await tx
    .update(Profiles)
    .set({ followersCount: sql`${Profiles.followersCount} + 1` })
    .where(eq(Profiles.id, followeeProfileId));
};

export const createProfileFollow = async (
  {
    followerProfileId,
    followeeProfileId,
    source = { kind: 'local' },
  }: ProfileFollowInput & { source?: FollowRequestSource },
  {
    notifications = noopNotifications,
    activityPub = noopActivityPub,
  }: FollowRequestActionPorts = {},
): Promise<CreateProfileFollowResult> => {
  const result = await db.transaction(async (tx) => {
    const target = await tx
      .select({ followPolicy: Profiles.followPolicy, id: Profiles.id })
      .from(Profiles)
      .where(and(eq(Profiles.id, followeeProfileId), eq(Profiles.state, ProfileState.ACTIVE)))
      .limit(1)
      .for('update')
      .then(firstOrThrowWith(() => new NotFoundError('Profile not found')));

    if (followerProfileId === target.id) {
      throw new ConflictError({ message: 'Profile cannot follow itself' });
    }

    const follower = await tx
      .select({ id: Profiles.id })
      .from(Profiles)
      .where(and(eq(Profiles.id, followerProfileId), eq(Profiles.state, ProfileState.ACTIVE)))
      .limit(1)
      .then(first);
    if (!follower) {
      throw new NotFoundError('Follower profile not found');
    }

    const [existingFollow, existingRequest] = await Promise.all([
      tx
        .select()
        .from(ProfileFollows)
        .where(
          and(
            eq(ProfileFollows.followerProfileId, followerProfileId),
            eq(ProfileFollows.followeeProfileId, target.id),
          ),
        )
        .limit(1)
        .then(first),
      tx
        .select()
        .from(ProfileFollowRequests)
        .where(
          and(
            eq(ProfileFollowRequests.followerProfileId, followerProfileId),
            eq(ProfileFollowRequests.followeeProfileId, target.id),
          ),
        )
        .limit(1)
        .then(first),
    ]);

    if (existingFollow) {
      const removedRequest = existingRequest
        ? await tx
            .delete(ProfileFollowRequests)
            .where(eq(ProfileFollowRequests.id, existingRequest.id))
            .returning()
            .then(first)
        : undefined;
      return {
        result: {
          kind: 'follow',
          created: false,
          profileFollow: existingFollow,
          profileFollowRequest: null,
        } as const,
        removedRequest,
      };
    }

    if (target.followPolicy === ProfileFollowPolicy.APPROVAL_REQUIRED) {
      if (existingRequest) {
        return {
          result: {
            kind: 'request',
            created: false,
            profileFollow: null,
            profileFollowRequest: existingRequest,
          } as const,
        };
      }

      const request = await tx
        .insert(ProfileFollowRequests)
        .values({ followerProfileId, followeeProfileId: target.id })
        .returning()
        .then(firstOrThrowWith(() => new ConflictError({ message: 'Follow request failed' })));
      return {
        result: {
          kind: 'request',
          created: true,
          profileFollow: null,
          profileFollowRequest: request,
        } as const,
      };
    }

    const inserted = await tx
      .insert(ProfileFollows)
      .values({ followerProfileId, followeeProfileId: target.id })
      .onConflictDoNothing()
      .returning()
      .then(first);
    let profileFollow = inserted;
    if (!profileFollow) {
      profileFollow = await tx
        .select()
        .from(ProfileFollows)
        .where(
          and(
            eq(ProfileFollows.followerProfileId, followerProfileId),
            eq(ProfileFollows.followeeProfileId, target.id),
          ),
        )
        .limit(1)
        .then(first);
    }
    if (!profileFollow) {
      throw new ConflictError({ message: 'Profile follow failed' });
    }

    if (inserted) {
      await incrementProfileFollowCounts(tx, followerProfileId, target.id);
    }

    const removedRequest = existingRequest
      ? await tx
          .delete(ProfileFollowRequests)
          .where(eq(ProfileFollowRequests.id, existingRequest.id))
          .returning()
          .then(first)
      : undefined;
    return {
      result: {
        kind: 'follow',
        created: Boolean(inserted),
        profileFollow,
        profileFollowRequest: null,
      } as const,
      removedRequest,
    };
  });

  if (result.removedRequest) {
    await notifications.removed({ request: result.removedRequest, reason: 'cancelled' });
  }
  if (result.result.kind === 'request' && result.result.created) {
    await notifications.created({ request: result.result.profileFollowRequest });
    if (source.kind === 'activitypub') {
      await activityPub.requestCreated({
        request: result.result.profileFollowRequest,
        source,
      });
    }
  }

  return result.result;
};

export const approveProfileFollowRequest = async (
  { requestId, actorProfileId }: { requestId: string; actorProfileId: string },
  {
    notifications = noopNotifications,
    activityPub = noopActivityPub,
  }: FollowRequestActionPorts = {},
) => {
  const result = await db.transaction(async (tx) => {
    const request = await tx
      .select()
      .from(ProfileFollowRequests)
      .where(
        and(
          eq(ProfileFollowRequests.id, requestId),
          eq(ProfileFollowRequests.followeeProfileId, actorProfileId),
        ),
      )
      .limit(1)
      .then(firstOrThrowWith(() => new NotFoundError('Follow request not found')));

    const followee = await tx
      .select({ id: Profiles.id })
      .from(Profiles)
      .where(
        and(eq(Profiles.id, request.followeeProfileId), eq(Profiles.state, ProfileState.ACTIVE)),
      )
      .limit(1)
      .for('update')
      .then(first);
    const follower = await tx
      .select({ id: Profiles.id })
      .from(Profiles)
      .where(
        and(eq(Profiles.id, request.followerProfileId), eq(Profiles.state, ProfileState.ACTIVE)),
      )
      .limit(1)
      .then(first);
    if (!follower || !followee) {
      throw new ConflictError({ message: 'Follow request participants must be active' });
    }

    const existing = await tx
      .select()
      .from(ProfileFollows)
      .where(
        and(
          eq(ProfileFollows.followerProfileId, request.followerProfileId),
          eq(ProfileFollows.followeeProfileId, request.followeeProfileId),
        ),
      )
      .limit(1)
      .then(first);
    const inserted = existing
      ? undefined
      : await tx
          .insert(ProfileFollows)
          .values({
            followerProfileId: request.followerProfileId,
            followeeProfileId: request.followeeProfileId,
          })
          .onConflictDoNothing()
          .returning()
          .then(first);
    let profileFollow = existing ?? inserted;
    if (!profileFollow) {
      profileFollow = await tx
        .select()
        .from(ProfileFollows)
        .where(
          and(
            eq(ProfileFollows.followerProfileId, request.followerProfileId),
            eq(ProfileFollows.followeeProfileId, request.followeeProfileId),
          ),
        )
        .limit(1)
        .then(first);
    }
    if (!profileFollow) {
      throw new ConflictError({ message: 'Profile follow failed' });
    }

    if (inserted) {
      await incrementProfileFollowCounts(tx, request.followerProfileId, request.followeeProfileId);
    }

    const deleted = await tx
      .delete(ProfileFollowRequests)
      .where(eq(ProfileFollowRequests.id, request.id))
      .returning()
      .then(firstOrThrowWith(() => new NotFoundError('Follow request not found')));
    return { request: deleted, profileFollow };
  });

  await notifications.removed({ request: result.request, reason: 'accepted' });
  await activityPub.respond({ request: result.request, disposition: 'accepted' });
  return result;
};

const removeProfileFollowRequest = async (
  { requestId, actorProfileId }: { requestId: string; actorProfileId: string },
  role: 'follower' | 'followee',
) =>
  db.transaction(async (tx) =>
    tx
      .delete(ProfileFollowRequests)
      .where(
        and(
          eq(ProfileFollowRequests.id, requestId),
          eq(
            role === 'follower'
              ? ProfileFollowRequests.followerProfileId
              : ProfileFollowRequests.followeeProfileId,
            actorProfileId,
          ),
        ),
      )
      .returning()
      .then(firstOrThrowWith(() => new NotFoundError('Follow request not found'))),
  );

export const rejectProfileFollowRequest = async (
  input: { requestId: string; actorProfileId: string },
  {
    notifications = noopNotifications,
    activityPub = noopActivityPub,
  }: FollowRequestActionPorts = {},
) => {
  const request = await removeProfileFollowRequest(input, 'followee');
  await notifications.removed({ request, reason: 'rejected' });
  await activityPub.respond({ request, disposition: 'rejected' });
  return request;
};

export const cancelProfileFollowRequest = async (
  input: { requestId: string; actorProfileId: string },
  { notifications = noopNotifications }: FollowRequestActionPorts = {},
) => {
  const request = await removeProfileFollowRequest(input, 'follower');
  await notifications.removed({ request, reason: 'cancelled' });
  return request;
};

export const unfollowProfile = async ({
  followerProfileId,
  followeeProfileId,
}: ProfileFollowInput): Promise<{ profileId: string; profileFollowId: string | null }> =>
  db.transaction(async (tx) => {
    const target = await tx
      .select({ id: Profiles.id })
      .from(Profiles)
      .where(and(eq(Profiles.id, followeeProfileId), eq(Profiles.state, ProfileState.ACTIVE)))
      .limit(1)
      .then(firstOrThrowWith(() => new NotFoundError('Profile not found')));

    const deleted = await tx
      .delete(ProfileFollows)
      .where(
        and(
          eq(ProfileFollows.followerProfileId, followerProfileId),
          eq(ProfileFollows.followeeProfileId, target.id),
        ),
      )
      .returning({ id: ProfileFollows.id })
      .then(first);

    if (deleted) {
      await tx
        .update(Profiles)
        .set({ followingCount: sql`greatest(${Profiles.followingCount} - 1, 0)` })
        .where(eq(Profiles.id, followerProfileId));
      await tx
        .update(Profiles)
        .set({ followersCount: sql`greatest(${Profiles.followersCount} - 1, 0)` })
        .where(eq(Profiles.id, target.id));
    }

    return { profileId: target.id, profileFollowId: deleted?.id ?? null };
  });
