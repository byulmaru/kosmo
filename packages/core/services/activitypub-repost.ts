import { and, eq, isNotNull, isNull, or, sql } from 'drizzle-orm';
import { ActivityPubPosts, db, first, Posts } from '../db';
import { PostState } from '../enums';
import { ValidationError } from '../error';
import { temporalClient } from '../temporal/client';
import { POST_REPOST_WORKFLOW_TYPE, postRepostWorkflowStartOptions } from '../temporal/post-repost';
import {
  REPOST_DELETE_WORKFLOW_TYPE,
  repostDeleteWorkflowStartOptions,
} from '../temporal/repost-delete';
import { materializeRepostInTransaction } from './post';
import type { Transaction } from '../db';

type ActivityPubRepostInput = {
  readonly activityUri: string;
  readonly actorProfileId: string;
  readonly publishedAt: Temporal.Instant | null;
  readonly receivedAt: Temporal.Instant;
  readonly sourcePostId: string;
};

type ActivityPubRepostMapping = {
  readonly activityUri: string;
  readonly actorProfileId: string;
  readonly postId: string;
  readonly publishedAt: Temporal.Instant | null;
  readonly receivedAt: Temporal.Instant;
  readonly sourcePostId: string;
};

const saveCurrentAnnounce = async (
  tx: Transaction,
  {
    activityUri,
    actorProfileId,
    postId,
    publishedAt,
    receivedAt,
    sourcePostId,
  }: ActivityPubRepostMapping,
): Promise<boolean> => {
  const existing = await tx
    .select({
      currentContentId: Posts.currentContentId,
      mappingId: ActivityPubPosts.id,
      postId: ActivityPubPosts.postId,
      postProfileId: Posts.profileId,
      postRepostSourceId: Posts.repostSourceId,
      postState: Posts.state,
      replyParentId: Posts.replyParentId,
      uri: ActivityPubPosts.uri,
    })
    .from(ActivityPubPosts)
    .innerJoin(Posts, eq(Posts.id, ActivityPubPosts.postId))
    .where(or(eq(ActivityPubPosts.postId, postId), eq(ActivityPubPosts.uri, activityUri)));

  const current = existing.find((row) => row.postId === postId);
  const collision = existing.find((row) => row.uri === activityUri && row.postId !== postId);
  if (collision) {
    const isPriorDeletedGeneration =
      collision.postProfileId === actorProfileId &&
      collision.postRepostSourceId === sourcePostId &&
      collision.currentContentId === null &&
      collision.replyParentId === null &&
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

  if (
    current.postState !== PostState.ACTIVE ||
    current.currentContentId !== null ||
    current.replyParentId !== null ||
    current.postRepostSourceId !== sourcePostId
  ) {
    return false;
  }

  await tx
    .update(ActivityPubPosts)
    .set({ publishedAt, receivedAt, uri: activityUri })
    .where(eq(ActivityPubPosts.id, current.mappingId));
  return true;
};

export const materializeActivityPubRepost = async ({
  activityUri,
  actorProfileId,
  publishedAt,
  receivedAt,
  sourcePostId,
}: ActivityPubRepostInput) => {
  const result = await db.transaction(async (tx) => {
    let materialized = await materializeRepostInTransaction(tx, {
      actorProfileId,
      sourcePostId,
    });

    const save = (postId: string) =>
      saveCurrentAnnounce(tx, {
        activityUri,
        actorProfileId,
        postId,
        publishedAt,
        receivedAt,
        sourcePostId,
      });

    if (!(await save(materialized.repost.id))) {
      materialized = await materializeRepostInTransaction(tx, {
        actorProfileId,
        sourcePostId,
      });
      if (!(await save(materialized.repost.id))) {
        throw new Error('Active Repost not found after current Announce materialization');
      }
    }

    return materialized;
  });

  if (result.created) {
    const workflowInput = { origin: 'ACTIVITYPUB' as const, postId: result.repost.id };
    try {
      await temporalClient.withDeadline(Date.now() + 5_000, () =>
        temporalClient.workflow.start(
          POST_REPOST_WORKFLOW_TYPE,
          postRepostWorkflowStartOptions(workflowInput),
        ),
      );
    } catch (error) {
      console.error('Post Repost Workflow start failed', {
        error,
        origin: workflowInput.origin,
        postId: workflowInput.postId,
      });
    }
  }

  return result;
};

export type UndoActivityPubRepostResult =
  | {
      readonly outcome: 'deleted';
      readonly repostId: string;
    }
  | { readonly outcome: 'ignored' }
  | null;

export const undoActivityPubRepost = async ({
  activityUri,
  actorProfileId,
}: {
  readonly activityUri: string;
  readonly actorProfileId: string;
}): Promise<UndoActivityPubRepostResult> => {
  const result = await db.transaction(async (tx) => {
    const mapping = await tx
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
      .where(eq(ActivityPubPosts.uri, activityUri))
      .limit(1)
      .then(first);

    if (!mapping) {
      return null;
    }

    if (
      mapping.profileId !== actorProfileId ||
      mapping.currentContentId !== null ||
      mapping.replyParentId !== null ||
      mapping.repostSourceId === null ||
      mapping.state !== PostState.ACTIVE
    ) {
      return { outcome: 'ignored' as const };
    }

    const deleted = await tx
      .update(Posts)
      .set({ deletedAt: sql`now()`, state: PostState.DELETED })
      .where(
        and(
          eq(Posts.id, mapping.id),
          eq(Posts.profileId, actorProfileId),
          eq(Posts.state, PostState.ACTIVE),
          isNull(Posts.currentContentId),
          isNull(Posts.replyParentId),
          isNotNull(Posts.repostSourceId),
        ),
      )
      .returning({
        id: Posts.id,
      })
      .then(first);
    if (!deleted) {
      return { outcome: 'ignored' as const };
    }

    return { outcome: 'deleted' as const, repostId: deleted.id };
  });

  if (result?.outcome === 'deleted') {
    // The ActivityPub Undo does not produce a new outbound Undo. The Workflow
    // still owns Notification cleanup for the committed remote transition.
    const workflowInput = { postId: result.repostId, origin: 'ACTIVITYPUB' as const };
    try {
      await temporalClient.withDeadline(Date.now() + 5_000, () =>
        temporalClient.workflow.start(
          REPOST_DELETE_WORKFLOW_TYPE,
          repostDeleteWorkflowStartOptions(workflowInput),
        ),
      );
    } catch (error) {
      console.error('Repost Delete Workflow start failed', {
        error,
        origin: workflowInput.origin,
        postId: workflowInput.postId,
      });
    }
  }

  return result;
};
