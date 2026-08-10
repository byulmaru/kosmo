import '@kosmo/core/polyfill';

import { EmojiReact, Follow, Like } from '@fedify/vocab';
import {
  ActivityPubActors,
  ActivityPubPosts,
  db,
  first,
  Instances,
  Posts,
  Profiles,
} from '@kosmo/core/db';
import { InstanceKind, InstanceState, PostState, ProfileState } from '@kosmo/core/enums';
import { ConflictError, NotFoundError } from '@kosmo/core/error';
import {
  deletePost,
  followProfile,
  undoInboundReaction,
  unfollowProfile,
} from '@kosmo/core/services';
import { and, eq, isNotNull, isNull } from 'drizzle-orm';
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
  findUsableStoredRemoteProfileActorByUri,
  RemoteActorMaterializationError,
} from './remote-actor-materialization';
import type { InboxContext } from '@fedify/fedify';
import type { Recipient, Undo } from '@fedify/vocab';
import type { FedifyExecutionContext } from './fedify-execution';

const getNow = () => Temporal.Now.instant();

const isExpectedRemoteActorRejection = (error: unknown) =>
  error instanceof RemoteActorMaterializationError ||
  error instanceof NotFoundError ||
  error instanceof ConflictError;

const toRecipient = (actor: typeof ActivityPubActors.$inferSelect): Recipient | undefined => {
  if (!actor.inboxUri) {
    return undefined;
  }

  return {
    endpoints: actor.sharedInboxUri ? { sharedInbox: new URL(actor.sharedInboxUri) } : null,
    id: new URL(actor.uri),
    inboxId: new URL(actor.inboxUri),
  };
};

export const handleInboundFollow = async (
  context: InboxContext<FedifyExecutionContext>,
  follow: Follow,
  now: Temporal.Instant = getNow(),
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

  const result = await followProfile({
    followeeProfileId: localRecipient.id,
    followerProfileId: remoteActor.profile.id,
    onPostCommitError: (error) =>
      observeInbound({
        activityType: 'Follow',
        actorOrigin: actorUri.origin,
        error,
        handler: 'follow',
        objectOrigin: objectUri.origin,
        outcome: 'internal_failure',
        phase: 'effect',
        reasonCode: 'follow_notification_effect_failed',
      }),
  });

  if (result.result.kind !== 'ESTABLISHED') {
    if (!result.created) {
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

  if (!result.created) {
    observeInboundNoop({
      activityType: 'Follow',
      actorOrigin: actorUri.origin,
      handler: 'follow',
      objectOrigin: objectUri.origin,
      phase: 'projection',
      reasonCode: 'duplicate_established_follow_noop',
    });
  }

  const recipientActor = toRecipient(remoteActor.actor);
  if (!recipientActor) {
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
      recipientActor,
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

const noNetworkDocumentLoader = async (url: string) => {
  throw new Error(`Network lookup is disabled for inbound Undo: ${url}`);
};

type UndoAnnounceResult = 'deleted' | 'ignored' | null;

const handleInboundUndoAnnounce = async (
  activityUri: URL,
  actorUri: URL,
): Promise<UndoAnnounceResult> => {
  const result = await db.transaction(async (tx) => {
    const row = await tx
      .select({
        actorUri: ActivityPubActors.uri,
        instanceKind: Instances.kind,
        instanceState: Instances.state,
        postId: Posts.id,
        postState: Posts.state,
        profileId: Profiles.id,
        profileState: Profiles.state,
      })
      .from(ActivityPubPosts)
      .innerJoin(Posts, eq(Posts.id, ActivityPubPosts.postId))
      .innerJoin(Profiles, eq(Profiles.id, Posts.profileId))
      .innerJoin(Instances, eq(Instances.id, Profiles.instanceId))
      .innerJoin(ActivityPubActors, eq(ActivityPubActors.profileId, Profiles.id))
      .where(
        and(
          eq(ActivityPubPosts.uri, activityUri.href),
          isNull(Posts.currentContentId),
          isNotNull(Posts.repostSourceId),
        ),
      )
      .limit(1)
      .then(first);

    if (!row) {
      return null;
    }
    if (
      activityUri.origin !== actorUri.origin ||
      row.actorUri !== actorUri.href ||
      row.instanceKind !== InstanceKind.ACTIVITYPUB ||
      (row.instanceState !== InstanceState.ACTIVE &&
        row.instanceState !== InstanceState.UNRESPONSIVE) ||
      row.profileState !== ProfileState.ACTIVE ||
      row.postState !== PostState.ACTIVE
    ) {
      return { outcome: 'ignored' as const };
    }

    const deleted = await deletePost(
      {
        actorProfileId: row.profileId,
        origin: 'ACTIVITYPUB',
        postId: row.postId,
      },
      tx,
    );
    return { outcome: 'deleted' as const, postCommit: deleted.postCommit };
  });

  if (result?.outcome === 'deleted') {
    await result.postCommit();
  }

  return result?.outcome ?? null;
};

export const handleInboundUndo = async (
  context: InboxContext<FedifyExecutionContext>,
  undo: Undo,
): Promise<void> => {
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
    documentLoader: noNetworkDocumentLoader,
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

    const result = await unfollowProfile({
      followeeProfileId: localRecipient.id,
      followerProfileId: remoteActor.profile.id,
      onPostCommitError: (error) =>
        observeInbound({
          activityType: 'Undo',
          actorOrigin: actorUri.origin,
          error,
          handler: 'undo',
          objectOrigin: objectUri.origin,
          outcome: 'internal_failure',
          phase: 'effect',
          reasonCode: 'follow_undo_notification_effect_failed',
        }),
    });
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
    onPostCommitError: (error) =>
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
