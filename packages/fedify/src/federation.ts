import { createFederation, MemoryKvStore } from '@fedify/fedify';
import { Accept, Follow, Reject, Undo } from '@fedify/vocab';
import {
  ActivityPubActors,
  db,
  first,
  Instances,
  ProfileFollowRequests,
  ProfileFollows,
  Profiles,
} from '@kosmo/core/db';
import { InstanceKind, InstanceState, ProfileFollowPolicy, ProfileState } from '@kosmo/core/enums';
import { resolveConfiguredLocalInstance } from '@kosmo/core/local-instance';
import { createProfileFollow, deleteProfileFollow } from '@kosmo/core/profile-follow';
import { and, eq } from 'drizzle-orm';
import {
  createFollowOrderingKey,
  parseLocalActorUri,
  parseOutboundFollowUri,
  sendAcceptFollowActivity,
} from './follow';
import { ensureDrizzleLocalProfileActor } from './local-actor-store';
import { createLocalProfilePerson } from './local-profile-person';
import { findOrMaterializeRemoteProfileActorByUri } from './remote-actor-materialization';
import { resolveLocalActorIdentifierByHandle } from './webfinger';
import type { Context, Federation } from '@fedify/fedify';
import type { ProfileFollowRow } from '@kosmo/core/profile-follow';

type StoredRemoteActor = {
  actorUri: string;
  instanceState: InstanceState;
  profileId: string;
};

type StoredLocalActor = {
  actorUri: URL;
  followPolicy: ProfileFollowPolicy;
  profileId: string;
};

const activityTimestamp = (activity: { published: Temporal.Instant | null }) =>
  activity.published ?? Temporal.Now.instant();

const federationOrigin = process.env.PUBLIC_ORIGIN;

export const federation: Federation<void> = createFederation<void>({
  allowPrivateAddress: false,
  kv: new MemoryKvStore(),
  ...(federationOrigin ? { origin: federationOrigin } : {}),
});

federation
  .setActorDispatcher('/ap/actor/{identifier}', async (ctx, identifier) => {
    if (ctx.host !== new URL(ctx.canonicalOrigin).host) {
      return null;
    }

    const localInstance = await resolveConfiguredLocalInstance();
    const result = await ensureDrizzleLocalProfileActor({
      actorUri: ctx.getActorUri(identifier),
      localInstanceId: localInstance.id,
      profileId: identifier,
    });

    if (!result) {
      return null;
    }

    const actorIdentifier = result.profile.id;
    const keyPairs = await ctx.getActorKeyPairs(actorIdentifier);

    return createLocalProfilePerson({
      context: ctx,
      keyPairs,
      profile: result.profile,
    });
  })
  .mapHandle((context, username) =>
    context.host === new URL(context.canonicalOrigin).host
      ? resolveLocalActorIdentifierByHandle(username)
      : null,
  )
  .setKeyPairsDispatcher(async (ctx, identifier) => {
    const localInstance = await resolveConfiguredLocalInstance();
    const result = await ensureDrizzleLocalProfileActor({
      actorUri: ctx.getActorUri(identifier),
      localInstanceId: localInstance.id,
      profileId: identifier,
    });

    return result ? [...result.keyPairs] : [];
  });

export const createFederationContext = async () => {
  const localInstance = await resolveConfiguredLocalInstance();

  if (!localInstance.canonicalOrigin) {
    throw new Error('Configured local instance is missing canonical origin');
  }

  return federation.createContext(new URL(localInstance.canonicalOrigin), undefined);
};

const resolveStoredRemoteActor = async (actorUri: URL): Promise<StoredRemoteActor | null> => {
  const row = await db
    .select({
      actorUri: ActivityPubActors.uri,
      instanceKind: Instances.kind,
      instanceState: Instances.state,
      profileId: Profiles.id,
      profileState: Profiles.state,
    })
    .from(ActivityPubActors)
    .innerJoin(Profiles, eq(Profiles.id, ActivityPubActors.profileId))
    .innerJoin(Instances, eq(Instances.id, Profiles.instanceId))
    .where(eq(ActivityPubActors.uri, actorUri.href))
    .limit(1)
    .then(first);

  if (
    !row ||
    row.instanceKind !== InstanceKind.ACTIVITYPUB ||
    row.profileState !== ProfileState.ACTIVE
  ) {
    return null;
  }

  return {
    actorUri: row.actorUri,
    instanceState: row.instanceState,
    profileId: row.profileId,
  };
};

const resolveRemoteActor = async (ctx: Context<void>, actorUri: URL) => {
  const stored = await resolveStoredRemoteActor(actorUri);

  if (stored) {
    return stored;
  }

  const materialized = await findOrMaterializeRemoteProfileActorByUri({
    actorUri,
    context: ctx,
  });

  return materialized ? resolveStoredRemoteActor(actorUri) : null;
};

