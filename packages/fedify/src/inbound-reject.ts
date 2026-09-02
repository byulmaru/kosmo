import '@kosmo/core/polyfill';

import { Follow } from '@fedify/vocab';
import { NotFoundError } from '@kosmo/core/error';
import { isHttpUri } from './activitypub-uri';
import { observeInbound } from './inbound-observability';
import { handleInboundRejectFollow } from './inbound-reject-follow';
import { findUsableStoredRemoteProfileActorByUri } from './remote-actor-materialization';
import type { InboxContext } from '@fedify/fedify';
import type { Reject } from '@fedify/vocab';

export const handleInboundReject = async (
  context: InboxContext<void>,
  reject: Reject,
): Promise<void> => {
  const actorUri = reject.actorId;
  if (!isHttpUri(actorUri)) {
    observeInbound({
      outcome: 'rejected',
      activityType: 'Reject',
      handler: 'reject',
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
      observeInbound({
        outcome: 'noop',
        activityType: 'Reject',
        actorOrigin: actorUri.origin,
        error,
        handler: 'reject',
        phase: 'actor_lookup',
        reasonCode: 'remote_actor_not_found',
      });
      return;
    }
    throw error;
  }
  if (!remoteActor) {
    observeInbound({
      outcome: 'noop',
      activityType: 'Reject',
      actorOrigin: actorUri.origin,
      handler: 'reject',
      phase: 'actor_lookup',
      reasonCode: 'remote_actor_missing',
    });
    return;
  }

  const object = await reject.getObject({
    documentLoader: context.documentLoader,
    suppressError: true,
  });
  if (object === null) {
    observeInbound({
      outcome: 'external_failure',
      activityType: 'Reject',
      actorOrigin: actorUri.origin,
      handler: 'reject',
      phase: 'object_lookup',
      reasonCode: 'reject_object_lookup_failed',
    });
    return;
  }
  if (object instanceof Follow) {
    await handleInboundRejectFollow({
      context,
      follow: object,
      followeeActorUri: actorUri,
      followeeProfileId: remoteActor.profile.id,
    });
  } else {
    observeInbound({
      outcome: 'external_failure',
      activityType: 'Reject',
      actorOrigin: actorUri.origin,
      handler: 'reject',
      objectOrigin: reject.objectId?.origin,
      phase: 'protocol',
      reasonCode: 'reject_object_not_follow',
      message: 'Inbound ActivityPub Reject object could not be resolved as Follow',
    });
  }
};
