import {
  ActivityPubActors,
  db,
  first,
  firstOrThrowWith,
  Instances,
  ProfileFollowRequests,
  ProfileFollows,
  Profiles,
} from '@kosmo/core/db';
import { InstanceKind } from '@kosmo/core/enums';
import { sendProfileFollow, sendProfileFollowAccept, sendProfileUnfollow } from '@kosmo/fedify';
import { and, eq } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';
import type {
  ProfileFollowAcceptEffectInput,
  ProfileFollowCreateEffectInput,
  ProfileFollowDeleteEffectInput,
} from '@kosmo/core/services';

const FollowerProfiles = alias(Profiles, 'worker_follow_follower_profile');
const FollowerInstances = alias(Instances, 'worker_follow_follower_instance');
const FollowerActors = alias(ActivityPubActors, 'worker_follow_follower_actor');
const FolloweeProfiles = alias(Profiles, 'worker_follow_followee_profile');
const FolloweeInstances = alias(Instances, 'worker_follow_followee_instance');
const FolloweeActors = alias(ActivityPubActors, 'worker_follow_followee_actor');

type FollowProjectionTable = typeof ProfileFollowRequests | typeof ProfileFollows;

/** Sends a Follow for the committed relation/request projection. */
export const sendProfileFollowActivity = async ({
  sourceKind,
  sourceId,
}: ProfileFollowCreateEffectInput): Promise<void> => {
  const sourceTable: FollowProjectionTable =
    sourceKind === 'FOLLOW' ? ProfileFollows : ProfileFollowRequests;
  const projection = await db
    .select({
      actorInboxUri: FolloweeActors.inboxUri,
      actorSharedInboxUri: FolloweeActors.sharedInboxUri,
      actorUri: FolloweeActors.uri,
      createdAt: sourceTable.createdAt,
      followeeInstanceKind: FolloweeInstances.kind,
      followerInstanceKind: FollowerInstances.kind,
      id: sourceTable.id,
      senderProfileId: FollowerProfiles.id,
    })
    .from(sourceTable)
    .innerJoin(FollowerProfiles, eq(FollowerProfiles.id, sourceTable.followerProfileId))
    .innerJoin(FollowerInstances, eq(FollowerInstances.id, FollowerProfiles.instanceId))
    .innerJoin(FolloweeProfiles, eq(FolloweeProfiles.id, sourceTable.followeeProfileId))
    .innerJoin(FolloweeInstances, eq(FolloweeInstances.id, FolloweeProfiles.instanceId))
    .leftJoin(FolloweeActors, eq(FolloweeActors.profileId, FolloweeProfiles.id))
    .where(eq(sourceTable.id, sourceId))
    .limit(1)
    .then(first);
  if (!projection) {
    return;
  }
  if (
    projection.followerInstanceKind !== InstanceKind.LOCAL ||
    projection.followeeInstanceKind !== InstanceKind.ACTIVITYPUB
  ) {
    return;
  }
  if (!projection.actorUri || !projection.actorInboxUri) {
    throw new TypeError('ActivityPub Follow recipient projection is incomplete.');
  }

  await sendProfileFollow({
    actor: {
      inboxUri: projection.actorInboxUri,
      sharedInboxUri: projection.actorSharedInboxUri,
      uri: projection.actorUri,
    },
    outboundFollow: {
      createdAt: projection.createdAt,
      id: projection.id,
    },
    senderProfileId: projection.senderProfileId,
  });
};

