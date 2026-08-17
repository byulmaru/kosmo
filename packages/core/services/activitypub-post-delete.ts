import { and, eq, isNotNull, sql } from 'drizzle-orm';
import { ActivityPubActors, ActivityPubPosts, db, first, Instances, Posts, Profiles } from '../db';
import { InstanceKind, PostState } from '../enums';
import { temporalClient } from '../temporal/client';
import { POST_DELETE_WORKFLOW_TYPE, postDeleteWorkflowStartOptions } from '../temporal/post-delete';

export const deleteActivityPubPost = async ({
  actorUri,
  objectUri,
}: {
  readonly actorUri: string;
  readonly objectUri: string;
}): Promise<boolean> => {
  const result = await db.transaction(async (tx) => {
    const row = await tx
      .select({
        actorUri: ActivityPubActors.uri,
        instanceKind: Instances.kind,
        postId: Posts.id,
        profileId: Profiles.id,
      })
      .from(ActivityPubPosts)
      .innerJoin(Posts, eq(Posts.id, ActivityPubPosts.postId))
      .innerJoin(Profiles, eq(Profiles.id, Posts.profileId))
      .innerJoin(Instances, eq(Instances.id, Profiles.instanceId))
      .innerJoin(ActivityPubActors, eq(ActivityPubActors.profileId, Profiles.id))
      .where(and(eq(ActivityPubPosts.uri, objectUri), isNotNull(Posts.currentContentId)))
      .limit(1)
      .then(first);

    if (!row || row.actorUri !== actorUri || row.instanceKind !== InstanceKind.ACTIVITYPUB) {
      return null;
    }

    const deleted = await tx
      .update(Posts)
      .set({ deletedAt: sql`now()`, state: PostState.DELETED })
      .where(
        and(
          eq(Posts.id, row.postId),
          eq(Posts.profileId, row.profileId),
          eq(Posts.state, PostState.ACTIVE),
          isNotNull(Posts.currentContentId),
        ),
      )
      .returning({ id: Posts.id })
      .then(first);

    return { deleted: deleted !== undefined, postId: row.postId };
  });

  if (result?.deleted) {
    const workflowInput = {
      postId: result.postId,
      origin: 'ACTIVITYPUB' as const,
    };
    try {
      await temporalClient.withDeadline(Date.now() + 5_000, () =>
        temporalClient.workflow.start(
          POST_DELETE_WORKFLOW_TYPE,
          postDeleteWorkflowStartOptions(workflowInput),
        ),
      );
    } catch (error) {
      console.error('Post Delete Workflow start failed', {
        error,
        origin: workflowInput.origin,
        postId: workflowInput.postId,
      });
    }
  }

  return result !== null;
};
