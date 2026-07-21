import { and, eq, inArray, ne, notExists, or } from 'drizzle-orm';
import {
  ActivityPubActors,
  db,
  first,
  firstOrThrow,
  firstOrThrowWith,
  getDatabaseConnection,
  Instances,
  ProfileFollowRequests,
  ProfileFollows,
  Profiles,
} from '../db';
import { InstanceKind, InstanceState, ProfileState } from '../enums';
import { NotFoundError, PermissionDeniedError } from '../error';
import { createFollowNotification } from './notification';
import { ensureProfileFollow } from './profile-follow-relation';
import type { Transaction } from '../db';

export type ProfileFollowRequestRow = typeof ProfileFollowRequests.$inferSelect;
type ProfileFollowRow = typeof ProfileFollows.$inferSelect;

type ProfileFollowPair = {
  readonly followeeProfileId: string;
  readonly followerProfileId: string;
};

const pairCondition = (
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
      .where(pairCondition(ProfileFollows, pair))
      .limit(1)
      .then(first);

    if (profileFollow) {
      await tx.delete(ProfileFollowRequests).where(pairCondition(ProfileFollowRequests, pair));
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
    const profileFollowRequest =
      inserted ??
      (await tx
        .select()
        .from(ProfileFollowRequests)
        .where(pairCondition(ProfileFollowRequests, pair))
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

export const acceptProfileFollowRequest = async ({
  expectedRowId,
  followeeProfileId,
  followerProfileId,
}: ProfileFollowPair & { readonly expectedRowId: string }): Promise<boolean> =>
  db.transaction(async (tx) => {
    const pair = { followeeProfileId, followerProfileId };
    const established = await tx
      .select({ id: ProfileFollows.id })
      .from(ProfileFollows)
      .where(pairCondition(ProfileFollows, pair))
      .limit(1)
      .then(first);

    if (established) {
      return established.id === expectedRowId;
    }

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
          pairCondition(ProfileFollowRequests, pair),
          notExists(unavailableParticipants),
        ),
      )
      .returning({ id: ProfileFollowRequests.id })
      .then(first);

    if (!deleted) {
      return false;
    }

    await ensureProfileFollow(pair, tx);
    return true;
  });

type ApproveProfileFollowRequestResult = {
  readonly followeeProfile: typeof Profiles.$inferSelect;
  readonly followerProfile: typeof Profiles.$inferSelect;
  readonly profileFollow: ProfileFollowRow;
  readonly profileFollowRequestId: string;
};

const approveProfileFollowRequestInTransaction = async (
  {
    actorProfileId,
    profileFollowRequestId,
  }: { readonly actorProfileId: string; readonly profileFollowRequestId: string },
  tx: Transaction,
): Promise<ApproveProfileFollowRequestResult & { readonly created: boolean }> => {
  const request = await tx
    .select()
    .from(ProfileFollowRequests)
    .where(eq(ProfileFollowRequests.id, profileFollowRequestId))
    .limit(1)
    .then(firstOrThrowWith(() => new NotFoundError('Profile follow request not found')));

  if (request.followeeProfileId !== actorProfileId) {
    throw new PermissionDeniedError();
  }

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
    profileFollowRequestId: request.id,
  };
};

export const approveProfileFollowRequest = async ({
  actorProfileId,
  profileFollowRequestId,
}: {
  readonly actorProfileId: string;
  readonly profileFollowRequestId: string;
}): Promise<ApproveProfileFollowRequestResult> => {
  const { created, ...approved } = await db.transaction((tx) =>
    approveProfileFollowRequestInTransaction({ actorProfileId, profileFollowRequestId }, tx),
  );

  if (created) {
    // Notification delivery is best-effort and must not change the committed approval result.
    await createFollowNotification(approved.profileFollow.id).catch(() => undefined);
  }

  return approved;
};

const deleteProfileFollowRequestAsActor = async (
  {
    actorProfileId,
    actorRole,
    profileFollowRequestId,
  }: {
    readonly actorProfileId: string;
    readonly actorRole: 'FOLLOWEE' | 'FOLLOWER';
    readonly profileFollowRequestId: string;
  },
  tx?: Transaction,
) =>
  getDatabaseConnection(tx).transaction(async (tx) => {
    const request = await tx
      .select()
      .from(ProfileFollowRequests)
      .where(eq(ProfileFollowRequests.id, profileFollowRequestId))
      .limit(1)
      .then(firstOrThrowWith(() => new NotFoundError('Profile follow request not found')));
    const expectedActorProfileId =
      actorRole === 'FOLLOWEE' ? request.followeeProfileId : request.followerProfileId;
    if (expectedActorProfileId !== actorProfileId) {
      throw new PermissionDeniedError();
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
      .where(eq(ProfileFollowRequests.id, request.id))
      .returning({ id: ProfileFollowRequests.id })
      .then(firstOrThrowWith(() => new NotFoundError('Profile follow request not found')));

    return { actorProfile: actorProfile.profile, request };
  });

export const rejectProfileFollowRequest = async (
  input: { readonly actorProfileId: string; readonly profileFollowRequestId: string },
  tx?: Transaction,
): Promise<{
  readonly followeeProfile: typeof Profiles.$inferSelect;
  readonly profileFollowRequestId: string;
}> => {
  const result = await deleteProfileFollowRequestAsActor({ ...input, actorRole: 'FOLLOWEE' }, tx);
  return {
    followeeProfile: result.actorProfile,
    profileFollowRequestId: result.request.id,
  };
};

export const cancelProfileFollowRequest = async (input: {
  readonly actorProfileId: string;
  readonly profileFollowRequestId: string;
}): Promise<{
  readonly followerProfile: typeof Profiles.$inferSelect;
  readonly profileFollowRequestId: string;
}> => {
  const { command, result } = await db.transaction(async (tx) => {
    const deleted = await deleteProfileFollowRequestAsActor(
      { ...input, actorRole: 'FOLLOWER' },
      tx,
    );
    const target = await tx
      .select({
        actorInboxUri: ActivityPubActors.inboxUri,
        actorSharedInboxUri: ActivityPubActors.sharedInboxUri,
        actorUri: ActivityPubActors.uri,
        instanceKind: Instances.kind,
        instanceState: Instances.state,
      })
      .from(Profiles)
      .innerJoin(Instances, eq(Instances.id, Profiles.instanceId))
      .leftJoin(ActivityPubActors, eq(ActivityPubActors.profileId, Profiles.id))
      .where(eq(Profiles.id, deleted.request.followeeProfileId))
      .limit(1)
      .then(first);
    const command =
      target?.instanceKind === InstanceKind.ACTIVITYPUB &&
      target.instanceState === InstanceState.ACTIVE &&
      target.actorUri
        ? {
            actor: {
              inboxUri: target.actorInboxUri,
              sharedInboxUri: target.actorSharedInboxUri,
              uri: target.actorUri,
            },
            outboundFollow: deleted.request,
            senderProfileId: input.actorProfileId,
          }
        : undefined;

    return {
      command,
      result: {
        followerProfile: deleted.actorProfile,
        profileFollowRequestId: deleted.request.id,
      },
    };
  });

  if (command) {
    try {
      const { sendProfileUnfollow } = await import('@kosmo/fedify');
      await sendProfileUnfollow(command);
    } catch (error) {
      console.error('Post-commit ActivityPub Undo delivery failed', {
        error,
        profileFollowRequestId: result.profileFollowRequestId,
        requesterProfileId: input.actorProfileId,
      });
    }
  }

  return result;
};
