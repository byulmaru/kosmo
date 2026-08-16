import '@kosmo/core/polyfill';

import { isUniqueViolation } from '@kosmo/core/db';
import { InstanceState } from '@kosmo/core/enums';
import { NotFoundError, PermissionDeniedError, ValidationError } from '@kosmo/core/error';
import { materializeActivityPubRepost } from '@kosmo/core/services';
import { findPostByActivityPubUri } from './activitypub-post-uri';
import { isHttpUri, uniqueHref } from './activitypub-uri';
import { observeInboundNoop, observeInboundRejected } from './inbound-observability';
import { findStoredRemoteProfileActorByUri } from './remote-actor-materialization';
import type { InboxContext } from '@fedify/fedify';
import type { Announce } from '@fedify/vocab';

const isExpectedRepostRejection = (error: unknown): boolean =>
  error instanceof NotFoundError ||
  error instanceof PermissionDeniedError ||
  error instanceof ValidationError ||
  Boolean(isUniqueViolation(error));

export const handleInboundAnnounce = async (
  context: InboxContext<void>,
  announce: Announce,
  receivedAt: Temporal.Instant = Temporal.Now.instant(),
): Promise<void> => {
  const activityUri = announce.id;
  const actorHref = uniqueHref(announce.actorIds);
  const objectHref = uniqueHref(announce.objectIds);

  if (!isHttpUri(activityUri) || !actorHref || !objectHref) {
    observeInboundRejected({
      activityType: 'Announce',
      handler: 'announce',
      phase: 'validation',
      reasonCode: 'invalid_announce_identity',
    });
    return;
  }

  const actorUri = new URL(actorHref);
  const objectUri = new URL(objectHref);
  if (!isHttpUri(actorUri) || !isHttpUri(objectUri) || activityUri.origin !== actorUri.origin) {
    observeInboundRejected({
      activityType: 'Announce',
      actorOrigin: actorUri.origin,
      handler: 'announce',
      objectOrigin: objectUri.origin,
      phase: 'validation',
      reasonCode: 'announce_origin_mismatch',
    });
    return;
  }

  const storedActor = await findStoredRemoteProfileActorByUri(actorUri);
  if (
    !storedActor ||
    (storedActor.instance.state !== InstanceState.ACTIVE &&
      storedActor.instance.state !== InstanceState.UNRESPONSIVE)
  ) {
    observeInboundNoop({
      activityType: 'Announce',
      actorOrigin: actorUri.origin,
      handler: 'announce',
      objectOrigin: objectUri.origin,
      phase: 'actor_lookup',
      reasonCode: 'remote_actor_unavailable',
    });
    return;
  }

  const sourcePostId = await findPostByActivityPubUri(context, objectUri);
  if (!sourcePostId) {
    observeInboundNoop({
      activityType: 'Announce',
      actorOrigin: actorUri.origin,
      handler: 'announce',
      objectOrigin: objectUri.origin,
      phase: 'projection',
      reasonCode: 'announce_source_post_missing',
    });
    return;
  }

  try {
    await materializeActivityPubRepost({
      activityUri: activityUri.href,
      actorProfileId: storedActor.profile.id,
      publishedAt: announce.published,
      receivedAt,
      sourcePostId,
    });
  } catch (error) {
    if (isExpectedRepostRejection(error)) {
      observeInboundRejected({
        activityType: 'Announce',
        actorOrigin: actorUri.origin,
        handler: 'announce',
        objectOrigin: objectUri.origin,
        phase: 'projection',
        reasonCode: 'repost_projection_rejected',
      });
      return;
    }

    throw error;
  }
};
