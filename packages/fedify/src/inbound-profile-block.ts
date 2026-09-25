import '@kosmo/core/polyfill';

import { Block } from '@fedify/vocab';
import { ConflictError, NotFoundError, ValidationError } from '@kosmo/core/error';
import {
  ensureProfileBlockProtocolActivity,
  finalizeProfileBlockProtocolUndo,
  loadProfileBlockProtocolActivity,
  prepareProfileBlockProtocolUndo,
} from '@kosmo/core/services';
import { runWorkflow } from '@kosmo/core/temporal/client';
import {
  profileBlockWorkflow,
  profileUnblockUpdateId,
  profileUnblockWorkflow,
} from '@kosmo/core/temporal/profile-block';
import { isHttpUri, uniqueHref } from './activitypub-uri';
import { resolveInboundLocalRecipient } from './inbound-local-recipient';
import { observeInbound } from './inbound-observability';
import {
  findOrMaterializeRemoteProfileActorByUri,
  RemoteActorMaterializationError,
} from './remote-actor-materialization';
import type { InboxContext } from '@fedify/fedify';
import type { ProfileBlockTransitionResult } from '@kosmo/core/temporal/profile-block';

const isExpectedTemporalAdmissionRejection = (
  error: unknown,
): error is Error & { readonly type: string } =>
  error instanceof Error &&
  'type' in error &&
  typeof error.type === 'string' &&
  ['CONFLICT', 'NOT_FOUND', 'PERMISSION_DENIED', 'VALIDATION'].includes(error.type);

const isExpectedAdmissionRejection = (error: unknown) =>
  error instanceof ConflictError ||
  error instanceof NotFoundError ||
  error instanceof RemoteActorMaterializationError ||
  error instanceof ValidationError ||
  isExpectedTemporalAdmissionRejection(error);

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
    });
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
  readonly undoUri?: URL | null;
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
  undoUri,
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
  const undoActivityUri = undoUri ?? null;
  if (!isHttpUri(undoActivityUri)) {
    observeInbound({
      activityType: 'Undo',
      actorOrigin: actorUri.origin,
      handler: 'undo',
      objectOrigin: objectUri?.origin,
      outcome: 'rejected',
      phase: 'protocol',
      reasonCode: 'invalid_block_undo_identity',
    });
    return true;
  }
  const stored = isHttpUri(activityUri)
    ? await loadProfileBlockProtocolActivity(activityUri.href)
    : undefined;
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
  }

  const preparation = await prepareProfileBlockProtocolUndo({
    actorUri: actorUri.href,
    objectUri: originalObjectUri.href,
    ...(isHttpUri(activityUri) ? { originalActivityUri: activityUri.href } : {}),
    ownerProfileId: remoteActorProfileId,
    targetProfileId: localRecipient.id,
    undoActivityUri: `undo:${undoActivityUri.href}`,
  });
  if (preparation.kind !== 'REMOVE') {
    observeInbound({
      activityType: 'Undo',
      actorOrigin: actorUri.origin,
      handler: 'undo',
      objectOrigin: originalObjectUri.origin,
      outcome: 'noop',
      phase: 'projection',
      reasonCode: 'block_undo_missing_or_repeated',
    });
    return true;
  }

  const command = {
    ownerProfileId: remoteActorProfileId,
    origin: 'ACTIVITYPUB',
    profileBlockId: preparation.profileBlockId,
    targetProfileId: localRecipient.id,
  } as const;
  const result = await runWorkflow(profileUnblockWorkflow, {
    args: [command],
    updateArgs: [command],
    updateId: profileUnblockUpdateId(command),
    mode: 'update-with-start',
    workflowIdConflictPolicy: 'USE_EXISTING',
    workflowIdReusePolicy: 'ALLOW_DUPLICATE',
  });
  await finalizeProfileBlockProtocolUndo({
    ownerProfileId: remoteActorProfileId,
    profileBlockId: preparation.profileBlockId,
    targetProfileId: localRecipient.id,
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
