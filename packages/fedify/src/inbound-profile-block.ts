import '@kosmo/core/polyfill';

import { Block } from '@fedify/vocab';
import { ConflictError, NotFoundError, ValidationError } from '@kosmo/core/error';
import {
  ensureProfileBlockProtocolActivity,
  finalizeProfileBlockProtocolUndo,
  loadProfileBlockProtocolActivity,
  prepareProfileBlockProtocolUndo,
  recordProfileBlockProtocolTombstone,
} from '@kosmo/core/services';
import { runWorkflow } from '@kosmo/core/temporal/client';
import {
  profileBlockWorkflow,
  profileUnblockUpdateId,
  profileUnblockWorkflow,
} from '@kosmo/core/temporal/profile-block';
import { rethrowProfileBlockWorkflowFailure } from '@kosmo/core/temporal/profile-block-failure';
import { isHttpUri, uniqueHref } from './activitypub-uri';
import { resolveInboundLocalRecipient } from './inbound-local-recipient';
import { observeInbound } from './inbound-observability';
import {
  findOrMaterializeRemoteProfileActorByUri,
  RemoteActorMaterializationError,
} from './remote-actor-materialization';
import type { InboxContext } from '@fedify/fedify';
import type { ProfileBlockTransitionResult } from '@kosmo/core/temporal/profile-block';

const isExpectedAdmissionRejection = (error: unknown) =>
  error instanceof ConflictError ||
  error instanceof NotFoundError ||
  error instanceof RemoteActorMaterializationError ||
  error instanceof ValidationError;

const observeRejectedBlock = ({
  actorUri,
  objectUri,
  reasonCode,
}: {
  readonly actorUri?: URL;
  readonly objectUri?: URL;
  readonly reasonCode: string;
}) => {
  observeInbound({
    activityType: 'Block',
    actorOrigin: actorUri?.origin,
    handler: 'block',
    objectOrigin: objectUri?.origin,
    outcome: 'rejected',
    phase: 'validation',
    reasonCode,
  });
};

export const handleInboundBlock = async (
  context: InboxContext<void>,
  block: Block,
  now: Temporal.Instant = Temporal.Now.instant(),
): Promise<void> => {
  const activityUri = block.id;
  const actorHref = uniqueHref(block.actorIds);
  const objectUri = block.objectId;

  if (!isHttpUri(activityUri) || !actorHref || !isHttpUri(objectUri)) {
    observeRejectedBlock({
      actorUri: actorHref ? new URL(actorHref) : undefined,
      objectUri: objectUri ?? undefined,
      reasonCode: 'invalid_block_identity',
    });
    return;
  }
  const actorUri = new URL(actorHref);

  // The inbox recipient is the authority for the local Target. Validate it
  // before any remote actor lookup or domain mutation.
  const localRecipient = await resolveInboundLocalRecipient(context, objectUri);
  if (!localRecipient) {
    observeRejectedBlock({
      actorUri,
      objectUri,
      reasonCode: 'local_recipient_not_found',
    });
    return;
  }

  const existingProtocol = await loadProfileBlockProtocolActivity(activityUri.href);
  if (existingProtocol?.state === 'CLOSED') {
    observeInbound({
      activityType: 'Block',
      actorOrigin: actorUri.origin,
      handler: 'block',
      objectOrigin: objectUri.origin,
      outcome: 'noop',
      phase: 'projection',
      reasonCode: 'duplicate_or_closed_block_noop',
    });
    return;
  }

  let remoteActor: Awaited<ReturnType<typeof findOrMaterializeRemoteProfileActorByUri>>;
  try {
    remoteActor = await findOrMaterializeRemoteProfileActorByUri({
      actorUri,
      context,
      now,
    });
  } catch (error) {
    if (isExpectedAdmissionRejection(error)) {
      observeInbound({
        activityType: 'Block',
        actorOrigin: actorUri.origin,
        handler: 'block',
        objectOrigin: objectUri.origin,
        outcome: 'external_failure',
        phase: 'actor_lookup',
        reasonCode: 'remote_actor_materialization_rejected',
      });
      return;
    }
    throw error;
  }

  let result: ProfileBlockTransitionResult;
  try {
    const command = {
      ownerProfileId: remoteActor.profile.id,
      origin: 'ACTIVITYPUB',
      protocolActivity: {
        activityUri: activityUri.href,
        actorUri: actorUri.href,
        objectUri: objectUri.href,
        origin: 'INBOUND',
        ownerProfileId: remoteActor.profile.id,
        targetProfileId: localRecipient.id,
      },
      targetProfileId: localRecipient.id,
    } as const;
    result = await runWorkflow(profileBlockWorkflow, {
      args: [command],
      updateArgs: [command],
      mode: 'update-with-start',
      workflowIdConflictPolicy: 'USE_EXISTING',
      workflowIdReusePolicy: 'ALLOW_DUPLICATE',
    }).catch(rethrowProfileBlockWorkflowFailure);
  } catch (error) {
    if (isExpectedAdmissionRejection(error)) {
      observeRejectedBlock({
        actorUri,
        objectUri,
        reasonCode: 'profile_block_admission_rejected',
      });
      return;
    }
    throw error;
  }

  try {
    await ensureProfileBlockProtocolActivity({
      activityUri: activityUri.href,
      actorUri: actorUri.href,
      objectUri: objectUri.href,
      origin: 'INBOUND',
      ownerProfileId: remoteActor.profile.id,
      profileBlockId: result.profileBlockId,
      targetProfileId: localRecipient.id,
    });
  } catch (error) {
    if (isExpectedAdmissionRejection(error)) {
      observeRejectedBlock({
        actorUri,
        objectUri,
        reasonCode: 'profile_block_protocol_rejected',
      });
      return;
    }
    throw error;
  }

  if (!result.created) {
    observeInbound({
      activityType: 'Block',
      actorOrigin: actorUri.origin,
      handler: 'block',
      objectOrigin: objectUri.origin,
      outcome: 'noop',
      phase: 'projection',
      reasonCode: 'duplicate_or_closed_block_noop',
    });
  }
};

