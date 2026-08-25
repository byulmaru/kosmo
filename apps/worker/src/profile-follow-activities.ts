import {
  ActivityPubActors,
  db,
  first,
  Instances,
  ProfileFollowRequests,
  ProfileFollows,
  Profiles,
} from '@kosmo/core/db';
import { InstanceKind, InstanceState, ProfileState } from '@kosmo/core/enums';
import { sendProfileFollow, sendProfileUnfollow } from '@kosmo/fedify';
import { and, eq, isNotNull } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';

const FollowerProfiles = alias(Profiles, 'worker_follow_follower_profile');
const FollowerInstances = alias(Instances, 'worker_follow_follower_instance');
const FolloweeProfiles = alias(Profiles, 'worker_follow_followee_profile');
const FolloweeInstances = alias(Instances, 'worker_follow_followee_instance');
const FolloweeActors = alias(ActivityPubActors, 'worker_follow_followee_actor');

type FollowProjectionTable = typeof ProfileFollowRequests | typeof ProfileFollows;

type ProfileFollowSourceInput = {
  readonly sourceKind: 'FOLLOW' | 'FOLLOW_REQUEST';
  readonly sourceId: string;
};

type ProfileFollowDeleteSnapshot = {
  readonly createdAt: string;
  readonly followerProfileId: string;
  readonly followeeProfileId: string;
  readonly id: string;
  readonly sourceId: string;
};

/** Sends a Follow for the committed relation/request projection. */
export const sendProfileFollowActivity = async ({
  sourceKind,
  sourceId,
}: ProfileFollowSourceInput): Promise<void> => {
  const sourceTable: FollowProjectionTable =
    sourceKind === 'FOLLOW' ? ProfileFollows : ProfileFollowRequests;
  const projection = await db
    .select({
      actorInboxUri: FolloweeActors.inboxUri,
      actorSharedInboxUri: FolloweeActors.sharedInboxUri,
      actorUri: FolloweeActors.uri,
      createdAt: sourceTable.createdAt,
      id: sourceTable.id,
      senderProfileId: FollowerProfiles.id,
    })
    .from(sourceTable)
    .innerJoin(FollowerProfiles, eq(FollowerProfiles.id, sourceTable.followerProfileId))
    .innerJoin(FollowerInstances, eq(FollowerInstances.id, FollowerProfiles.instanceId))
    .innerJoin(FolloweeProfiles, eq(FolloweeProfiles.id, sourceTable.followeeProfileId))
    .innerJoin(FolloweeInstances, eq(FolloweeInstances.id, FolloweeProfiles.instanceId))
    .innerJoin(FolloweeActors, eq(FolloweeActors.profileId, FolloweeProfiles.id))
    .where(
      and(
        eq(sourceTable.id, sourceId),
        eq(FollowerProfiles.state, ProfileState.ACTIVE),
        eq(FollowerInstances.kind, InstanceKind.LOCAL),
        eq(FollowerInstances.state, InstanceState.ACTIVE),
        eq(FolloweeProfiles.state, ProfileState.ACTIVE),
        eq(FolloweeInstances.kind, InstanceKind.ACTIVITYPUB),
        eq(FolloweeInstances.state, InstanceState.ACTIVE),
        isNotNull(FolloweeActors.inboxUri),
      ),
    )
    .limit(1)
    .then(first);
  if (!projection) {
    return;
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

/** Sends an Undo using the immutable deleted relation/request snapshot. */
export const sendProfileUnfollowActivity = async (
  input: ProfileFollowDeleteSnapshot,
): Promise<void> => {
  if (input.id !== input.sourceId) {
    throw new TypeError('ActivityPub Follow delete snapshot source identity mismatch.');
  }

  const projection = await db
    .select({
      actorInboxUri: FolloweeActors.inboxUri,
      actorSharedInboxUri: FolloweeActors.sharedInboxUri,
      actorUri: FolloweeActors.uri,
      senderProfileId: FollowerProfiles.id,
    })
    .from(FollowerProfiles)
    .innerJoin(FollowerInstances, eq(FollowerInstances.id, FollowerProfiles.instanceId))
    .innerJoin(FolloweeProfiles, eq(FolloweeProfiles.id, input.followeeProfileId))
    .innerJoin(FolloweeInstances, eq(FolloweeInstances.id, FolloweeProfiles.instanceId))
    .innerJoin(FolloweeActors, eq(FolloweeActors.profileId, FolloweeProfiles.id))
    .where(
      and(
        eq(FollowerProfiles.id, input.followerProfileId),
        eq(FollowerProfiles.state, ProfileState.ACTIVE),
        eq(FollowerInstances.kind, InstanceKind.LOCAL),
        eq(FollowerInstances.state, InstanceState.ACTIVE),
        eq(FolloweeProfiles.state, ProfileState.ACTIVE),
        eq(FolloweeInstances.kind, InstanceKind.ACTIVITYPUB),
        eq(FolloweeInstances.state, InstanceState.ACTIVE),
        isNotNull(FolloweeActors.inboxUri),
      ),
    )
    .limit(1)
    .then(first);
  if (!projection) {
    return;
  }

  await sendProfileUnfollow({
    actor: {
      inboxUri: projection.actorInboxUri,
      sharedInboxUri: projection.actorSharedInboxUri,
      uri: projection.actorUri,
    },
    outboundFollow: {
      createdAt: Temporal.Instant.from(input.createdAt),
      id: input.id,
    },
    senderProfileId: projection.senderProfileId,
  });
};
