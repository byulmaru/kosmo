import '@kosmo/core/polyfill';

import { Block } from '@fedify/vocab';
import { ConflictError, NotFoundError, ValidationError } from '@kosmo/core/error';
import {
  loadProfileBlockProtocolActivity,
  loadProfileBlockTransitionBootstrap,
  recordProfileBlockProtocolTombstone,
} from '@kosmo/core/services';
import { executeProfileBlock, executeProfileUnblock } from '@kosmo/core/temporal/profile-block';
import { isHttpUri, uniqueHref } from './activitypub-uri';
import { resolveInboundLocalRecipient } from './inbound-local-recipient';
import { observeInbound } from './inbound-observability';
import {
  findOrMaterializeRemoteProfileActorByUri,
  RemoteActorMaterializationError,
} from './remote-actor-materialization';
import type { InboxContext } from '@fedify/fedify';

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

  let result: Awaited<ReturnType<typeof executeProfileBlock>>;
  try {
    result = await executeProfileBlock({
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

  if (!result.created || result.protocol?.status === 'CLOSED') {
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
  const embeddedBlock = embedded instanceof Block ? embedded : null;
  if (embedded !== null && embeddedBlock === null && objectUri === null) {
    return false;
  }

  const activityUri = embeddedBlock?.id ?? objectUri;
  if (!isHttpUri(activityUri)) {
    if (embeddedBlock || objectUri) {
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
    return false;
  }

  let stored = await loadProfileBlockProtocolActivity(activityUri.href);
  const originalActorHref = embeddedBlock ? uniqueHref(embeddedBlock.actorIds) : stored?.actorUri;
  const originalActorUri = originalActorHref ? new URL(originalActorHref) : null;
  const originalObjectUri = embeddedBlock?.objectId ?? (stored ? new URL(stored.objectUri) : null);

  if (
    !originalActorUri ||
    !isHttpUri(originalActorUri) ||
    !originalObjectUri ||
    !isHttpUri(originalObjectUri) ||
    originalActorUri.href !== actorUri.href
  ) {
    if (!embeddedBlock && !stored) {
      return false;
    }
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
  } else if (!embeddedBlock) {
    // URI-only unknown originals cannot prove the actor/object pair. Treat
    // them as a no-op rather than guessing the current pair relation.
    observeInbound({
      activityType: 'Undo',
      actorOrigin: actorUri.origin,
      handler: 'undo',
      objectOrigin: originalObjectUri.origin,
      outcome: 'noop',
      phase: 'projection',
      reasonCode: 'unknown_block_undo_noop',
    });
    return true;
  } else {
    // Preserve a verified Undo-before-Block tombstone. The candidate is not
    // attached to any existing product relation; it only prevents the late
    // Block with the same Activity ID from creating one.
    const bootstrap = await loadProfileBlockTransitionBootstrap({
      firstProfileId: remoteActorProfileId,
      secondProfileId: localRecipient.id,
    });
    const recorded = await recordProfileBlockProtocolTombstone({
      activityUri: activityUri.href,
      actorUri: actorUri.href,
      objectUri: originalObjectUri.href,
      origin: 'INBOUND',
      ownerProfileId: remoteActorProfileId,
      profileBlockId: bootstrap.candidateProfileBlockId,
      targetProfileId: localRecipient.id,
    });
    if (recorded.state === 'CLOSED') {
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
    // The concurrent Block committed first. Continue through the regular
    // Unblock path so the admitted generation is closed and removed.
    stored = recorded;
  }

  if (!stored.profileBlockId) {
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

  const result = await executeProfileUnblock({
    ownerProfileId: stored.ownerProfileId,
    origin: 'ACTIVITYPUB',
    profileBlockId: stored.profileBlockId,
    protocolActivityUri: stored.activityUri,
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
