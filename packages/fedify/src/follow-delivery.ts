import { Accept, Follow, Undo } from '@fedify/vocab';
import type { Context } from '@fedify/fedify';
import type { Recipient } from '@fedify/vocab';

export type FollowDeliveryContext = Pick<
  Context<void>,
  'canonicalOrigin' | 'getActorUri' | 'sendActivity'
>;

interface FollowDeliveryOptions {
  readonly context: FollowDeliveryContext;
  readonly recipientActor: Recipient;
  readonly senderProfileId: string;
}

export interface SendFollowActivityOptions extends FollowDeliveryOptions {
  readonly profileFollowId: string;
}

export interface SendUndoFollowActivityOptions extends FollowDeliveryOptions {
  readonly originalFollow: Follow;
}

export interface SendAcceptFollowActivityOptions extends FollowDeliveryOptions {
  readonly receivedFollow: Follow;
}

export const getFollowActivityUri = (canonicalOrigin: string, profileFollowId: string): URL =>
  new URL(`/ap/follow/${encodeURIComponent(profileFollowId)}`, canonicalOrigin);

export const getFollowOrderingKey = (followerActorUri: URL, followeeActorUri: URL): string =>
  `profile-follow:${followerActorUri.href}\n${followeeActorUri.href}`;

export const sendFollowActivity = async ({
  context,
  profileFollowId,
  recipientActor,
  senderProfileId,
}: SendFollowActivityOptions): Promise<Follow> => {
  const actor = context.getActorUri(senderProfileId);
  const object = requireRecipientId(recipientActor);
  const activity = new Follow({
    actor,
    id: getFollowActivityUri(context.canonicalOrigin, profileFollowId),
    object,
    tos: [object],
  });

  await context.sendActivity({ identifier: senderProfileId }, recipientActor, activity, {
    orderingKey: getFollowOrderingKey(actor, object),
  });

  return activity;
};

export const sendUndoFollowActivity = async ({
  context,
  originalFollow,
  recipientActor,
  senderProfileId,
}: SendUndoFollowActivityOptions): Promise<Undo> => {
  const actor = context.getActorUri(senderProfileId);
  const recipientId = requireRecipientId(recipientActor);
  requireFollowEndpoints(originalFollow, actor, recipientId);
  const activity = new Undo({
    actor,
    object: originalFollow,
    tos: [recipientId],
  });

  await context.sendActivity({ identifier: senderProfileId }, recipientActor, activity, {
    orderingKey: getFollowOrderingKey(actor, recipientId),
  });

  return activity;
};

export const sendAcceptFollowActivity = async ({
  context,
  recipientActor,
  receivedFollow,
  senderProfileId,
}: SendAcceptFollowActivityOptions): Promise<Accept> => {
  const actor = context.getActorUri(senderProfileId);
  const recipientId = requireRecipientId(recipientActor);
  requireFollowEndpoints(receivedFollow, recipientId, actor);
  const activity = new Accept({
    actor,
    object: receivedFollow,
    tos: [recipientId],
  });

  await context.sendActivity({ identifier: senderProfileId }, recipientActor, activity);

  return activity;
};

const requireRecipientId = (recipient: Recipient): URL => {
  if (recipient.id == null) {
    throw new TypeError('ActivityPub follow recipient must have an actor id.');
  }

  return recipient.id;
};

const requireFollowEndpoints = (follow: Follow, actor: URL, object: URL): void => {
  if (follow.actorId?.href !== actor.href || follow.objectId?.href !== object.href) {
    throw new TypeError('ActivityPub Follow actor and object must match the delivery endpoints.');
  }
};
