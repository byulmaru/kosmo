import '@kosmo/core/polyfill';

import { isActor } from '@fedify/vocab';
import { ConflictError } from '@kosmo/core/error';
import { isHttpUri, uniqueHref } from './activitypub-uri';
import {
  findStoredRemoteProfileActorByUri,
  materializeRemoteProfileActor,
  RemoteActorMaterializationError,
} from './remote-actor-materialization';
import type { InboxContext } from '@fedify/fedify';
import type { Object as ActivityPubObject, Update } from '@fedify/vocab';

const noNetworkDocumentLoader = async (url: string) => {
  throw new Error(`Network lookup is disabled for inbound Update: ${url}`);
};

export const handleInboundUpdate = async (
  _context: InboxContext<void>,
  update: Update,
  receivedAt: Temporal.Instant = Temporal.Now.instant(),
): Promise<void> => {
  const actorHref = uniqueHref(update.actorIds);
  const objectHref = uniqueHref(update.objectIds);
  const actorUri = actorHref ? new URL(actorHref) : null;
  const objectUri = objectHref ? new URL(objectHref) : null;

  if (!isHttpUri(actorUri) || !isHttpUri(objectUri) || actorUri.href !== objectUri.href) {
    return;
  }

  const object = await update.getObject({
    crossOrigin: 'trust',
    documentLoader: noNetworkDocumentLoader,
    suppressError: true,
  });

  if (!isActor(object) || object.id?.href !== actorUri.href) {
    return;
  }

  const stored = await findStoredRemoteProfileActorByUri(actorUri);
  if (!stored) {
    return;
  }

  try {
    await materializeRemoteProfileActor({
      context: {
        lookupObject: async (): Promise<ActivityPubObject> => object,
      },
      handle: `${stored.profile.handle}@${stored.instance.domain}`,
      now: receivedAt,
      reactivateUnresponsive: true,
    });
  } catch (error) {
    if (error instanceof ConflictError || error instanceof RemoteActorMaterializationError) {
      return;
    }
    throw error;
  }
};
