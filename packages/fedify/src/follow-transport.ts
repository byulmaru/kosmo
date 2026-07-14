import { Accept, Follow, Undo } from '@fedify/vocab';
import type { Context } from '@fedify/fedify';
import type { Recipient } from '@fedify/vocab';

export type FollowTransportContext = Pick<
  Context<void>,
  'canonicalOrigin' | 'getActorUri' | 'sendActivity'
>;

interface FollowDeliveryOptions {
  readonly context: FollowTransportContext;
  readonly localProfileId: string;
  readonly remoteActor: Recipient;
}

export interface SendOutboundFollowActivityOptions extends FollowDeliveryOptions {
  readonly profileFollowId: string;
}

export interface SendOutboundUndoFollowActivityOptions extends FollowDeliveryOptions {
  readonly originalFollow: Follow;
}

export interface SendAcceptFollowActivityOptions extends FollowDeliveryOptions {
  readonly receivedFollow: Follow;
}

export const getOutboundFollowActivityUri = (
  canonicalOrigin: string,
  profileFollowId: string,
): URL => new URL(`/ap/follow/${encodeURIComponent(profileFollowId)}`, canonicalOrigin);

export const getFollowOrderingKey = (followerActorUri: URL, followeeActorUri: URL): string =>
  `profile-follow:${followerActorUri.href}\n${followeeActorUri.href}`;

export const sendOutboundFollowActivity = async ({
  context,
  localProfileId,
  profileFollowId,
  remoteActor,
}: SendOutboundFollowActivityOptions): Promise<Follow> => {
  const actor = context.getActorUri(localProfileId);
  const object = requireRecipientId(remoteActor);
  const activity = new Follow({
    actor,
    id: getOutboundFollowActivityUri(context.canonicalOrigin, profileFollowId),
    object,
    tos: [object],
  });

  await context.sendActivity({ identifier: localProfileId }, remoteActor, activity, {
    orderingKey: getFollowOrderingKey(actor, object),
  });

  return activity;
};

export const sendOutboundUndoFollowActivity = async ({
  context,
  localProfileId,
  originalFollow,
  remoteActor,
}: SendOutboundUndoFollowActivityOptions): Promise<Undo> => {
  const actor = context.getActorUri(localProfileId);
  const recipientId = requireRecipientId(remoteActor);
  const activity = new Undo({
    actor,
    object: originalFollow,
    tos: [recipientId],
  });

  await context.sendActivity({ identifier: localProfileId }, remoteActor, activity, {
    orderingKey: getFollowOrderingKey(actor, recipientId),
  });

  return activity;
};

export const sendAcceptFollowActivity = async ({
  context,
  localProfileId,
  receivedFollow,
  remoteActor,
}: SendAcceptFollowActivityOptions): Promise<Accept> => {
  const recipientId = requireRecipientId(remoteActor);
  const activity = new Accept({
    actor: context.getActorUri(localProfileId),
    object: receivedFollow,
    tos: [recipientId],
  });

  await context.sendActivity({ identifier: localProfileId }, remoteActor, activity);

  return activity;
};

const requireRecipientId = (recipient: Recipient): URL => {
  if (recipient.id == null) {
    throw new TypeError('ActivityPub follow recipient must have an actor id.');
  }

  return recipient.id;
};
