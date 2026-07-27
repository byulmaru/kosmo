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
  findOrMaterializeRemoteProfileActorByUri,
  findUsableStoredRemoteProfileActorByUri,
  RemoteActorMaterializationError,
} from './remote-actor-materialization';
import type { InboxContext } from '@fedify/fedify';
import type { Recipient, Undo } from '@fedify/vocab';

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
  context: InboxContext<void>,
  follow: Follow,
  now: Temporal.Instant = getNow(),
): Promise<void> => {
  const actorUri = follow.actorId;
  const objectUri = follow.objectId;

  if (!isHttpUri(actorUri) || !isHttpUri(objectUri)) {
    return;
  }

  // Local validation intentionally precedes every remote lookup.
  const localRecipient = await resolveInboundLocalRecipient(context, objectUri);
  if (!localRecipient) {
    return;
  }

  let remoteActor: Awaited<ReturnType<typeof findOrMaterializeRemoteProfileActorByUri>>;

  try {
    remoteActor = await findOrMaterializeRemoteProfileActorByUri({ actorUri, context, now });
  } catch (error) {
    if (isExpectedRemoteActorRejection(error)) {
      return;
    }

    throw error;
  }

  const result = await followProfile({
    followeeProfileId: localRecipient.id,
    followerProfileId: remoteActor.profile.id,
  });

  if (result.result.kind !== 'ESTABLISHED') {
    return;
  }

  const recipientActor = toRecipient(remoteActor.actor);
  if (!recipientActor) {
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
  }
};

const noNetworkDocumentLoader = async (url: string) => {
  throw new Error(`Network lookup is disabled for inbound Undo: ${url}`);
};

const handleInboundUndoAnnounce = async (undo: Undo, actorUri: URL): Promise<boolean> => {
  const activityUri = undo.objectId;
  if (!isHttpUri(activityUri)) {
    return false;
  }

  return db.transaction(async (tx) => {
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
      .for('update', { of: ActivityPubPosts })
      .then(first);

    if (!row) {
      return false;
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
      return true;
    }

    await deletePost({ actorProfileId: row.profileId, postId: row.postId }, tx);
    return true;
  });
};

export const handleInboundUndo = async (context: InboxContext<void>, undo: Undo): Promise<void> => {
  const actorHref = uniqueHref(undo.actorIds);
  const actorUri = actorHref ? new URL(actorHref) : null;
  if (!isHttpUri(actorUri)) {
    return;
  }

  if (await handleInboundUndoAnnounce(undo, actorUri)) {
    return;
  }

  // Undo never materializes or dereferences an unknown actor.
  let remoteActor: Awaited<ReturnType<typeof findUsableStoredRemoteProfileActorByUri>>;

  try {
    remoteActor = await findUsableStoredRemoteProfileActorByUri(actorUri);
  } catch (error) {
    if (isExpectedRemoteActorRejection(error)) {
      return;
    }

    throw error;
  }

  if (!remoteActor || remoteActor.instance.state !== InstanceState.ACTIVE) {
    return;
  }

  const embedded = await undo.getObject({
    documentLoader: noNetworkDocumentLoader,
    suppressError: true,
  });
  if (embedded instanceof Follow) {
    const objectUri = embedded.objectId;
    if (!isHttpUri(objectUri) || uniqueHref(embedded.actorIds) !== actorUri.href) {
      return;
    }

    const localRecipient = await resolveInboundLocalRecipient(context, objectUri);
    if (!localRecipient) {
      return;
    }

    await unfollowProfile({
      followeeProfileId: localRecipient.id,
      followerProfileId: remoteActor.profile.id,
    });
    return;
  }

  if (embedded !== null && !(embedded instanceof Like) && !(embedded instanceof EmojiReact)) {
    return;
  }

  const activityUri = embedded?.id ?? undo.objectId;
  if (
    !isHttpUri(activityUri) ||
    ((embedded instanceof Like || embedded instanceof EmojiReact) &&
      uniqueHref(embedded.actorIds) !== actorUri.href)
  ) {
    return;
  }

  await undoInboundReaction({ activityUri: activityUri.href, actorUri: actorUri.href });
};
