import '@kosmo/core/polyfill';

import { EmojiReact, Follow, Like } from '@fedify/vocab';
import {
  ActivityPubPosts,
  db,
  first,
  Posts,
  ProfileFollowRequests,
  ProfileFollows,
} from '@kosmo/core/db';
import { InstanceState, PostState } from '@kosmo/core/enums';
import { ConflictError, NotFoundError } from '@kosmo/core/error';
import { deletePost, undoInboundReaction } from '@kosmo/core/services';
import {
  executeProfileFollowPairTransition,
  executeProfileFollowRemoval,
} from '@kosmo/core/temporal/follow-command';
import { and, eq } from 'drizzle-orm';
import { isHttpUri, uniqueHref } from './activitypub-uri';
import { sendAcceptFollowActivity } from './follow-delivery';
import { resolveInboundLocalRecipient } from './inbound-local-recipient';
import {
  observeInbound,
  observeInboundExternalFailure,
  observeInboundNoop,
  observeInboundRejected,
} from './inbound-observability';
import {
  findOrMaterializeRemoteProfileActorByUri,
  findStoredRemoteProfileActorByUri,
  findUsableStoredRemoteProfileActorByUri,
  RemoteActorMaterializationError,
} from './remote-actor-materialization';
import type { InboxContext } from '@fedify/fedify';
import type { Undo } from '@fedify/vocab';

const isExpectedRemoteActorRejection = (error: unknown) =>
  error instanceof RemoteActorMaterializationError ||
  error instanceof NotFoundError ||
  error instanceof ConflictError;

export const handleInboundFollow = async (
  context: InboxContext<void>,
  follow: Follow,
  now: Temporal.Instant = Temporal.Now.instant(),
): Promise<void> => {
  const actorUri = follow.actorId;
  const objectUri = follow.objectId;

  if (!isHttpUri(actorUri) || !isHttpUri(objectUri)) {
    observeInboundRejected({
      activityType: 'Follow',
      handler: 'follow',
      phase: 'validation',
      reasonCode: 'invalid_follow_identity',
    });
    return;
  }

  // Local validation intentionally precedes every remote lookup.
  const localRecipient = await resolveInboundLocalRecipient(context, objectUri);
  if (!localRecipient) {
    observeInboundRejected({
      activityType: 'Follow',
      actorOrigin: actorUri.origin,
      handler: 'follow',
      objectOrigin: objectUri.origin,
      phase: 'validation',
      reasonCode: 'local_recipient_not_found',
    });
    return;
  }

  let remoteActor: Awaited<ReturnType<typeof findOrMaterializeRemoteProfileActorByUri>>;

  try {
    remoteActor = await findOrMaterializeRemoteProfileActorByUri({ actorUri, context, now });
  } catch (error) {
    if (isExpectedRemoteActorRejection(error)) {
      observeInboundExternalFailure({
        activityType: 'Follow',
        actorOrigin: actorUri.origin,
        handler: 'follow',
        objectOrigin: objectUri.origin,
        phase: 'actor_lookup',
        reasonCode: 'remote_actor_materialization_rejected',
      });
      return;
    }

    throw error;
  }

  const pair = {
    followeeProfileId: localRecipient.id,
    followerProfileId: remoteActor.profile.id,
  };
  const result = await executeProfileFollowPairTransition({
    pair,
    command: {
      kind: 'FOLLOW',
      origin: 'ACTIVITYPUB',
    },
  });
  if (result.result.commandKind !== 'FOLLOW') {
    throw new Error('Unexpected inbound Follow transition result');
  }

  if (result.result.kind !== 'ESTABLISHED') {
    if (!result.result.created) {
      observeInboundNoop({
        activityType: 'Follow',
        actorOrigin: actorUri.origin,
        handler: 'follow',
        objectOrigin: objectUri.origin,
        phase: 'projection',
        reasonCode: 'duplicate_pending_follow_noop',
      });
    }
    return;
  }

  if (!result.result.created) {
    observeInboundNoop({
      activityType: 'Follow',
      actorOrigin: actorUri.origin,
      handler: 'follow',
      objectOrigin: objectUri.origin,
      phase: 'projection',
      reasonCode: 'duplicate_established_follow_noop',
    });
  }

  if (!remoteActor.actor.inboxUri) {
    observeInboundNoop({
      activityType: 'Follow',
      actorOrigin: actorUri.origin,
      handler: 'follow',
      objectOrigin: objectUri.origin,
      phase: 'delivery',
      reasonCode: 'remote_actor_inbox_missing',
    });
    return;
  }
  try {
    await sendAcceptFollowActivity({
      context,
      receivedFollow: follow,
      recipientActor: {
        endpoints: remoteActor.actor.sharedInboxUri
          ? { sharedInbox: new URL(remoteActor.actor.sharedInboxUri) }
          : null,
        id: new URL(remoteActor.actor.uri),
        inboxId: new URL(remoteActor.actor.inboxUri),
      },
      senderProfileId: localRecipient.id,
    });
  } catch {
    // The projection is authoritative; delivery retries belong to a separate slice.
    observeInboundExternalFailure({
      activityType: 'Follow',
      actorOrigin: actorUri.origin,
      handler: 'follow',
      objectOrigin: objectUri.origin,
      phase: 'delivery',
      reasonCode: 'accept_delivery_failed',
    });
  }
};