/** Sends Accept for the exact inbound Follow approved by the local followee. */
export const sendProfileFollowAcceptActivity = async ({
  followerProfileId,
  followeeProfileId,
  inboundFollow,
  profileFollowId,
}: ProfileFollowAcceptEffectInput): Promise<void> => {
  const projection = await db
    .select({
      actorInboxUri: FollowerActors.inboxUri,
      actorSharedInboxUri: FollowerActors.sharedInboxUri,
      actorUri: FollowerActors.uri,
      followeeInstanceKind: FolloweeInstances.kind,
      followerInstanceKind: FollowerInstances.kind,
      senderProfileId: FolloweeProfiles.id,
    })
    .from(ProfileFollows)
    .leftJoin(FollowerProfiles, eq(FollowerProfiles.id, ProfileFollows.followerProfileId))
    .leftJoin(FollowerInstances, eq(FollowerInstances.id, FollowerProfiles.instanceId))
    .leftJoin(FollowerActors, eq(FollowerActors.profileId, FollowerProfiles.id))
    .leftJoin(FolloweeProfiles, eq(FolloweeProfiles.id, ProfileFollows.followeeProfileId))
    .leftJoin(FolloweeInstances, eq(FolloweeInstances.id, FolloweeProfiles.instanceId))
    .where(
      and(
        eq(ProfileFollows.id, profileFollowId),
        eq(ProfileFollows.followerProfileId, followerProfileId),
        eq(ProfileFollows.followeeProfileId, followeeProfileId),
      ),
    )
    .limit(1)
    .then(first);
  if (!projection) {
    return;
  }

  if (
    projection.senderProfileId === null ||
    projection.followerInstanceKind !== InstanceKind.ACTIVITYPUB ||
    projection.followeeInstanceKind !== InstanceKind.LOCAL
  ) {
    throw new TypeError('ActivityPub Follow Accept participant projection is incomplete.');
  }
  if (!projection.actorUri || !projection.actorInboxUri) {
    throw new TypeError('ActivityPub Follow Accept recipient projection is incomplete.');
  }

  await sendProfileFollowAccept({
    actor: {
      inboxUri: projection.actorInboxUri,
      sharedInboxUri: projection.actorSharedInboxUri,
      uri: projection.actorUri,
    },
    ...(inboundFollow === undefined ? {} : { inboundFollow }),
    senderProfileId: projection.senderProfileId,
  });
};

/** Sends an Undo using the exact deleted source ID and directed pair. */
export const sendProfileUnfollowActivity = async (
  input: Pick<
    ProfileFollowDeleteEffectInput,
    'followerProfileId' | 'followeeProfileId' | 'sourceId'
  >,
): Promise<void> => {
  const projection = await db
    .select({
      actorInboxUri: FolloweeActors.inboxUri,
      actorSharedInboxUri: FolloweeActors.sharedInboxUri,
      actorUri: FolloweeActors.uri,
      followeeInstanceKind: FolloweeInstances.kind,
      followerInstanceKind: FollowerInstances.kind,
      senderProfileId: FollowerProfiles.id,
    })
    .from(FollowerProfiles)
    .innerJoin(FollowerInstances, eq(FollowerInstances.id, FollowerProfiles.instanceId))
    .innerJoin(FolloweeProfiles, eq(FolloweeProfiles.id, input.followeeProfileId))
    .innerJoin(FolloweeInstances, eq(FolloweeInstances.id, FolloweeProfiles.instanceId))
    .leftJoin(FolloweeActors, eq(FolloweeActors.profileId, FolloweeProfiles.id))
    .where(eq(FollowerProfiles.id, input.followerProfileId))
    .limit(1)
    .then(
      firstOrThrowWith(() => new TypeError('ActivityPub Undo participant projection is missing.')),
    );
  if (
    projection.followerInstanceKind !== InstanceKind.LOCAL ||
    projection.followeeInstanceKind !== InstanceKind.ACTIVITYPUB
  ) {
    return;
  }
  if (!projection.actorUri || !projection.actorInboxUri) {
    throw new TypeError('ActivityPub Undo recipient projection is incomplete.');
  }

  await sendProfileUnfollow({
    actor: {
      inboxUri: projection.actorInboxUri,
      sharedInboxUri: projection.actorSharedInboxUri,
      uri: projection.actorUri,
    },
    outboundFollow: {
      id: input.sourceId,
    },
    senderProfileId: projection.senderProfileId,
  });
};
