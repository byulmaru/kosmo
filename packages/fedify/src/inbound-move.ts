import '@kosmo/core/polyfill';

import { isActor } from '@fedify/vocab';
import { runWorkflow } from '@kosmo/core/temporal/client';
import { profileMigrationMoveWorkflow } from '@kosmo/core/temporal/profile-migration';
import { isHttpUri, uniqueHref } from './activitypub-uri';
import { observeInbound } from './inbound-observability';
import type { InboxContext } from '@fedify/fedify';
import type { Move } from '@fedify/vocab';

const noNetworkDocumentLoader = async (): Promise<never> => {
  throw new TypeError('Remote Move target representation lookup is disabled');
};

const noNetworkMoveRepresentationOptions = {
  contextLoader: noNetworkDocumentLoader,
  crossOrigin: 'trust' as const,
  documentLoader: noNetworkDocumentLoader,
  suppressError: true as const,
};

const observeMove = (
  observation: Omit<Parameters<typeof observeInbound>[0], 'activityType' | 'handler'>,
) => observeInbound({ ...observation, activityType: 'Move', handler: 'move' });

type MoveIdentity = {
  readonly actorUri: URL;
  readonly objectUri: URL;
  readonly targetUri: URL;
};

const readMoveIdentity = (move: Move): MoveIdentity | undefined => {
  const actorHref = uniqueHref(move.actorIds);
  const objectHref = uniqueHref(move.objectIds);
  const targetHref = uniqueHref(move.targetIds);
  const actorUri = actorHref ? new URL(actorHref) : null;
  const objectUri = objectHref ? new URL(objectHref) : null;
  const targetUri = targetHref ? new URL(targetHref) : null;

  if (
    !isHttpUri(actorUri) ||
    !isHttpUri(objectUri) ||
    !isHttpUri(targetUri) ||
    actorUri.href !== objectUri.href ||
    actorUri.href === targetUri.href
  ) {
    return undefined;
  }

  return { actorUri, objectUri, targetUri };
};

/**
 * Validates the Move's wire identity and embedded Actors, then durably admits its workflow.
 */
export const handleInboundMove = async (
  _context: InboxContext<void>,
  move: Move,
): Promise<void> => {
  const identity = readMoveIdentity(move);
  const actorOrigin = identity?.actorUri.origin;
  const objectOrigin = identity?.objectUri.origin;

  if (!identity) {
    observeMove({
      actorOrigin,
      objectOrigin,
      outcome: 'rejected',
      phase: 'validation',
      reasonCode: 'move_actor_object_target_invalid',
    });
    return;
  }

  const embeddedObject = await move.getObject(noNetworkMoveRepresentationOptions);
  if (
    embeddedObject !== null &&
    (!isActor(embeddedObject) || embeddedObject.id?.href !== identity.actorUri.href)
  ) {
    observeMove({
      actorOrigin: identity.actorUri.origin,
      objectOrigin: identity.objectUri.origin,
      outcome: 'rejected',
      phase: 'protocol',
      reasonCode: 'move_object_not_matching_actor',
    });
    return;
  }

  const embeddedTarget = await move.getTarget(noNetworkMoveRepresentationOptions);
  if (
    embeddedTarget !== null &&
    (!isActor(embeddedTarget) || embeddedTarget.id?.href !== identity.targetUri.href)
  ) {
    observeMove({
      actorOrigin: identity.actorUri.origin,
      objectOrigin: identity.targetUri.origin,
      outcome: 'rejected',
      phase: 'protocol',
      reasonCode: 'move_target_not_matching_actor',
    });
    return;
  }

  await runWorkflow(profileMigrationMoveWorkflow, {
    args: [
      {
        sourceActorUri: identity.actorUri.href,
        targetActorUri: identity.targetUri.href,
      },
    ],
    mode: 'start',
    workflowIdConflictPolicy: 'USE_EXISTING',
    workflowIdReusePolicy: 'ALLOW_DUPLICATE',
  });
};