type UndoAnnounceResult = 'deleted' | 'ignored' | null;

const handleInboundUndoAnnounce = async (
  activityUri: URL,
  actorUri: URL,
): Promise<UndoAnnounceResult> => {
  if (activityUri.origin !== actorUri.origin) {
    return 'ignored';
  }

  const storedActor = await findStoredRemoteProfileActorByUri(actorUri);
  if (!storedActor) {
    return null;
  }
  if (
    storedActor.instance.state !== InstanceState.ACTIVE &&
    storedActor.instance.state !== InstanceState.UNRESPONSIVE
  ) {
    return 'ignored';
  }

  const mapping = await db
    .select({
      currentContentId: Posts.currentContentId,
      id: Posts.id,
      profileId: Posts.profileId,
      replyParentId: Posts.replyParentId,
      repostSourceId: Posts.repostSourceId,
      state: Posts.state,
    })
    .from(ActivityPubPosts)
    .innerJoin(Posts, eq(Posts.id, ActivityPubPosts.postId))
    .where(eq(ActivityPubPosts.uri, activityUri.href))
    .limit(1)
    .then(first);

  if (!mapping) {
    return null;
  }

  if (
    mapping.profileId !== storedActor.profile.id ||
    mapping.currentContentId !== null ||
    mapping.replyParentId !== null ||
    mapping.repostSourceId === null ||
    mapping.state !== PostState.ACTIVE
  ) {
    return 'ignored';
  }

  await deletePost({
    actorProfileId: storedActor.profile.id,
    origin: 'ACTIVITYPUB',
    postId: mapping.id,
  });
  return 'deleted';
};

