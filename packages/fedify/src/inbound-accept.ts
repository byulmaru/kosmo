import '@kosmo/core/polyfill';

import { Follow } from '@fedify/vocab';
import { ConflictError, NotFoundError } from '@kosmo/core/error';
import { isHttpUri } from './activitypub-uri';
import { handleInboundAcceptFollow } from './inbound-accept-follow';
import { observeInbound } from './inbound-observability';
import {
  findOrMaterializeRemoteProfileActorByUri,
  RemoteActorMaterializationError,
} from './remote-actor-materialization';
import type { InboxContext } from '@fedify/fedify';
import type { Accept } from '@fedify/vocab';

export const handleInboundAccept = async (
  context: InboxContext<void>,
  accept: Accept,
  receivedAt: Temporal.Instant = Temporal.Now.instant(),
): Promise<void> => {
  const actorUri = accept.actorId;
  if (!isHttpUri(actorUri)) {
    observeInbound({
      outcome: 'rejected',
      activityType: 'Accept',
      handler: 'accept',
      phase: 'validation',
      reasonCode: 'invalid_actor_identity',
    });
    return;
  }

  let remoteActor: Awaited<ReturnType<typeof findOrMaterializeRemoteProfileActorByUri>>;
  try {
    remoteActor = await findOrMaterializeRemoteProfileActorByUri({
      actorUri,
      contextOrigin: context.canonicalOrigin,
      receipt: { activityUri: accept.id, receivedAt },
    });
  } catch (error) {
    if (error instanceof NotFoundError) {
      observeInbound({
        outcome: 'noop',
        activityType: 'Accept',
        actorOrigin: actorUri.origin,
        error,
        handler: 'accept',
        phase: 'actor_lookup',
        reasonCode: 'remote_actor_not_found',
      });
      return;
    }
    if (error instanceof RemoteActorMaterializationError || error instanceof ConflictError) {
      observeInbound({
        outcome: 'external_failure',
        activityType: 'Accept',
        actorOrigin: actorUri.origin,
        error,
        handler: 'accept',
        objectOrigin: accept.objectId?.origin,
        phase: 'actor_lookup',
        reasonCode: 'remote_actor_lookup_rejected',
      });
      return;
    }
    throw error;
  }
  const object = await accept.getObject({
    documentLoader: context.documentLoader,
    suppressError: true,
  });
  if (object === null) {
    observeInbound({
      outcome: 'external_failure',
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
    observeInbound({
      outcome: 'external_failure',
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
