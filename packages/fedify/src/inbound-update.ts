import '@kosmo/core/polyfill';

import { isActor, Note } from '@fedify/vocab';
import { ConflictError, NotFoundError } from '@kosmo/core/error';
import { runWorkflow } from '@kosmo/core/temporal/client';
import { remoteProfileUpdateWorkflow } from '@kosmo/core/temporal/workflows';
import { findRemotePostByActivityPubUri } from './activitypub-post-uri';
import { isHttpUri, uniqueHref } from './activitypub-uri';
import { observeInbound } from './inbound-observability';
import { handleInboundQuote, hasInboundQuote } from './inbound-quote';
import {
  RemoteActorMaterializationError,
  rethrowRemoteActorWorkflowError,
  serializeReceipt,
} from './remote-actor-materialization';
import type { InboxContext } from '@fedify/fedify';
import type { Update } from '@fedify/vocab';
import type { RemoteProfileUpdateInput } from '@kosmo/core/temporal/workflows';

const noNetworkDocumentLoader = async (url: string) => {
  throw new Error(`Network lookup is disabled for inbound Update: ${url}`);
};

export const handleInboundUpdate = async (
  context: InboxContext<void>,
  update: Update,
  receivedAt: Temporal.Instant = Temporal.Now.instant(),
): Promise<void> => {
  const actorHref = uniqueHref(update.actorIds);
  const objectHref = uniqueHref(update.objectIds);
  const actorUri = actorHref ? new URL(actorHref) : null;
  const objectUri = objectHref ? new URL(objectHref) : null;

  if (!isHttpUri(actorUri) || !isHttpUri(objectUri)) {
    observeInbound({
      outcome: 'rejected',
      activityType: 'Update',
      actorOrigin: actorUri?.origin,
      handler: 'update',
      objectOrigin: objectUri?.origin,
      phase: 'validation',
      reasonCode: 'update_actor_object_mismatch',
    });
    return;
  }

  const object =
    actorUri.href !== objectUri.href
      ? await update.getObject({
          crossOrigin: 'trust',
          documentLoader: noNetworkDocumentLoader,
          suppressError: true,
        })
      : null;

  if (object instanceof Note && (await hasInboundQuote({ context, note: object }))) {
    if (object.id?.href !== objectUri.href || uniqueHref(object.attributionIds) !== actorUri.href) {
      observeInbound({
        outcome: 'rejected',
        activityType: 'Update',
        actorOrigin: actorUri.origin,
        handler: 'update',
        objectOrigin: objectUri.origin,
        phase: 'protocol',
        reasonCode: 'quote_update_object_mismatch',
      });
      return;
    }

    const identity = await findRemotePostByActivityPubUri(context, objectUri, actorUri);
    if (identity.status === 'missing') {
      observeInbound({
        outcome: 'noop',
        activityType: 'Update',
        actorOrigin: actorUri.origin,
        handler: 'update',
        objectOrigin: objectUri.origin,
        phase: 'projection',
        reasonCode: 'quote_update_target_missing',
      });
      return;
    }
    if (identity.status === 'author_mismatch') {
      observeInbound({
        outcome: 'rejected',
        activityType: 'Update',
        actorOrigin: actorUri.origin,
        handler: 'update',
        objectOrigin: objectUri.origin,
        phase: 'validation',
        reasonCode: 'stored_author_mismatch',
      });
      return;
    }

    await handleInboundQuote({
      commandId: update.id?.href,
      authorizationUpdate: true,
      actorUri: actorUri.href,
      context,
      note: object,
      postId: identity.postId,
      receivedAt,
    });
    return;
  }

  if (actorUri.href !== objectUri.href) {
    observeInbound({
      outcome: 'rejected',
      activityType: 'Update',
      actorOrigin: actorUri.origin,
      handler: 'update',
      objectOrigin: objectUri.origin,
      phase: 'validation',
      reasonCode: 'update_actor_object_mismatch',
    });
    return;
  }

  const actorObject = await update.getObject({
    crossOrigin: 'trust',
    documentLoader: noNetworkDocumentLoader,
    suppressError: true,
  });
  if (actorObject === null) {
    observeInbound({
      outcome: 'external_failure',
      activityType: 'Update',
      actorOrigin: actorUri?.origin,
      handler: 'update',
      objectOrigin: objectUri?.origin,
      phase: 'object_lookup',
      reasonCode: 'update_object_lookup_failed',
    });
    return;
  }

  if (!isActor(actorObject) || actorObject.id?.href !== actorUri.href) {
    observeInbound({
      outcome: 'rejected',
      activityType: 'Update',
      actorOrigin: actorUri.origin,
      handler: 'update',
      objectOrigin: objectUri.origin,
      phase: 'protocol',
      reasonCode: 'update_object_not_matching_actor',
    });
    return;
  }

  let actorJsonLd: unknown;
  try {
    actorJsonLd = await actorObject.toJsonLd({
      contextLoader: noNetworkDocumentLoader,
      format: 'expand',
    });
  } catch (error) {
    observeInbound({
      outcome: 'external_failure',
      activityType: 'Update',
      actorOrigin: actorUri.origin,
      error,
      handler: 'update',
      objectOrigin: objectUri.origin,
      phase: 'projection',
      reasonCode: 'remote_actor_projection_rejected',
    });
    return;
  }

  try {
    const input: RemoteProfileUpdateInput = {
      actorUri: actorUri.href,
      actorJsonLd,
      receipt: serializeReceipt({ activityUri: update.id, receivedAt }),
    };
    const profileId = await runWorkflow(remoteProfileUpdateWorkflow, {
      args: [input],
      mode: 'execute',
      workflowIdConflictPolicy: 'USE_EXISTING',
      workflowIdReusePolicy: 'ALLOW_DUPLICATE',
    }).catch(rethrowRemoteActorWorkflowError);

    if (profileId === null) {
      throw new NotFoundError('Profile not found');
    }
  } catch (error) {
    if (error instanceof NotFoundError) {
      observeInbound({
        outcome: 'noop',
        activityType: 'Update',
        actorOrigin: actorUri.origin,
        handler: 'update',
        objectOrigin: objectUri.origin,
        phase: 'actor_lookup',
        reasonCode: 'remote_actor_missing',
      });
      return;
    }

    if (error instanceof ConflictError || error instanceof RemoteActorMaterializationError) {
      observeInbound({
        outcome: 'external_failure',
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