const resolveLocalActor = async ({
  actorUri,
  ctx,
  recipient,
}: {
  actorUri: URL;
  ctx: Context<void>;
  recipient: string | null;
}): Promise<StoredLocalActor | null> => {
  const profileId = parseLocalActorUri(new URL(ctx.origin), actorUri);

  if (!profileId || (recipient && recipient !== profileId)) {
    return null;
  }

  const localInstance = await resolveConfiguredLocalInstance();
  const profile = await db
    .select({
      followPolicy: Profiles.followPolicy,
      instanceId: Profiles.instanceId,
      profileId: Profiles.id,
      profileState: Profiles.state,
    })
    .from(Profiles)
    .where(eq(Profiles.id, profileId))
    .limit(1)
    .then(first);

  if (
    !profile ||
    profile.profileState !== ProfileState.ACTIVE ||
    (profile.instanceId !== null && profile.instanceId !== localInstance.id) ||
    ctx.getActorUri(profile.profileId).href !== actorUri.href
  ) {
    return null;
  }

  return {
    actorUri,
    followPolicy: profile.followPolicy,
    profileId: profile.profileId,
  };
};

const findOutboundFollowById = async (followUri: URL) => {
  const profileFollowId = parseOutboundFollowUri(followUri);

  if (!profileFollowId) {
    return null;
  }

  return await db
    .select()
    .from(ProfileFollows)
    .where(eq(ProfileFollows.id, profileFollowId))
    .limit(1)
    .then((rows) => first(rows) ?? null);
};

const findOutboundFollowByPair = async ({
  actorUri,
  objectUri,
}: {
  actorUri: URL;
  objectUri: URL;
}) =>
  db
    .select()
    .from(ProfileFollows)
    .where(
      and(
        eq(ProfileFollows.activityPubFollowActorUri, actorUri.href),
        eq(ProfileFollows.activityPubFollowObjectUri, objectUri.href),
      ),
    )
    .limit(1)
    .then((rows) => first(rows) ?? null);

const resolveOutboundFollowResponseTarget = async ({
  activityActorUri,
  object,
  recipient,
}: {
  activityActorUri: URL;
  object: Follow | URL | null;
  recipient: string | null;
}): Promise<ProfileFollowRow | null> => {
  let profileFollow: ProfileFollowRow | null = null;

  if (object instanceof Follow) {
    const actorUri = object.actorId;
    const objectUri = object.objectId;

    if (!actorUri || !objectUri) {
      return null;
    }

    if (object.id && parseOutboundFollowUri(object.id)) {
      const byId = await findOutboundFollowById(object.id);

      if (
        !byId ||
        byId.activityPubFollowUri !== object.id.href ||
        byId.activityPubFollowActorUri !== actorUri.href ||
        byId.activityPubFollowObjectUri !== objectUri.href
      ) {
        return null;
      }

      profileFollow = byId;
    } else {
      profileFollow = await findOutboundFollowByPair({ actorUri, objectUri });
    }
  } else if (object instanceof URL) {
    const byId = await findOutboundFollowById(object);
    profileFollow = byId?.activityPubFollowUri === object.href ? byId : null;
  }

  if (
    !profileFollow ||
    profileFollow.activityPubFollowObjectUri !== activityActorUri.href ||
    (recipient && recipient !== profileFollow.followerProfileId)
  ) {
    return null;
  }

  const remoteActor = await resolveStoredRemoteActor(activityActorUri);

  return remoteActor?.instanceState === InstanceState.SUSPENDED ? null : profileFollow;
};

const isStale = (receivedAt: Temporal.Instant, currentGenerationAt: Temporal.Instant | null) =>
  !!currentGenerationAt && Temporal.Instant.compare(receivedAt, currentGenerationAt) < 0;

type InboxContext = Parameters<
  Parameters<ReturnType<typeof federation.setInboxListeners>['on']>[1]
>[0];

