import { Follow } from '@fedify/vocab';
import { NotFoundError } from '@kosmo/core/error';
import { isHttpUri } from './activitypub-uri';
import { handleInboundAcceptFollow } from './inbound-accept-follow';
import {
  observeInboundExternalFailure,
  observeInboundNoop,
  observeInboundRejected,
} from './inbound-observability';
import { findUsableStoredRemoteProfileActorByUri } from './remote-actor-materialization';
import type { InboxContext } from '@fedify/fedify';
import type { Accept } from '@fedify/vocab';
import type { FedifyContextData } from './fedify-context';

export const handleInboundAccept = async (
  context: InboxContext<FedifyContextData>,
  accept: Accept,
): Promise<void> => {
  const actorUri = accept.actorId;
  if (!isHttpUri(actorUri)) {
    observeInboundRejected({
      activityType: 'Accept',
      handler: 'accept',
      phase: 'validation',
      reasonCode: 'invalid_actor_identity',
    });
    return;
  }

  let remoteActor: Awaited<ReturnType<typeof findUsableStoredRemoteProfileActorByUri>>;
  try {
    remoteActor = await findUsableStoredRemoteProfileActorByUri(actorUri);
  } catch (error) {
    if (error instanceof NotFoundError) {
      observeInboundNoop({
        activityType: 'Accept',
        actorOrigin: actorUri.origin,
        error,
        handler: 'accept',
        phase: 'actor_lookup',
        reasonCode: 'remote_actor_not_found',
      });
      return;
    }
    throw error;
  }
  if (!remoteActor) {
    observeInboundNoop({
      activityType: 'Accept',
      actorOrigin: actorUri.origin,
      handler: 'accept',
      phase: 'actor_lookup',
      reasonCode: 'remote_actor_missing',
    });
    return;
  }

  const object = await accept.getObject({
    documentLoader: context.documentLoader,
    suppressError: true,
  });
  if (object === null) {
    observeInboundExternalFailure({
      activityType: 'Accept',
      actorOrigin: actorUri.origin,
      handler: 'accept',
      phase: 'object_lookup',
      reasonCode: 'accept_object_lookup_failed',
    });
    return;
  }
  if (object instanceof Follow) {
    await handleInboundAcceptFollow({
      context,
      follow: object,
      followeeActorUri: actorUri,
      followeeProfileId: remoteActor.profile.id,
    });
  } else {
    observeInboundExternalFailure({
      activityType: 'Accept',
      actorOrigin: actorUri.origin,
      handler: 'accept',
      objectOrigin: accept.objectId?.origin,
      phase: 'protocol',
      reasonCode: 'accept_object_not_follow',
      message: 'Inbound ActivityPub Accept object could not be resolved as Follow',
    });
  }
};
