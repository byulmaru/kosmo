import { Follow, Undo } from '@fedify/vocab';
import { resolveConfiguredLocalInstance } from '@kosmo/core/local-instance';
import { federation } from './federation';
import {
  getFollowActivityUri,
  getFollowOrderingKey,
  sendAcceptFollowActivity,
} from './follow-delivery';
import type { Context } from '@fedify/fedify';
import type { Recipient } from '@fedify/vocab';
import type { ProfileFollowInboundFollow } from '@kosmo/core/services';

type RemoteProfileFollowActor = {
  inboxUri: string | null;
  sharedInboxUri: string | null;
  uri: string;
};

type ProfileFollowDeliveryOptions<OutboundFollow> = {
  actor: RemoteProfileFollowActor;
  outboundFollow: OutboundFollow;
  senderProfileId: string;
};

type ProfileFollowAcceptDeliveryOptions = {
  actor: RemoteProfileFollowActor;
  inboundFollow?: ProfileFollowInboundFollow;
  senderProfileId: string;
};

type ProfileFollowRecipient = Recipient & {
  id: URL;
  inboxId: URL;
};

const createFederationContext = async (): Promise<Context<void>> =>
  federation.createContext(
    new URL((await resolveConfiguredLocalInstance()).canonicalOrigin),
    undefined,
  );

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
}: ProfileFollowDeliveryOptions<{ createdAt: Temporal.Instant; id: string }>): Promise<void> => {
  const recipientActor = toProfileFollowRecipient(actor);
  const context = await createFederationContext();
  const actorUri = context.getActorUri(senderProfileId);
  await context.sendActivity(
    { identifier: senderProfileId },
    recipientActor,
    new Follow({
      actor: actorUri,
      id: getFollowActivityUri(context.canonicalOrigin, outboundFollow.id),
      object: recipientActor.id,
      published: outboundFollow.createdAt,
      tos: [recipientActor.id],
    }),
    { orderingKey: getFollowOrderingKey(actorUri, recipientActor.id) },
  );
};

export const sendProfileFollowAccept = async ({
  actor,
  inboundFollow,
  senderProfileId,
}: ProfileFollowAcceptDeliveryOptions): Promise<void> => {
  const recipientActor = toProfileFollowRecipient(actor);
  const context = await createFederationContext();
  const receivedFollow =
    inboundFollow === undefined
      ? new Follow({ actor: recipientActor.id, object: context.getActorUri(senderProfileId) })
      : new Follow({
          actor: new URL(inboundFollow.actorUri),
          object: new URL(inboundFollow.objectUri),
          ...(inboundFollow.activityUri === undefined
            ? {}
            : { id: new URL(inboundFollow.activityUri) }),
          ...(inboundFollow.published === undefined
            ? {}
            : { published: Temporal.Instant.from(inboundFollow.published) }),
        });
  await sendAcceptFollowActivity({
    context,
    recipientActor,
    receivedFollow,
    senderProfileId,
  });
};

export const sendProfileUnfollow = async ({
  actor,
  outboundFollow,
  senderProfileId,
}: ProfileFollowDeliveryOptions<{ id: string }>): Promise<void> => {
  const recipientActor = toProfileFollowRecipient(actor);
  const context = await createFederationContext();
  const actorUri = context.getActorUri(senderProfileId);
  await context.sendActivity(
    { identifier: senderProfileId },
    recipientActor,
    new Undo({
      actor: actorUri,
      object: new Follow({
        actor: actorUri,
        id: getFollowActivityUri(context.canonicalOrigin, outboundFollow.id),
        object: recipientActor.id,
      }),
      tos: [recipientActor.id],
    }),
    { orderingKey: getFollowOrderingKey(actorUri, recipientActor.id) },
  );
};
