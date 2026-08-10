import '@kosmo/core/polyfill';

import { isActor } from '@fedify/vocab';
import { ConflictError } from '@kosmo/core/error';
import { isHttpUri, uniqueHref } from './activitypub-uri';
import {
  observeInboundExternalFailure,
  observeInboundNoop,
  observeInboundRejected,
} from './inbound-observability';
import {
  findStoredRemoteProfileActorByUri,
  materializeRemoteProfileActor,
  RemoteActorMaterializationError,
} from './remote-actor-materialization';
import type { InboxContext } from '@fedify/fedify';
import type { Object as ActivityPubObject, Update } from '@fedify/vocab';
import type { FedifyExecutionContext } from './federation';

const noNetworkDocumentLoader = async (url: string) => {
  throw new Error(`Network lookup is disabled for inbound Update: ${url}`);
};

export const handleInboundUpdate = async (
  _context: InboxContext<FedifyExecutionContext>,
  update: Update,
  receivedAt: Temporal.Instant = Temporal.Now.instant(),
): Promise<void> => {
  const actorHref = uniqueHref(update.actorIds);
  const objectHref = uniqueHref(update.objectIds);
  const actorUri = actorHref ? new URL(actorHref) : null;
  const objectUri = objectHref ? new URL(objectHref) : null;

  if (!isHttpUri(actorUri) || !isHttpUri(objectUri) || actorUri.href !== objectUri.href) {
    observeInboundRejected({
      activityType: 'Update',
      actorOrigin: actorUri?.origin,
      handler: 'update',
      objectOrigin: objectUri?.origin,
      phase: 'validation',
      reasonCode: 'update_actor_object_mismatch',
    });
    return;
  }

  const object = await update.getObject({
    crossOrigin: 'trust',
    documentLoader: noNetworkDocumentLoader,
    suppressError: true,
  });
  if (object === null) {
    observeInboundExternalFailure({
      activityType: 'Update',
      actorOrigin: actorUri?.origin,
      handler: 'update',
      objectOrigin: objectUri?.origin,
      phase: 'object_lookup',
      reasonCode: 'update_object_lookup_failed',
    });
    return;
  }

  if (!isActor(object) || object.id?.href !== actorUri.href) {
    observeInboundRejected({
      activityType: 'Update',
      actorOrigin: actorUri.origin,
      handler: 'update',
      objectOrigin: objectUri.origin,
      phase: 'protocol',
      reasonCode: 'update_object_not_matching_actor',
    });
    return;
  }

  const stored = await findStoredRemoteProfileActorByUri(actorUri);
  if (!stored) {
    observeInboundNoop({
      activityType: 'Update',
      actorOrigin: actorUri.origin,
      handler: 'update',
      objectOrigin: objectUri.origin,
      phase: 'actor_lookup',
      reasonCode: 'remote_actor_missing',
    });
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
      observeInboundExternalFailure({
        activityType: 'Update',
        actorOrigin: actorUri.origin,
        handler: 'update',
        objectOrigin: objectUri.origin,
        phase: 'projection',
        reasonCode: 'remote_actor_projection_rejected',
      });
      return;
    }
    throw error;
  }
};
