import '@kosmo/core/polyfill';

import { ActivityPubPosts, db, first, isUniqueViolation, Posts } from '@kosmo/core/db';
import { InstanceState, PostState } from '@kosmo/core/enums';
import { NotFoundError, PermissionDeniedError, ValidationError } from '@kosmo/core/error';
import { repostPost } from '@kosmo/core/services';
import { eq, or } from 'drizzle-orm';
import { resolveActivityPubPostId } from './activitypub-post-uri';
import { isHttpUri, uniqueHref } from './activitypub-uri';
import { findStoredRemoteProfileActorByUri } from './remote-actor-materialization';
import type { InboxContext } from '@fedify/fedify';
import type { Announce } from '@fedify/vocab';
import type { Transaction } from '@kosmo/core/db';

const isExpectedRepostRejection = (error: unknown): boolean =>
  error instanceof NotFoundError ||
  error instanceof PermissionDeniedError ||
  error instanceof ValidationError ||
  Boolean(isUniqueViolation(error));

const saveCurrentAnnounce = async (
  tx: Transaction,
  {
    activityUri,
    actorProfileId,
    postId,
    publishedAt,
    receivedAt,
    sourcePostId,
  }: {
    activityUri: string;
    actorProfileId: string;
    postId: string;
    publishedAt: Temporal.Instant | null;
    receivedAt: Temporal.Instant;
    sourcePostId: string;
  },
): Promise<boolean> => {
  const existing = await tx
    .select({
      currentContentId: Posts.currentContentId,
      mappingId: ActivityPubPosts.id,
      postId: ActivityPubPosts.postId,
      postProfileId: Posts.profileId,
      postRepostSourceId: Posts.repostSourceId,
      postState: Posts.state,
      uri: ActivityPubPosts.uri,
    })
    .from(ActivityPubPosts)
    .innerJoin(Posts, eq(Posts.id, ActivityPubPosts.postId))
    .where(or(eq(ActivityPubPosts.postId, postId), eq(ActivityPubPosts.uri, activityUri)))
    .orderBy(ActivityPubPosts.id)
    .for('update', { of: ActivityPubPosts });

  const current = existing.find((row) => row.postId === postId);
  const collision = existing.find((row) => row.uri === activityUri && row.postId !== postId);
  if (collision) {
    const isPriorDeletedGeneration =
      collision.postProfileId === actorProfileId &&
      collision.postRepostSourceId === sourcePostId &&
      collision.currentContentId === null &&
      collision.postState === PostState.DELETED;
    if (!isPriorDeletedGeneration) {
      throw new ValidationError('Announce id is already assigned', { field: 'id' });
    }

    await tx.delete(ActivityPubPosts).where(eq(ActivityPubPosts.id, collision.mappingId));
  }

  if (!current) {
    await tx.insert(ActivityPubPosts).values({
      postId,
      publishedAt,
      receivedAt,
      uri: activityUri,
    });
    return true;
  }

  const post = await tx
    .select({ state: Posts.state })
    .from(Posts)
    .where(eq(Posts.id, postId))
    .limit(1)
    .then(first);
  if (post?.state !== PostState.ACTIVE) {
    return false;
  }

  await tx
    .update(ActivityPubPosts)
    .set({ publishedAt, receivedAt, uri: activityUri })
    .where(eq(ActivityPubPosts.id, current.mappingId));
  return true;
};

export const handleInboundAnnounce = async (
  _context: InboxContext<void>,
  announce: Announce,
  receivedAt: Temporal.Instant = Temporal.Now.instant(),
): Promise<void> => {
  const activityUri = announce.id;
  const actorHref = uniqueHref(announce.actorIds);
  const objectHref = uniqueHref(announce.objectIds);

  if (!isHttpUri(activityUri) || !actorHref || !objectHref) {
    return;
  }

  const actorUri = new URL(actorHref);
  const objectUri = new URL(objectHref);
  if (activityUri.origin !== actorUri.origin) {
    return;
  }

  const storedActor = await findStoredRemoteProfileActorByUri(actorUri);
  if (
    !storedActor ||
    (storedActor.instance.state !== InstanceState.ACTIVE &&
      storedActor.instance.state !== InstanceState.UNRESPONSIVE)
  ) {
    return;
  }

  const sourcePostId = await resolveActivityPubPostId(objectUri);
  if (!sourcePostId) {
    return;
  }

  try {
    await db.transaction(async (tx) => {
      let result = await repostPost({ actorProfileId: storedActor.profile.id, sourcePostId }, tx);
      const save = (postId: string) =>
        saveCurrentAnnounce(tx, {
          activityUri: activityUri.href,
          actorProfileId: storedActor.profile.id,
          postId,
          publishedAt: announce.published,
          receivedAt,
          sourcePostId,
        });

      if (!(await save(result.repost.id))) {
        result = await repostPost({ actorProfileId: storedActor.profile.id, sourcePostId }, tx);
        if (!(await save(result.repost.id))) {
          throw new Error('Active Repost not found after current Announce retry');
        }
      }
    });
  } catch (error) {
    if (!isExpectedRepostRejection(error)) {
      throw error;
    }
  }
};
