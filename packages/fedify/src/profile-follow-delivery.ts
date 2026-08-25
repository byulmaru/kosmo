import { Follow, Undo } from '@fedify/vocab';
import { resolveConfiguredLocalInstance } from '@kosmo/core/local-instance';
import { federation } from './federation';
import { getFollowActivityUri, getFollowOrderingKey } from './follow-delivery';
import type { Context } from '@fedify/fedify';
import type { Recipient } from '@fedify/vocab';

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
