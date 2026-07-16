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
import type { ProfileFollowDelivery, RemoteProfileFollowActor } from '@kosmo/core/services';

type CreateContext = () => Promise<Context<void>>;

const createFederationContext: CreateContext = async () => {
  const localInstance = await resolveConfiguredLocalInstance();
  return federation.createContext(new URL(localInstance.canonicalOrigin), undefined);
};

const toRecipient = (actor: RemoteProfileFollowActor): Recipient => {
  if (!actor.inboxUri) {
    throw new TypeError('ActivityPub follow recipient must have an inbox.');
  }

  return {
    endpoints: actor.sharedInboxUri ? { sharedInbox: new URL(actor.sharedInboxUri) } : null,
    id: new URL(actor.uri),
    inboxId: new URL(actor.inboxUri),
  };
};

export const createProfileFollowDelivery = (
  createContext: CreateContext = createFederationContext,
): ProfileFollowDelivery => ({
  sendFollow: async ({ actor, profileFollow, senderProfileId }) => {
    const recipientActor = toRecipient(actor);
    const context = await createContext();
    await sendFollowActivity({
      context,
      profileFollowCreatedAt: profileFollow.createdAt,
      profileFollowId: profileFollow.id,
      recipientActor,
      senderProfileId,
    });
  },
  sendUndo: async ({ actor, profileFollow, senderProfileId }) => {
    const recipientActor = toRecipient(actor);
    const context = await createContext();
    const originalFollow = new Follow({
      actor: context.getActorUri(senderProfileId),
      id: getFollowActivityUri(context.canonicalOrigin, profileFollow.id),
      object: new URL(actor.uri),
      published: profileFollow.createdAt,
    });

    await sendUndoFollowActivity({
      context,
      originalFollow,
      recipientActor,
      senderProfileId,
    });
  },
});

export const profileFollowDelivery = createProfileFollowDelivery();
