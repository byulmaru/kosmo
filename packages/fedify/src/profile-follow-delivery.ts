import { Follow, Undo } from '@fedify/vocab';
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
import { and, eq, isNotNull } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';
import { federation } from './federation';
import { getFollowActivityUri, getFollowOrderingKey } from './follow-delivery';
import type { Context } from '@fedify/fedify';
import type { Recipient } from '@fedify/vocab';

const FollowerProfiles = alias(Profiles, 'temporal_follow_follower_profile');
const FollowerInstances = alias(Instances, 'temporal_follow_follower_instance');
const FolloweeProfiles = alias(Profiles, 'temporal_follow_followee_profile');
const FolloweeInstances = alias(Instances, 'temporal_follow_followee_instance');
const FolloweeActors = alias(ActivityPubActors, 'temporal_follow_followee_actor');

export type ProfileFollowDeliveryInput = {
  readonly sourceKind: 'FOLLOW' | 'FOLLOW_REQUEST';
  readonly sourceId: string;
};

type DeletedProfileFollowSnapshot = {
  readonly sourceId: string;
  readonly id: string;
  readonly followerProfileId: string;
  readonly followeeProfileId: string;
  readonly createdAt: string;
};

type RemoteProfileFollowActor = {
  inboxUri: string | null;
  sharedInboxUri: string | null;
  uri: string;
};

type ProfileFollowDeliveryOptions = {
  actor: RemoteProfileFollowActor;
  outboundFollow: {
    createdAt: Temporal.Instant;
    id: string;
  };
  senderProfileId: string;
};

type ProfileFollowRecipient = Recipient & {
  id: URL;
  inboxId: URL;
};

type FollowProjectionTable = typeof ProfileFollowRequests | typeof ProfileFollows;

type FollowProjection = {
  readonly actor: RemoteProfileFollowActor;
  readonly createdAt: Temporal.Instant;
  readonly id: string;
  readonly senderProfileId: string;
};

const loadOutboundFollow = async (
  table: FollowProjectionTable,
  id: string,
): Promise<FollowProjection | undefined> =>
  db
    .select({
      actorInboxUri: FolloweeActors.inboxUri,
      actorSharedInboxUri: FolloweeActors.sharedInboxUri,
      actorUri: FolloweeActors.uri,
      createdAt: table.createdAt,
      id: table.id,
      senderProfileId: FollowerProfiles.id,
    })
    .from(table)
    .innerJoin(FollowerProfiles, eq(FollowerProfiles.id, table.followerProfileId))
    .innerJoin(FollowerInstances, eq(FollowerInstances.id, FollowerProfiles.instanceId))
    .innerJoin(FolloweeProfiles, eq(FolloweeProfiles.id, table.followeeProfileId))
    .innerJoin(FolloweeInstances, eq(FolloweeInstances.id, FolloweeProfiles.instanceId))
    .innerJoin(FolloweeActors, eq(FolloweeActors.profileId, FolloweeProfiles.id))
    .where(
      and(
        eq(table.id, id),
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
    .then(first)
    .then((row) =>
      row
        ? {
            actor: {
              inboxUri: row.actorInboxUri,
              sharedInboxUri: row.actorSharedInboxUri,
              uri: row.actorUri,
            },
            createdAt: row.createdAt,
            id: row.id,
            senderProfileId: row.senderProfileId,
          }
        : undefined,
    );

const loadDeletedFollow = async (
  input: DeletedProfileFollowSnapshot,
): Promise<FollowProjection | undefined> =>
  db
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
    .then(first)
    .then((row) =>
      row
        ? {
            actor: {
              inboxUri: row.actorInboxUri,
              sharedInboxUri: row.actorSharedInboxUri,
              uri: row.actorUri,
            },
            createdAt: Temporal.Instant.from(input.createdAt),
            id: input.id,
            senderProfileId: row.senderProfileId,
          }
        : undefined,
    );

const createFederationContext = async (): Promise<Context<void>> => {
  const localInstance = await resolveConfiguredLocalInstance();
  return federation.createContext(new URL(localInstance.canonicalOrigin), undefined);
};

const toProfileFollowRecipient = (actor: RemoteProfileFollowActor): ProfileFollowRecipient => {
  if (!actor.inboxUri) {
    throw new TypeError('ActivityPub follow recipient must have an inbox.');
  }

  return {
    endpoints: actor.sharedInboxUri ? { sharedInbox: new URL(actor.sharedInboxUri) } : null,
    id: new URL(actor.uri),
    inboxId: new URL(actor.inboxUri),
  };
};

export const sendProfileFollow = async ({
  actor,
  outboundFollow,
  senderProfileId,
}: ProfileFollowDeliveryOptions): Promise<void> => {
  const recipientActor = toProfileFollowRecipient(actor);
  const context = await createFederationContext();
  const actorUri = context.getActorUri(senderProfileId);
  const activity = new Follow({
    actor: actorUri,
    id: getFollowActivityUri(context.canonicalOrigin, outboundFollow.id),
    object: recipientActor.id,
    published: outboundFollow.createdAt,
    tos: [recipientActor.id],
  });

  await context.sendActivity({ identifier: senderProfileId }, recipientActor, activity, {
    orderingKey: getFollowOrderingKey(actorUri, recipientActor.id),
  });
};

export const sendProfileUnfollow = async ({
  actor,
  outboundFollow,
  senderProfileId,
}: ProfileFollowDeliveryOptions): Promise<void> => {
  const recipientActor = toProfileFollowRecipient(actor);
  const context = await createFederationContext();
  const actorUri = context.getActorUri(senderProfileId);
  const originalFollow = new Follow({
    actor: actorUri,
    id: getFollowActivityUri(context.canonicalOrigin, outboundFollow.id),
    object: recipientActor.id,
    published: outboundFollow.createdAt,
  });
  const activity = new Undo({
    actor: actorUri,
    object: originalFollow,
    tos: [recipientActor.id],
  });

  await context.sendActivity({ identifier: senderProfileId }, recipientActor, activity, {
    orderingKey: getFollowOrderingKey(actorUri, recipientActor.id),
  });
};

/**
 * Sends the Follow represented by a committed source row. The source row is
 * still present for create effects, so the current actor projection is used
 * only to recover the recipient and sender identity.
 */
export const sendProfileFollowBySource = async ({
  sourceKind,
  sourceId,
}: ProfileFollowDeliveryInput): Promise<void> => {
  const projection = await loadOutboundFollow(
    sourceKind === 'FOLLOW' ? ProfileFollows : ProfileFollowRequests,
    sourceId,
  );
  if (!projection) {
    return;
  }

  await sendProfileFollow({
    actor: projection.actor,
    outboundFollow: {
      createdAt: projection.createdAt,
      id: projection.id,
    },
    senderProfileId: projection.senderProfileId,
  });
};

/**
 * Sends the Undo represented by an immutable deleted-source snapshot. The
 * relation/request is intentionally not re-read; only the current sender and
 * remote recipient actor projection are required for queue handoff.
 */
export const sendProfileUnfollowBySnapshot = async (
  input: DeletedProfileFollowSnapshot,
): Promise<void> => {
  if (input.id !== input.sourceId) {
    throw new TypeError('ActivityPub Follow delete snapshot source identity mismatch.');
  }

  const projection = await loadDeletedFollow(input);
  if (!projection) {
    return;
  }

  await sendProfileUnfollow({
    actor: projection.actor,
    outboundFollow: {
      createdAt: projection.createdAt,
      id: projection.id,
    },
    senderProfileId: projection.senderProfileId,
  });
};