type InboundUndoBlockInput = {
  readonly context: InboxContext<void>;
  readonly actorUri: URL;
  readonly objectUri: URL | null;
  readonly embedded: unknown;
  readonly remoteActorProfileId: string;
};

/**
 * Handles only Block originals. Returning false leaves Follow, Like and
 * EmojiReact Undo processing to the existing handler.
 */
export const handleInboundUndoBlock = async ({
  context,
  actorUri,
  objectUri,
  embedded,
  remoteActorProfileId,
}: InboundUndoBlockInput): Promise<boolean> => {
  // Only an embedded ActivityPub Block carries enough type evidence for this
  // handler. URI-only and non-Block Undo objects remain available to the
  // existing Follow/Like/EmojiReact handlers.
  if (!(embedded instanceof Block)) {
    return false;
  }
  const embeddedBlock = embedded;

  const activityUri = embeddedBlock.id;
  if (!isHttpUri(activityUri)) {
    observeInbound({
      activityType: 'Undo',
      actorOrigin: actorUri.origin,
      handler: 'undo',
      objectOrigin: objectUri?.origin,
      outcome: 'rejected',
      phase: 'protocol',
      reasonCode: 'invalid_block_undo_original_identity',
    });
    return true;
  }

  const stored = await loadProfileBlockProtocolActivity(activityUri.href);
  const originalActorHref = uniqueHref(embeddedBlock.actorIds);
  const originalActorUri = originalActorHref ? new URL(originalActorHref) : null;
  const originalObjectUri = embeddedBlock.objectId;

  if (
    !originalActorUri ||
    !isHttpUri(originalActorUri) ||
    !originalObjectUri ||
    !isHttpUri(originalObjectUri) ||
    originalActorUri.href !== actorUri.href
  ) {
    observeInbound({
      activityType: 'Undo',
      actorOrigin: actorUri.origin,
      handler: 'undo',
      objectOrigin: originalObjectUri?.origin ?? objectUri?.origin,
      outcome: 'rejected',
      phase: 'protocol',
      reasonCode: 'undo_block_actor_or_object_mismatch',
    });
    return true;
  }

  if (objectUri && objectUri.href !== activityUri.href) {
    observeInbound({
      activityType: 'Undo',
      actorOrigin: actorUri.origin,
      handler: 'undo',
      objectOrigin: objectUri.origin,
      outcome: 'rejected',
      phase: 'protocol',
      reasonCode: 'undo_block_original_id_mismatch',
    });
    return true;
  }

  const localRecipient = await resolveInboundLocalRecipient(context, originalObjectUri);
  if (!localRecipient) {
    observeInbound({
      activityType: 'Undo',
      actorOrigin: actorUri.origin,
      handler: 'undo',
      objectOrigin: originalObjectUri.origin,
      outcome: 'rejected',
      phase: 'validation',
      reasonCode: 'undo_block_local_recipient_not_found',
    });
    return true;
  }

  if (stored) {
    if (
      stored.origin !== 'INBOUND' ||
      stored.actorUri !== actorUri.href ||
      stored.objectUri !== originalObjectUri.href ||
      stored.ownerProfileId !== remoteActorProfileId ||
      stored.targetProfileId !== localRecipient.id
    ) {
      observeInbound({
        activityType: 'Undo',
        actorOrigin: actorUri.origin,
        handler: 'undo',
        objectOrigin: originalObjectUri.origin,
        outcome: 'rejected',
        phase: 'protocol',
        reasonCode: 'stored_block_identity_mismatch',
      });
      return true;
    }
  } else {
    // Preserve a verified Undo-before-Block tombstone. The candidate is not
    // attached to any existing product relation; it only prevents the late
    // Block with the same Activity ID from creating one.
    await recordProfileBlockProtocolTombstone({
      activityUri: activityUri.href,
      actorUri: actorUri.href,
      objectUri: originalObjectUri.href,
      origin: 'INBOUND',
      ownerProfileId: remoteActorProfileId,
      targetProfileId: localRecipient.id,
    });
    observeInbound({
      activityType: 'Undo',
      actorOrigin: actorUri.origin,
      handler: 'undo',
      objectOrigin: originalObjectUri.origin,
      outcome: 'noop',
      phase: 'projection',
      reasonCode: 'block_undo_before_block_tombstone',
    });
    return true;
  }

  if (stored.state === 'CLOSED' || !stored.profileBlockId) {
    observeInbound({
      activityType: 'Undo',
      actorOrigin: actorUri.origin,
      handler: 'undo',
      objectOrigin: originalObjectUri.origin,
      outcome: 'noop',
      phase: 'projection',
      reasonCode: 'closed_block_undo_noop',
    });
    return true;
  }

  const preparation = await prepareProfileBlockProtocolUndo({
    activityUri: stored.activityUri,
    expectedProfileBlockId: stored.profileBlockId,
    ownerProfileId: stored.ownerProfileId,
    targetProfileId: stored.targetProfileId,
  });
  if (preparation.kind !== 'REMOVE') {
    observeInbound({
      activityType: 'Undo',
      actorOrigin: actorUri.origin,
      handler: 'undo',
      objectOrigin: originalObjectUri.origin,
      outcome: 'noop',
      phase: 'projection',
      reasonCode:
        preparation.kind === 'CLOSE_ONLY'
          ? 'block_undo_protocol_original_closed'
          : 'block_undo_missing_or_repeated',
    });
    return true;
  }

  const command = {
    ownerProfileId: stored.ownerProfileId,
    origin: 'ACTIVITYPUB',
    profileBlockId: stored.profileBlockId,
    protocolActivityUri: stored.activityUri,
    targetProfileId: stored.targetProfileId,
  } as const;
  const result = await runWorkflow(profileUnblockWorkflow, {
    args: [command],
    updateArgs: [command],
    updateId: profileUnblockUpdateId(command),
    mode: 'update-with-start',
    workflowIdConflictPolicy: 'USE_EXISTING',
    workflowIdReusePolicy: 'ALLOW_DUPLICATE',
  }).catch(rethrowProfileBlockWorkflowFailure);
  await finalizeProfileBlockProtocolUndo({
    activityUri: stored.activityUri,
    ownerProfileId: stored.ownerProfileId,
    profileBlockId: stored.profileBlockId,
    targetProfileId: stored.targetProfileId,
  });
  if (!result.removed) {
    observeInbound({
      activityType: 'Undo',
      actorOrigin: actorUri.origin,
      handler: 'undo',
      objectOrigin: originalObjectUri.origin,
      outcome: 'noop',
      phase: 'projection',
      reasonCode: 'block_undo_missing_or_repeated',
    });
  }
  return true;
};
