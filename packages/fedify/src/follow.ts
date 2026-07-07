import '@kosmo/core/polyfill';

import { Accept, Follow, isActor, Undo } from '@fedify/vocab';
import type { Context } from '@fedify/fedify';
import type { Recipient } from '@fedify/vocab';
import type { ProfileFollowRow } from '@kosmo/core/profile-follow';

const actorPathPrefix = '/ap/actor/';
const followPathPrefix = '/ap/follows/';

export const getLocalActorUri = (localOrigin: URL, profileId: string) =>
  new URL(`${actorPathPrefix}${profileId}`, localOrigin);

export const parseLocalActorUri = (localOrigin: URL, actorUri: URL) => {
  if (actorUri.origin !== localOrigin.origin || !actorUri.pathname.startsWith(actorPathPrefix)) {
    return null;
  }

  const profileId = actorUri.pathname.slice(actorPathPrefix.length);

  return profileId && !profileId.includes('/') ? profileId : null;
};

export const createOutboundFollowUri = (localOrigin: URL, profileFollowId: string) =>
  new URL(`${followPathPrefix}${profileFollowId}`, localOrigin);

export const parseOutboundFollowUri = (followUri: URL) => {
  if (!followUri.pathname.startsWith(followPathPrefix)) {
    return null;
  }

  const profileFollowId = followUri.pathname.slice(followPathPrefix.length);

  return profileFollowId && !profileFollowId.includes('/') ? profileFollowId : null;
};

export const createFollowOrderingKey = (actorUri: URL, objectUri: URL) =>
  `profile-follow:${actorUri.href}->${objectUri.href}`;

export const createOutboundFollowMetadata = ({
  localOrigin,
  localFollowerProfileId,
  profileFollowId,
  remoteFolloweeActorUri,
}: {
  localOrigin: URL;
  localFollowerProfileId: string;
  profileFollowId: string;
  remoteFolloweeActorUri: string;
}) => {
  const actorUri = getLocalActorUri(localOrigin, localFollowerProfileId);
  const objectUri = new URL(remoteFolloweeActorUri);

  return {
    activityPubFollowActorUri: actorUri.href,
    activityPubFollowGenerationAt: Temporal.Now.instant(),
    activityPubFollowObjectUri: objectUri.href,
    activityPubFollowOrderingKey: createFollowOrderingKey(actorUri, objectUri),
    activityPubFollowUri: createOutboundFollowUri(localOrigin, profileFollowId).href,
  };
};

const lookupRecipient = async (ctx: Context<void>, actorUri: URL): Promise<Recipient> => {
  const recipient = await ctx.lookupObject(actorUri);

  if (!isActor(recipient)) {
    throw new Error(`ActivityPub actor not found: ${actorUri.href}`);
  }

  return recipient;
};

export const sendOutboundFollowActivity = async (
  ctx: Context<void>,
  profileFollow: ProfileFollowRow,
) => {
  if (
    !profileFollow.activityPubFollowActorUri ||
    !profileFollow.activityPubFollowObjectUri ||
    !profileFollow.activityPubFollowOrderingKey ||
    !profileFollow.activityPubFollowUri
  ) {
    throw new Error('ProfileFollow is missing outbound Follow metadata');
  }

  const actorUri = new URL(profileFollow.activityPubFollowActorUri);
  const objectUri = new URL(profileFollow.activityPubFollowObjectUri);
  const recipient = await lookupRecipient(ctx, objectUri);
  const activity = new Follow({
    actor: actorUri,
    id: new URL(profileFollow.activityPubFollowUri),
    object: objectUri,
  });

  await ctx.sendActivity({ identifier: profileFollow.followerProfileId }, recipient, activity, {
    orderingKey: profileFollow.activityPubFollowOrderingKey,
  });
};

export const sendOutboundUndoFollowActivity = async (
  ctx: Context<void>,
  profileFollow: ProfileFollowRow,
) => {
  if (
    !profileFollow.activityPubFollowActorUri ||
    !profileFollow.activityPubFollowObjectUri ||
    !profileFollow.activityPubFollowOrderingKey ||
    !profileFollow.activityPubFollowUri
  ) {
    return;
  }

  const actorUri = new URL(profileFollow.activityPubFollowActorUri);
  const objectUri = new URL(profileFollow.activityPubFollowObjectUri);
  const recipient = await lookupRecipient(ctx, objectUri);
  const follow = new Follow({
    actor: actorUri,
    id: new URL(profileFollow.activityPubFollowUri),
    object: objectUri,
  });
  const undo = new Undo({
    actor: actorUri,
    object: follow,
  });

  await ctx.sendActivity({ identifier: profileFollow.followerProfileId }, recipient, undo, {
    orderingKey: profileFollow.activityPubFollowOrderingKey,
  });
};

export const sendAcceptFollowActivity = async ({
  ctx,
  follow,
  localActorUri,
  localProfileId,
  remoteActorUri,
}: {
  ctx: Context<void>;
  follow: Follow;
  localActorUri: URL;
  localProfileId: string;
  remoteActorUri: URL;
}) => {
  const recipient = await lookupRecipient(ctx, remoteActorUri);
  const accept = new Accept({
    actor: localActorUri,
    object: follow,
  });

  await ctx.sendActivity({ identifier: localProfileId }, recipient, accept, {
    orderingKey: createFollowOrderingKey(remoteActorUri, localActorUri),
  });
};
