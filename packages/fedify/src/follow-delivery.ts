import { Accept } from '@fedify/vocab';
import type { Context } from '@fedify/fedify';
import type { Follow, Recipient } from '@fedify/vocab';

type FollowDeliveryContext = Pick<
  Context<void>,
  'canonicalOrigin' | 'getActorUri' | 'sendActivity'
>;

interface FollowDeliveryOptions {
  readonly context: FollowDeliveryContext;
  readonly recipientActor: Recipient;
  readonly senderProfileId: string;
}

export interface SendAcceptFollowActivityOptions extends FollowDeliveryOptions {
  readonly receivedFollow: Follow;
}

export const getFollowActivityUri = (canonicalOrigin: string, profileFollowId: string): URL =>
  new URL(`/ap/follow/${encodeURIComponent(profileFollowId)}`, canonicalOrigin);

export const isCompatibleOutboundFollowActivityId = (
  canonicalOrigin: string,
  followId: URL | null,
  profileFollowId: string,
): boolean => {
  if (!followId) {
    return true;
  }

  const origin = new URL(canonicalOrigin);
  return (
    followId.origin !== origin.origin ||
    !followId.pathname.startsWith('/ap/follow/') ||
    followId.href === getFollowActivityUri(canonicalOrigin, profileFollowId).href
  );
};

export const getFollowOrderingKey = (followerActorUri: URL, followeeActorUri: URL): string =>
  `profile-follow:${followerActorUri.href}\n${followeeActorUri.href}`;

export const sendAcceptFollowActivity = async ({
  context,
  recipientActor,
  receivedFollow,
  senderProfileId,
}: SendAcceptFollowActivityOptions): Promise<Accept> => {
  const actor = context.getActorUri(senderProfileId);
  const recipientId = requireDeliveryRecipientId(recipientActor);
  requireFollowEndpoints(receivedFollow, recipientId, actor);
  const activity = new Accept({
    actor,
    object: receivedFollow,
    tos: [recipientId],
  });

  await context.sendActivity({ identifier: senderProfileId }, recipientActor, activity);

  return activity;
};

const requireDeliveryRecipientId = (recipient: Recipient): URL => {
  if (recipient.id == null) {
    throw new TypeError('ActivityPub follow recipient must have an actor id.');
  }

  if (recipient.inboxId == null) {
    throw new TypeError('ActivityPub follow recipient must have an inbox.');
  }

  return recipient.id;
};

const requireFollowEndpoints = (follow: Follow, actor: URL, object: URL): void => {
  if (follow.actorId?.href !== actor.href || follow.objectId?.href !== object.href) {
    throw new TypeError('ActivityPub Follow actor and object must match the delivery endpoints.');
  }
};
