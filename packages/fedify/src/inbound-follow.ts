import '@kosmo/core/polyfill';

import { Follow } from '@fedify/vocab';
import { InstanceState } from '@kosmo/core/enums';
import { ConflictError, NotFoundError } from '@kosmo/core/error';
import { followProfile, unfollowProfile } from '@kosmo/core/services';
import { isHttpUri } from './activitypub-uri';
import { sendAcceptFollowActivity } from './follow-delivery';
import { resolveInboundLocalRecipient } from './inbound-local-recipient';
import {
  findOrMaterializeRemoteProfileActorByUri,
  findUsableStoredRemoteProfileActorByUri,
  RemoteActorMaterializationError,
} from './remote-actor-materialization';
import type { InboxContext } from '@fedify/fedify';
import type { Recipient, Undo } from '@fedify/vocab';
import type { ActivityPubActors } from '@kosmo/core/db';

const getNow = () => Temporal.Now.instant();

const isExpectedRemoteActorRejection = (error: unknown) =>
  error instanceof RemoteActorMaterializationError ||
  error instanceof NotFoundError ||
  error instanceof ConflictError;

const toRecipient = (actor: typeof ActivityPubActors.$inferSelect): Recipient | undefined => {
  if (!actor.inboxUri) {
    return undefined;
  }

  return {
    endpoints: actor.sharedInboxUri ? { sharedInbox: new URL(actor.sharedInboxUri) } : null,
    id: new URL(actor.uri),
    inboxId: new URL(actor.inboxUri),
  };
};

export const handleInboundFollow = async (
  context: InboxContext<void>,
  follow: Follow,
  now: Temporal.Instant = getNow(),
): Promise<void> => {
  const actorUri = follow.actorId;
  const objectUri = follow.objectId;

  if (!isHttpUri(actorUri) || !isHttpUri(objectUri)) {
    return;
  }

  // Local validation intentionally precedes every remote lookup.
  const localRecipient = await resolveInboundLocalRecipient(context, objectUri);
  if (!localRecipient) {
    return;
  }

  let remoteActor: Awaited<ReturnType<typeof findOrMaterializeRemoteProfileActorByUri>>;

  try {
    remoteActor = await findOrMaterializeRemoteProfileActorByUri({ actorUri, context, now });
  } catch (error) {
    if (isExpectedRemoteActorRejection(error)) {
      return;
    }

    throw error;
  }

  const result = await followProfile({
    followeeProfileId: localRecipient.id,
    followerProfileId: remoteActor.profile.id,
  });

  if (result.result.kind !== 'ESTABLISHED') {
    return;
  }

  const recipientActor = toRecipient(remoteActor.actor);
  if (!recipientActor) {
    return;
  }

  try {
    await sendAcceptFollowActivity({
      context,
      receivedFollow: follow,
      recipientActor,
      senderProfileId: localRecipient.id,
    });
  } catch {
    // The projection is authoritative; delivery retries belong to a separate slice.
  }
};

const noNetworkDocumentLoader = async (url: string) => {
  throw new Error(`Network lookup is disabled for inbound Undo: ${url}`);
};

export const handleInboundUndo = async (context: InboxContext<void>, undo: Undo): Promise<void> => {
  const actorUri = undo.actorId;
  if (!isHttpUri(actorUri)) {
    return;
  }

  // Undo never materializes or dereferences an unknown actor.
  let remoteActor: Awaited<ReturnType<typeof findUsableStoredRemoteProfileActorByUri>>;

  try {
    remoteActor = await findUsableStoredRemoteProfileActorByUri(actorUri);
  } catch (error) {
    if (isExpectedRemoteActorRejection(error)) {
      return;
    }

    throw error;
  }

  if (!remoteActor || remoteActor.instance.state !== InstanceState.ACTIVE) {
    return;
  }

  const embedded = await undo.getObject({
    documentLoader: noNetworkDocumentLoader,
    suppressError: true,
  });
  if (!(embedded instanceof Follow)) {
    return;
  }

  const objectUri = embedded.objectId;
  if (!isHttpUri(objectUri) || embedded.actorId?.href !== actorUri.href) {
    return;
  }

  const localRecipient = await resolveInboundLocalRecipient(context, objectUri);
  if (!localRecipient) {
    return;
  }

  await unfollowProfile({
    followeeProfileId: localRecipient.id,
    followerProfileId: remoteActor.profile.id,
  });
};