export const handleInboundUndo = async (context: InboxContext<void>, undo: Undo): Promise<void> => {
  const actorHref = uniqueHref(undo.actorIds);
  const actorUri = actorHref ? new URL(actorHref) : null;
  if (!isHttpUri(actorUri)) {
    observeInboundRejected({
      activityType: 'Undo',
      handler: 'undo',
      phase: 'validation',
      reasonCode: 'invalid_undo_actor_identity',
    });
    return;
  }

  const objectHref = uniqueHref(undo.objectIds);
  if (undo.objectIds.length > 0 && !objectHref) {
    observeInboundRejected({
      activityType: 'Undo',
      actorOrigin: actorUri.origin,
      handler: 'undo',
      phase: 'validation',
      reasonCode: 'ambiguous_undo_object_identity',
    });
    return;
  }
  const objectUri = objectHref ? new URL(objectHref) : null;
  if (objectUri && !isHttpUri(objectUri)) {
    observeInboundRejected({
      activityType: 'Undo',
      actorOrigin: actorUri.origin,
      handler: 'undo',
      phase: 'validation',
      reasonCode: 'invalid_undo_object_identity',
    });
    return;
  }

  if (objectUri) {
    const announceResult = await handleInboundUndoAnnounce(objectUri, actorUri);
    if (announceResult === 'deleted') {
      return;
    }
    if (announceResult === 'ignored') {
      observeInboundNoop({
        activityType: 'Undo',
        actorOrigin: actorUri.origin,
        handler: 'undo',
        objectOrigin: objectUri.origin,
        phase: 'projection',
        reasonCode: 'announce_undo_ignored',
      });
      return;
    }
  }

  // Undo never materializes or dereferences an unknown actor.
  let remoteActor: Awaited<ReturnType<typeof findUsableStoredRemoteProfileActorByUri>>;

  try {
    remoteActor = await findUsableStoredRemoteProfileActorByUri(actorUri);
  } catch (error) {
    if (isExpectedRemoteActorRejection(error)) {
      observeInboundExternalFailure({
        activityType: 'Undo',
        actorOrigin: actorUri.origin,
        handler: 'undo',
        objectOrigin: objectUri?.origin,
        phase: 'actor_lookup',
        reasonCode: 'remote_actor_lookup_rejected',
      });
      return;
    }

    throw error;
  }

  if (!remoteActor || remoteActor.instance.state !== InstanceState.ACTIVE) {
    observeInboundNoop({
      activityType: 'Undo',
      actorOrigin: actorUri.origin,
      handler: 'undo',
      objectOrigin: objectUri?.origin,
      phase: 'actor_lookup',
      reasonCode: 'remote_actor_unavailable',
    });
    return;
  }

  const embedded = await undo.getObject({
    documentLoader: async (url) => {
      throw new Error(`Network lookup is disabled for inbound Undo: ${url}`);
    },
    suppressError: true,
  });
  if (embedded === null && !undo.objectId) {
    observeInboundExternalFailure({
      activityType: 'Undo',
      actorOrigin: actorUri.origin,
      handler: 'undo',
      objectOrigin: objectUri?.origin,
      phase: 'object_lookup',
      reasonCode: 'undo_object_lookup_failed',
    });
    return;
  }
  if (embedded instanceof Follow) {
    const objectUri = embedded.objectId;
    if (!isHttpUri(objectUri) || uniqueHref(embedded.actorIds) !== actorUri.href) {
      observeInboundRejected({
        activityType: 'Undo',
        actorOrigin: actorUri.origin,
        objectOrigin: objectUri?.origin,
        handler: 'undo',
        phase: 'protocol',
        reasonCode: 'undo_follow_actor_or_object_mismatch',
      });
      return;
    }

    const localRecipient = await resolveInboundLocalRecipient(context, objectUri);
    if (!localRecipient) {
      observeInboundRejected({
        activityType: 'Undo',
        actorOrigin: actorUri.origin,
        objectOrigin: objectUri.origin,
        handler: 'undo',
        phase: 'validation',
        reasonCode: 'undo_local_recipient_not_found',
      });
      return;
    }

    const pair = {
      followeeProfileId: localRecipient.id,
      followerProfileId: remoteActor.profile.id,
    };
    const profileFollow = await db
      .select({ id: ProfileFollows.id })
      .from(ProfileFollows)
      .where(
        and(
          eq(ProfileFollows.followerProfileId, pair.followerProfileId),
          eq(ProfileFollows.followeeProfileId, pair.followeeProfileId),
        ),
      )
      .limit(1)
      .then(first);

    if (profileFollow) {
      const result = await executeProfileFollowRemoval({
        ...pair,
        expectedRowId: profileFollow.id,
        origin: 'ACTIVITYPUB',
      });
      if (!result.ok) {
        throw new Error(result.error.message);
      }
      if (!result.changed) {
        observeInboundNoop({
          activityType: 'Undo',
          actorOrigin: actorUri.origin,
          handler: 'undo',
          objectOrigin: objectUri.origin,
          phase: 'projection',
          reasonCode: 'follow_undo_missing_or_repeated',
        });
      }
      return;
    }

    const pendingRequest = await db
      .select({ id: ProfileFollowRequests.id })
      .from(ProfileFollowRequests)
      .where(
        and(
          eq(ProfileFollowRequests.followerProfileId, pair.followerProfileId),
          eq(ProfileFollowRequests.followeeProfileId, pair.followeeProfileId),
        ),
      )
      .limit(1)
      .then(first);

    if (!pendingRequest) {
      observeInboundNoop({
        activityType: 'Undo',
        actorOrigin: actorUri.origin,
        handler: 'undo',
        objectOrigin: objectUri.origin,
        phase: 'projection',
        reasonCode: 'follow_undo_missing_or_repeated',
      });
      return;
    }

    const result = await executeProfileFollowPairTransition({
      pair,
      command: {
        kind: 'CANCEL',
        expectedRowId: pendingRequest.id,
        origin: 'ACTIVITYPUB',
      },
    });
    if (result.result.commandKind !== 'CANCEL') {
      throw new Error('Unexpected inbound Undo transition result');
    }
    if (!result.result.changed) {
      observeInboundNoop({
        activityType: 'Undo',
        actorOrigin: actorUri.origin,
        handler: 'undo',
        objectOrigin: objectUri.origin,
        phase: 'projection',
        reasonCode: 'follow_undo_missing_or_repeated',
      });
    }
    return;
  }

  if (embedded !== null && !(embedded instanceof Like) && !(embedded instanceof EmojiReact)) {
    observeInboundRejected({
      activityType: 'Undo',
      actorOrigin: actorUri.origin,
      objectOrigin: objectUri?.origin,
      handler: 'undo',
      phase: 'protocol',
      reasonCode: 'unsupported_undo_object',
    });
    return;
  }

  const activityUri = embedded?.id ?? undo.objectId;
  if (
    !isHttpUri(activityUri) ||
    ((embedded instanceof Like || embedded instanceof EmojiReact) &&
      uniqueHref(embedded.actorIds) !== actorUri.href)
  ) {
    observeInboundRejected({
      activityType: 'Undo',
      actorOrigin: actorUri.origin,
      objectOrigin: activityUri?.origin,
      handler: 'undo',
      phase: 'protocol',
      reasonCode: 'undo_reaction_actor_or_object_mismatch',
    });
    return;
  }

  const result = await undoInboundReaction({
    activityUri: activityUri.href,
    actorUri: actorUri.href,
    onWorkflowStartError: (error) =>
      observeInbound({
        activityType: 'Undo',
        actorOrigin: actorUri.origin,
        error,
        handler: 'undo',
        objectOrigin: activityUri.origin,
        outcome: 'internal_failure',
        phase: 'effect',
        reasonCode: 'reaction_undo_notification_effect_failed',
      }),
  });
  if (result.reactionId === null) {
    observeInboundNoop({
      activityType: 'Undo',
      actorOrigin: actorUri.origin,
      objectOrigin: activityUri.origin,
      handler: 'undo',
      phase: 'projection',
      reasonCode: 'reaction_undo_missing_or_repeated',
    });
  }
};
