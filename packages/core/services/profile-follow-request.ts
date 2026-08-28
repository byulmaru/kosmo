import { eq } from 'drizzle-orm';
import { ActivityPubActors, first, getDatabaseConnection, Instances, Profiles } from '../db';
import { InstanceKind, InstanceState } from '../enums';
import {
  createFollowNotification,
  deleteFollowRequestNotificationPostCommit,
} from './notification';
import {
  acceptProfileFollowRequestInTransaction,
  approveProfileFollowRequestInTransaction,
  deleteProfileFollowRequestAsActorInTransaction,
} from './profile-follow-transaction';
import type { Database } from '../db';
import type { ProfileFollowPair } from './profile-follow-relation';
import type {
  AcceptProfileFollowRequestResult,
  ApproveProfileFollowRequestTransactionResult,
} from './profile-follow-transaction';

export type {
  AcceptProfileFollowRequestResult,
  ProfileFollowRequestRow,
} from './profile-follow-transaction';
export { ensureProfileFollowRequest } from './profile-follow-transaction';

export const acceptProfileFollowRequest = async (
  input: ProfileFollowPair & { readonly expectedRowId: string },
  handle?: Database,
): Promise<AcceptProfileFollowRequestResult> => {
  const { result } = await getDatabaseConnection(handle).transaction((tx) =>
    acceptProfileFollowRequestInTransaction(input, tx),
  );

  if (result.kind !== 'NOOP') {
    await deleteFollowRequestNotificationPostCommit(input.expectedRowId, handle);
  }

  return result;
};

type ApproveProfileFollowRequestResult = Omit<
  ApproveProfileFollowRequestTransactionResult,
  'created'
>;

export const approveProfileFollowRequest = async (
  {
    actorProfileId,
    profileFollowRequestId,
  }: {
    readonly actorProfileId: string;
    readonly profileFollowRequestId: string;
  },
  handle?: Database,
): Promise<ApproveProfileFollowRequestResult> => {
  const { created, ...approved } = await getDatabaseConnection(handle).transaction((tx) =>
    approveProfileFollowRequestInTransaction(
      {
        actorProfileId,
        profileFollowRequestId,
        unauthorizedError: 'PERMISSION_DENIED',
      },
      tx,
    ),
  );

  await deleteFollowRequestNotificationPostCommit(approved.profileFollowRequestId, handle);

  if (created) {
    // Notification delivery is best-effort and must not change the committed approval result.
    await createFollowNotification(approved.profileFollow.id, handle).catch(() => undefined);
  }

  return approved;
};

export const rejectProfileFollowRequest = async (
  input: {
    readonly actorProfileId: string;
    readonly profileFollowRequestId: string;
  },
  handle?: Database,
): Promise<{
  readonly followeeProfile: typeof Profiles.$inferSelect;
  readonly profileFollowRequestId: string;
}> => {
  const result = await getDatabaseConnection(handle).transaction((tx) =>
    deleteProfileFollowRequestAsActorInTransaction(
      { ...input, actorRole: 'FOLLOWEE', unauthorizedError: 'PERMISSION_DENIED' },
      tx,
    ),
  );
  await deleteFollowRequestNotificationPostCommit(result.request.id, handle);
  return {
    followeeProfile: result.actorProfile,
    profileFollowRequestId: result.request.id,
  };
};

export const cancelProfileFollowRequest = async (
  input: {
    readonly actorProfileId: string;
    readonly profileFollowRequestId: string;
  },
  handle?: Database,
): Promise<{
  readonly followerProfile: typeof Profiles.$inferSelect;
  readonly profileFollowRequestId: string;
}> => {
  const { command, result } = await getDatabaseConnection(handle).transaction(async (tx) => {
    const deleted = await deleteProfileFollowRequestAsActorInTransaction(
      { ...input, actorRole: 'FOLLOWER', unauthorizedError: 'PERMISSION_DENIED' },
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

  await deleteFollowRequestNotificationPostCommit(result.profileFollowRequestId, handle);

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
