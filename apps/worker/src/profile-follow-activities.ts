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
import { sendProfileFollow, sendProfileUnfollow } from '@kosmo/fedify';
import { eq } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';
import type {
  ProfileFollowCreateEffectInput,
  ProfileFollowDeleteEffectInput,
} from '@kosmo/core/services';

const FollowerProfiles = alias(Profiles, 'worker_follow_follower_profile');
const FollowerInstances = alias(Instances, 'worker_follow_follower_instance');
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
