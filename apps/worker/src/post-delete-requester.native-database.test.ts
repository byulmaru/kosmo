import '@kosmo/core/polyfill';

import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { test } from 'node:test';
import { TestWorkflowEnvironment } from '@temporalio/testing';
import { Worker } from '@temporalio/worker';
import { eq, inArray } from 'drizzle-orm';

const deferred = () => {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => {
    resolve = done;
  });
  return { promise, resolve };
};

test(
  '동시 Post 삭제는 요청 순서와 무관하게 각 Profile의 권한에 맞는 결과를 반환한다',
  { timeout: 120_000 },
  async (t) => {
    const environment = await TestWorkflowEnvironment.createLocal({
      server: { executable: { type: 'cached-download', version: 'v1.8.2' } },
    });
    process.env.TEMPORAL_ADDRESS = environment.address;
    process.env.TEMPORAL_NAMESPACE = environment.namespace ?? 'default';
    const { db, firstOrThrow, Instances, pg, PostContents, Posts, Profiles } =
      await import('@kosmo/core/db');
    const {
      InstanceKind,
      InstanceState,
      PostState,
      PostVisibility,
      ProfileFollowPolicy,
      ProfileState,
    } = await import('@kosmo/core/enums');
    const { PermissionDeniedError } = await import('@kosmo/core/error');
    const { postContentDocumentFromText } = await import('@kosmo/core/post-content/server');
    const { deletePost } = await import('@kosmo/core/services');
    const { temporalClient } = await import('@kosmo/core/temporal/client');
    const { KOSMO_TASK_QUEUE } = await import('@kosmo/core/temporal/task-queue');
    const production = await import('./activities/post-transition');
    const domain = `${randomUUID()}.example`;
    const instance = await db
      .insert(Instances)
      .values({ domain, kind: InstanceKind.ACTIVITYPUB, state: InstanceState.ACTIVE })
      .returning()
      .then(firstOrThrow);
    const profiles = await db
      .insert(Profiles)
      .values(
        ['author', 'other'].map((handle) => ({
          instanceId: instance.id,
          handle,
          normalizedHandle: handle,
          displayName: handle,
          state: ProfileState.ACTIVE,
          followPolicy: ProfileFollowPolicy.OPEN,
        })),
      )
      .returning();
    const [author, other] = profiles;
    assert.ok(author && other);
    const postIds: string[] = [];
    const contentIds: string[] = [];
    try {
      for (const origin of ['LOCAL', 'ACTIVITYPUB'] as const) {
        for (const unauthorizedFirst of [true, false]) {
          await t.test(
            `${origin}: ${unauthorizedFirst ? '다른 Profile' : '작성자'}가 먼저 요청`,
            async (t) => {
              const content = await db
                .insert(PostContents)
                .values({ document: postContentDocumentFromText('delete me') })
                .returning()
                .then(firstOrThrow);
              contentIds.push(content.id);
              const post = await db
                .insert(Posts)
                .values({
                  profileId: author.id,
                  currentContentId: content.id,
                  state: PostState.ACTIVE,
                  visibility: PostVisibility.PUBLIC,
                })
                .returning()
                .then(firstOrThrow);
              postIds.push(post.id);
              const verified = deferred();
              const release = deferred();
              const secondReached = deferred();
              const effects = deferred();
              let requests = 0;
              const execute = temporalClient.workflow.executeUpdateWithStart.bind(
                temporalClient.workflow,
              );
              // Observe transport dispatch without replacing Temporal admission or its retained result.
              const transport = t.mock.method(
                temporalClient.workflow,
                'executeUpdateWithStart',
                (...args: Parameters<typeof execute>) => {
                  if (++requests === 2) secondReached.resolve();
                  return execute(...args);
                },
              );
              const worker = await Worker.create({
                connection: environment.nativeConnection,
                namespace: environment.namespace,
                taskQueue: KOSMO_TASK_QUEUE,
                workflowsPath: new URL('./workflows/post-delete-mutation.ts', import.meta.url)
                  .pathname,
                activities: {
                  verifyPostDeletionActivity: async (
                    ...args: Parameters<typeof production.verifyPostDeletionActivity>
                  ) => {
                    const result = await production.verifyPostDeletionActivity(...args);
                    verified.resolve();
                    await release.promise;
                    return result;
                  },
                  deletePostTransitionActivity: production.deletePostTransitionActivity,
                  // Only external effects are stubbed; keep the run open for result recovery.
                  deletePostRelatedNotificationsActivity: async () => effects.promise,
                  sendLocalPostDeleteActivity: async () => {},
                  sendLocalPostQuoteRevocationsActivity: async () => {},
                  sendRepostUndoActivity: async () => {},
                },
              });
              try {
                await worker.runUntil(async () => {
                  try {
                    const invoke = (actorProfileId: string) =>
                      deletePost({ actorProfileId, postId: post.id, origin });
                    const unauthorized = unauthorizedFirst ? invoke(other.id) : undefined;
                    const authorized = invoke(author.id);
                    const denied = unauthorized ?? invoke(other.id);
                    // Before the fix both calls enter Temporal; after it the other Profile is rejected at entry.
                    void denied.then(secondReached.resolve, secondReached.resolve);
                    const results = Promise.allSettled([authorized, denied]);
                    await Promise.all([verified.promise, secondReached.promise]);
                    release.resolve();
                    const [ownerResult, otherResult] = await results;
                    assert.equal(ownerResult.status, 'fulfilled');
                    if (ownerResult.status === 'fulfilled')
                      assert.equal(ownerResult.value.postId, post.id);
                    assert.equal(otherResult.status, 'rejected');
                    if (otherResult.status === 'rejected')
                      assert.ok(otherResult.reason instanceof PermissionDeniedError);
                    assert.equal(
                      (
                        await db
                          .select()
                          .from(Posts)
                          .where(eq(Posts.id, post.id))
                          .then(firstOrThrow)
                      ).state,
                      PostState.DELETED,
                    );
                    // A retry while the success is retained still checks the new caller's permission.
                    await assert.rejects(invoke(other.id), PermissionDeniedError);
                    assert.equal((await invoke(author.id)).postId, post.id);
                    effects.resolve();
                    await environment.client.workflow
                      .getHandle(`post-delete-mutation:${post.id}`)
                      .result();
                  } finally {
                    release.resolve();
                    effects.resolve();
                  }
                });
              } finally {
                release.resolve();
                effects.resolve();
                transport.mock.restore();
              }
            },
          );
        }
      }
    } finally {
      await temporalClient.connection.close();
      await environment.teardown();
      await db.update(Posts).set({ currentContentId: null }).where(inArray(Posts.id, postIds));
      await db.delete(Posts).where(inArray(Posts.id, postIds));
      await db.delete(PostContents).where(inArray(PostContents.id, contentIds));
      await db.delete(Profiles).where(eq(Profiles.instanceId, instance.id));
      await db.delete(Instances).where(eq(Instances.id, instance.id));
      await pg.end();
    }
  },
);
