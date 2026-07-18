import { Follow } from '@fedify/vocab';
import { resolveConfiguredLocalInstance } from '@kosmo/core/local-instance';
import { federation } from './federation';
import {
  getFollowActivityUri,
  sendFollowActivity,
  sendUndoFollowActivity,
} from './follow-delivery';
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

const createFederationContext = async (): Promise<Context<void>> => {
  const localInstance = await resolveConfiguredLocalInstance();
  return federation.createContext(new URL(localInstance.canonicalOrigin), undefined);
};

export const toProfileFollowRecipient = (actor: RemoteProfileFollowActor): Recipient => {
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
  await sendFollowActivity({
    context,
    profileFollowCreatedAt: outboundFollow.createdAt,
    profileFollowId: outboundFollow.id,
    recipientActor,
    senderProfileId,
  });
};

export const sendProfileUnfollow = async ({
  actor,
  outboundFollow,
  senderProfileId,
}: ProfileFollowDeliveryOptions): Promise<void> => {
  const recipientActor = toProfileFollowRecipient(actor);
  const context = await createFederationContext();
  const originalFollow = new Follow({
    actor: context.getActorUri(senderProfileId),
    id: getFollowActivityUri(context.canonicalOrigin, outboundFollow.id),
    object: new URL(actor.uri),
    published: outboundFollow.createdAt,
  });

  await sendUndoFollowActivity({
    context,
    originalFollow,
    recipientActor,
    senderProfileId,
  });
};