const handleInboundFollow = async (ctx: InboxContext, follow: Follow) => {
  const actorUri = follow.actorId;
  const objectUri = follow.objectId;

  if (!actorUri || !objectUri) {
    return;
  }

  const localActor = await resolveLocalActor({
    actorUri: objectUri,
    ctx,
    recipient: ctx.recipient,
  });

  if (!localActor) {
    return;
  }

  const remoteActor = await resolveRemoteActor(ctx, actorUri);

  if (!remoteActor || remoteActor.instanceState !== InstanceState.ACTIVE) {
    return;
  }

  const timestamp = activityTimestamp(follow);
  const metadata = {
    activityPubFollowActorUri: actorUri.href,
    activityPubFollowGenerationAt: timestamp,
    activityPubFollowObjectUri: objectUri.href,
    activityPubFollowOrderingKey: createFollowOrderingKey(actorUri, objectUri),
    activityPubFollowUri: follow.id?.href,
  };

  if (localActor.followPolicy === ProfileFollowPolicy.OPEN) {
    await createProfileFollow({
      activityPubMetadata: metadata,
      deletePendingRequest: true,
      followeeProfileId: localActor.profileId,
      followerProfileId: remoteActor.profileId,
    });
    await sendAcceptFollowActivity({
      ctx,
      follow,
      localActorUri: localActor.actorUri,
      localProfileId: localActor.profileId,
      remoteActorUri: actorUri,
    });
    return;
  }

  await db
    .insert(ProfileFollowRequests)
    .values({
      ...metadata,
      followeeProfileId: localActor.profileId,
      followerProfileId: remoteActor.profileId,
    })
    .onConflictDoNothing({
      target: [ProfileFollowRequests.followerProfileId, ProfileFollowRequests.followeeProfileId],
    });
};

const handleInboundUndo = async (ctx: InboxContext, undo: Undo) => {
  const actorUri = undo.actorId;
  const object = await undo.getObject({ suppressError: true });

  if (!actorUri || !(object instanceof Follow)) {
    return;
  }

  const followActorUri = object.actorId;
  const followObjectUri = object.objectId;

  if (!followActorUri || !followObjectUri || followActorUri.href !== actorUri.href) {
    return;
  }

  const localActor = await resolveLocalActor({
    actorUri: followObjectUri,
    ctx,
    recipient: ctx.recipient,
  });
  const remoteActor = await resolveRemoteActor(ctx, actorUri);

  if (!localActor || !remoteActor || remoteActor.instanceState === InstanceState.SUSPENDED) {
    return;
  }

  const receivedAt = activityTimestamp(undo);
  const existingFollow = await db
    .select()
    .from(ProfileFollows)
    .where(
      and(
        eq(ProfileFollows.followerProfileId, remoteActor.profileId),
        eq(ProfileFollows.followeeProfileId, localActor.profileId),
      ),
    )
    .limit(1)
    .then(first);

  if (existingFollow && !isStale(receivedAt, existingFollow.activityPubFollowGenerationAt)) {
    await deleteProfileFollow({
      followeeProfileId: localActor.profileId,
      followerProfileId: remoteActor.profileId,
    });
  }

  const existingRequest = await db
    .select()
    .from(ProfileFollowRequests)
    .where(
      and(
        eq(ProfileFollowRequests.followerProfileId, remoteActor.profileId),
        eq(ProfileFollowRequests.followeeProfileId, localActor.profileId),
      ),
    )
    .limit(1)
    .then(first);

  if (existingRequest && !isStale(receivedAt, existingRequest.activityPubFollowGenerationAt)) {
    await db.delete(ProfileFollowRequests).where(eq(ProfileFollowRequests.id, existingRequest.id));
  }
};

const getFollowResponseObject = async (activity: Accept | Reject) =>
  activity.objectId && parseOutboundFollowUri(activity.objectId)
    ? activity.objectId
    : activity.getObject({ suppressError: true });

const handleInboundAccept = async (ctx: InboxContext, accept: Accept) => {
  const actorUri = accept.actorId;

  if (!actorUri) {
    return;
  }

  const object = await getFollowResponseObject(accept);
  await resolveOutboundFollowResponseTarget({
    activityActorUri: actorUri,
    object: object instanceof Follow || object instanceof URL ? object : null,
    recipient: ctx.recipient,
  });
};

const handleInboundReject = async (ctx: InboxContext, reject: Reject) => {
  const actorUri = reject.actorId;

  if (!actorUri) {
    return;
  }

  const object = await getFollowResponseObject(reject);
  const profileFollow = await resolveOutboundFollowResponseTarget({
    activityActorUri: actorUri,
    object: object instanceof Follow || object instanceof URL ? object : null,
    recipient: ctx.recipient,
  });

  if (
    !profileFollow ||
    isStale(activityTimestamp(reject), profileFollow.activityPubFollowGenerationAt)
  ) {
    return;
  }

  await deleteProfileFollow({
    followeeProfileId: profileFollow.followeeProfileId,
    followerProfileId: profileFollow.followerProfileId,
  });
};

federation
  .setInboxListeners('/ap/actor/{identifier}/inbox', '/inbox')
  .on(Follow, handleInboundFollow)
  .on(Undo, handleInboundUndo)
  .on(Accept, handleInboundAccept)
  .on(Reject, handleInboundReject)
  .withIdempotency('per-inbox');
