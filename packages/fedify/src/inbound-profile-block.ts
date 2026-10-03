import '@kosmo/core/polyfill';

import { Block } from '@fedify/vocab';
import { ConflictError, NotFoundError, ValidationError } from '@kosmo/core/error';
import { runWorkflow } from '@kosmo/core/temporal/client';
import {
  PROFILE_BLOCK_UPDATE_ID,
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
import type {
  ProfileBlockTransitionResult,
  ProfileUnblockTransitionResult,
} from '@kosmo/core/temporal/profile-block';

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
  const actorHref = uniqueHref(block.actorIds);
  const objectUri = block.objectId;

  if (!actorHref || !isHttpUri(objectUri)) {
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

  let result: ProfileBlockTransitionResult;
  try {
    const command = {
      ownerProfileId: remoteActor.profile.id,
      origin: 'ACTIVITYPUB',
      targetProfileId: localRecipient.id,
    } as const;
    result = await runWorkflow(profileBlockWorkflow, {
      args: [command],
      updateArgs: [command],
      updateId: PROFILE_BLOCK_UPDATE_ID,
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

  if (!result.created) {
    observeInbound({
      activityType: 'Block',
      actorOrigin: actorUri.origin,
      handler: 'block',
      objectOrigin: objectUri.origin,
      outcome: 'noop',
      phase: 'projection',
      reasonCode: 'duplicate_block_noop',
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

  const command = {
    ownerProfileId: remoteActorProfileId,
    origin: 'ACTIVITYPUB',
    targetProfileId: localRecipient.id,
  } as const;
  let result!: ProfileUnblockTransitionResult;
  try {
    result = await runWorkflow(profileUnblockWorkflow, {
      args: [command],
      updateArgs: [command],
      updateId: profileUnblockUpdateId(command),
      mode: 'update-with-start',
      workflowIdConflictPolicy: 'USE_EXISTING',
      workflowIdReusePolicy: 'ALLOW_DUPLICATE',
    });
  } catch (error) {
    try {
      rethrowProfileBlockWorkflowFailure(error);
    } catch (normalizedError) {
      if (isExpectedAdmissionRejection(normalizedError)) {
        observeInbound({
          activityType: 'Undo',
          actorOrigin: actorUri.origin,
          handler: 'undo',
          objectOrigin: originalObjectUri.origin,
          outcome: 'rejected',
          phase: 'projection',
          reasonCode: 'profile_block_undo_admission_rejected',
        });
        return true;
      }
      throw normalizedError;
    }
  }
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
