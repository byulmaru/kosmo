import { Follow } from '@fedify/vocab';
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
import { resolveConfiguredLocalInstance } from '@kosmo/core/local-instance';
import { and, eq } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';
import { z } from 'zod';
import { isHttpUri } from './activitypub-uri';
import { getFollowActivityUri } from './follow-delivery';
import type { RequestContext } from '@fedify/fedify';
import type { FedifyExecutionContext } from './fedify-execution';

const FollowerProfiles = alias(Profiles, 'outbound_follow_follower_profile');
const FollowerInstances = alias(Instances, 'outbound_follow_follower_instance');
const FollowerActors = alias(ActivityPubActors, 'outbound_follow_follower_actor');
const FolloweeProfiles = alias(Profiles, 'outbound_follow_followee_profile');
const FolloweeInstances = alias(Instances, 'outbound_follow_followee_instance');
const FolloweeActors = alias(ActivityPubActors, 'outbound_follow_followee_actor');

const followIdSchema = z.uuid().refine((value) => value === value.toLowerCase());

type FollowProjectionTable = typeof ProfileFollowRequests | typeof ProfileFollows;

const loadOutboundFollow = async (
  context: RequestContext<FedifyExecutionContext>,
  table: FollowProjectionTable,
  id: string,
) =>
  db
    .select({
      createdAt: table.createdAt,
      followeeActorUri: FolloweeActors.uri,
      followerActorUri: FollowerActors.uri,
      followerProfileId: FollowerProfiles.id,
      id: table.id,
    })
    .from(table)
    .innerJoin(FollowerProfiles, eq(FollowerProfiles.id, table.followerProfileId))
    .innerJoin(FollowerInstances, eq(FollowerInstances.id, FollowerProfiles.instanceId))
    .innerJoin(FollowerActors, eq(FollowerActors.profileId, FollowerProfiles.id))
    .innerJoin(FolloweeProfiles, eq(FolloweeProfiles.id, table.followeeProfileId))
    .innerJoin(FolloweeInstances, eq(FolloweeInstances.id, FolloweeProfiles.instanceId))
    .innerJoin(FolloweeActors, eq(FolloweeActors.profileId, FolloweeProfiles.id))
    .where(
      and(
        eq(table.id, id),
        eq(FollowerProfiles.state, ProfileState.ACTIVE),
        eq(FollowerInstances.kind, InstanceKind.LOCAL),
        eq(FollowerInstances.state, InstanceState.ACTIVE),
        eq(FollowerInstances.canonicalOrigin, context.canonicalOrigin),
        eq(FolloweeProfiles.state, ProfileState.ACTIVE),
        eq(FolloweeInstances.kind, InstanceKind.ACTIVITYPUB),
        eq(FolloweeInstances.state, InstanceState.ACTIVE),
      ),
    )
    .limit(1)
    .then(first);

export const dispatchLocalProfileFollow = async (
  context: RequestContext<FedifyExecutionContext>,
  { id }: { id: string },
): Promise<Follow | null> => {
  if (
    context.host !== new URL(context.canonicalOrigin).host ||
    !followIdSchema.safeParse(id).success
  ) {
    return null;
  }

  const localInstance = await resolveConfiguredLocalInstance();
  if (
    localInstance.canonicalOrigin !== context.canonicalOrigin ||
    localInstance.state !== InstanceState.ACTIVE
  ) {
    return null;
  }

  const [established, pending] = await Promise.all([
    loadOutboundFollow(context, ProfileFollows, id),
    loadOutboundFollow(context, ProfileFollowRequests, id),
  ]);
  if ((established == null) === (pending == null)) {
    return null;
  }
  const projection = established ?? pending!;

  let followerActorUri: URL;
  let followeeActorUri: URL;
  try {
    followerActorUri = new URL(projection.followerActorUri);
    followeeActorUri = new URL(projection.followeeActorUri);
  } catch {
    return null;
  }
  if (
    !isHttpUri(followerActorUri) ||
    !isHttpUri(followeeActorUri) ||
    followerActorUri.href !== context.getActorUri(projection.followerProfileId).href
  ) {
    return null;
  }

  return new Follow({
    actor: followerActorUri,
    id: getFollowActivityUri(context.canonicalOrigin, projection.id),
    object: followeeActorUri,
    published: projection.createdAt,
    tos: [followeeActorUri],
  });
};
