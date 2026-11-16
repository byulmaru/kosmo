import '@kosmo/core/polyfill';

import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mock, test } from 'node:test';
import {
  ActivityPubActors,
  ActivityPubPosts,
  db,
  firstOrThrow,
  Instances,
  Media,
  pg,
  PostContents,
  Posts,
  ProfileBlocks,
  ProfileFollows,
  Profiles,
} from '@kosmo/core/db';
import {
  ActivityPubActorType,
  InstanceKind,
  InstanceState,
  PostQuoteConsentStatus,
  PostState,
  PostVisibility,
  ProfileFollowPolicy,
  ProfileState,
} from '@kosmo/core/enums';
import { postContentDocumentFromText } from '@kosmo/core/post-content/server';
import { WorkflowClient, WorkflowExecutionAlreadyStartedError } from '@temporalio/client';
import { TestWorkflowEnvironment } from '@temporalio/testing';
import { Worker } from '@temporalio/worker';
import { eq, sql } from 'drizzle-orm';
import type {
  PreparedQuoteConsent,
  QuoteOwnerCommand,
} from '@kosmo/core/temporal/post-quote-owner';
import type { QuoteWriteInput } from './activities/quote-owner';

// Protocol proof is supplied at the Activity boundary. Real owner/transaction/fence/CAS execute.
test(
  'private Source owner atomically persists Media and rolls back fence/CAS/follower/URI races',
  { timeout: 120000 },
  async (t) => {
    const env = await TestWorkflowEnvironment.createLocal({
      server: { executable: { type: 'cached-download', version: 'v1.8.2' } },
    });
    process.env.TEMPORAL_ADDRESS = env.address;
    process.env.TEMPORAL_NAMESPACE = env.namespace ?? 'default';
    const production = await import('./activities/quote-owner');
    const activities = await import('./activities');
    const { temporalClient } = await import('@kosmo/core/temporal/client');
    const taskQueue = `private-source-${randomUUID()}`;
    const preparations = new Map<string, PreparedQuoteConsent>();
    const mutations = new Map<string, () => Promise<void>>();
    const results = new Map<
      string,
      Awaited<ReturnType<typeof production.applyQuoteConsentActivity>>
    >();
    const failures = new Set<string>();
    const lost = new Set<string>();
    const uncertain = new Set<string>();
    const transientProofs = new Set<string>();
    let afterFence: (() => Promise<void>) | undefined;
    let failFence = false;
    let rollbackObserved = false;
    let effectCount = 0;
    const originalGetHandle = WorkflowClient.prototype.getHandle;
    const fence = mock.method(
      WorkflowClient.prototype,
      'getHandle',
      function (this: WorkflowClient, ...args: Parameters<typeof originalGetHandle>) {
        const handle = originalGetHandle.apply(this, args);
        const query = handle.query.bind(handle);
        return Object.assign(handle, {
          query: async (...queryArgs: Parameters<typeof query>) => {
            if (queryArgs[0] === 'quoteOwnerWork' && failFence) {
              failFence = false;
              throw new Error('Simulated owner Query timeout');
            }
            const result = await query(...queryArgs);
            if (queryArgs[0] === 'quoteOwnerWork' && afterFence) {
              const mutation = afterFence;
              afterFence = undefined;
              await mutation();
            }
            return result;
          },
        });
      },
    );
    const worker = await Worker.create({
      connection: env.nativeConnection,
      namespace: env.namespace,
      taskQueue,
      workflowsPath: new URL('./workflows/index.ts', import.meta.url).pathname,
      activities: {
        ...activities,
        materializeQuoteOwnerSourceActivity: async () => {},
        prepareQuoteConsentActivity: async (
          command: QuoteOwnerCommand,
          phase: 'INVALIDATE' | 'VERIFY',
        ) => {
          if (phase === 'INVALIDATE') {
            return { kind: 'NOOP', retryable: false };
          }
          const mutation = mutations.get(command.postId);
          mutations.delete(command.postId);
          await mutation?.();
          if (uncertain.has(command.postId)) {
            if (transientProofs.delete(command.postId)) {
              return { kind: 'NOOP', retryable: true };
            }
            const original = preparations.get(command.postId)!;
            assert.equal(original.kind, 'CHANGE');
            if (
              original.kind === 'CHANGE' &&
              original.privateSource &&
              original.change.operation === 'RESOLVE' &&
              original.change.result === 'APPROVED' &&
              original.change.proof.kind === 'AUTHORIZATION'
            ) {
              return {
                kind: 'CHANGE',
                retryable: false,
                change: {
                  ...original.change,
                  expectedStatus: PostQuoteConsentStatus.APPROVED,
                  expectedApprovalUri: original.change.proof.approvalUri,
                  expectedRepostSourceId: original.privateSource.postId,
                },
              };
            }
          }
          return preparations.get(command.postId)!;
        },
        applyQuoteConsentActivity: async (input: QuoteWriteInput) => {
          try {
            const result = await production.applyQuoteConsentActivity(input);
            results.set(input.command.postId, result);
            if (result.uncertainCommit) {
              uncertain.add(input.command.postId);
            }
            if (lost.delete(input.command.postId)) {
              throw new Error('Simulated committed response loss');
            }
            return result;
          } catch (error) {
            if (failures.delete(input.command.postId)) {
              const prepared = input.prepared;
              assert.equal(prepared.kind, 'CHANGE');
              if (prepared.kind === 'CHANGE' && prepared.privateSource) {
                assert.equal(
                  await db.$count(
                    ActivityPubPosts,
                    eq(ActivityPubPosts.uri, prepared.privateSource.objectUri),
                  ),
                  0,
                );
                assert.equal(
                  await db.$count(Media, eq(Media.url, prepared.privateSource.media[0]!.url)),
                  0,
                );
                assert.equal(
                  await db.$count(Posts, eq(Posts.id, prepared.privateSource.postId)),
                  0,
                );
                rollbackObserved = true;
              }
            }
            throw error;
          }
        },
        sendQuoteOwnerEffectActivity: production.sendQuoteOwnerEffectActivity,
        sendLocalPostQuoteRevocationsActivity: async () => {},
      },
    });
    const sourceStarts = mock.method(temporalClient.workflow, 'start', async () => {
      effectCount++;
      return {} as never;
    });
    const running = worker.run();
    const instanceIds: string[] = [];
    const handles: ReturnType<typeof env.client.workflow.getHandle>[] = [];
    const fixture = async () => {
      const domain = `${randomUUID()}.example`;
      const remote = await db
        .insert(Instances)
        .values({ domain, kind: InstanceKind.ACTIVITYPUB, state: InstanceState.ACTIVE })
        .returning()
        .then(firstOrThrow);
      const local = await db
        .insert(Instances)
        .values({
          domain: `local-${domain}`,
          kind: InstanceKind.LOCAL,
          canonicalOrigin: `https://local-${domain}`,
          state: InstanceState.ACTIVE,
        })
        .returning()
        .then(firstOrThrow);
      instanceIds.push(remote.id, local.id);
      const profile = async (name: string, instanceId = remote.id) =>
        db
          .insert(Profiles)
          .values({
            instanceId,
            handle: name,
            normalizedHandle: name,
            displayName: name,
            state: ProfileState.ACTIVE,
            followPolicy: ProfileFollowPolicy.OPEN,
          })
          .returning()
          .then(firstOrThrow);
      const source = await profile('source');
      const author = await profile('quote');
      const follower = await profile('follower', local.id);
      const sourceActor = `https://${domain}/actors/source`;
      const quoteActor = `https://${domain}/actors/quote`;
      const followersUri = `${sourceActor}/followers`;
      await db.insert(ActivityPubActors).values([
        { profileId: source.id, uri: sourceActor, followersUri, type: ActivityPubActorType.PERSON },
        { profileId: author.id, uri: quoteActor, type: ActivityPubActorType.PERSON },
      ]);
      await db
        .insert(ProfileFollows)
        .values({ followerProfileId: follower.id, followeeProfileId: source.id });
      const content = await db
        .insert(PostContents)
        .values({
          postId: null,
          document: postContentDocumentFromText('kept authored Quote link https://kept.example'),
        })
        .returning()
        .then(firstOrThrow);
      const quote = await db
        .insert(Posts)
        .values({
          profileId: author.id,
          currentContentId: content.id,
          visibility: PostVisibility.PUBLIC,
          state: PostState.ACTIVE,
        })
        .returning()
        .then(firstOrThrow);
      const quoteUri = `https://${domain}/notes/quote`;
      const sourceUri = `https://${domain}/notes/source`;
      await db
        .insert(ActivityPubPosts)
        .values({ postId: quote.id, uri: quoteUri, receivedAt: Temporal.Now.instant() });
      const sourceId = randomUUID();
      const mediaUrl = `https://${domain}/image.png`;
      const prepared: PreparedQuoteConsent = {
        kind: 'CHANGE',
        retryable: false,
        privateSource: {
          postId: sourceId,
          profileId: source.id,
          actorUri: sourceActor,
          followersUri,
          followerProfileId: follower.id,
          objectUri: sourceUri,
          document: postContentDocumentFromText('private Source'),
          media: [{ altText: 'private image', mediaType: 'image/png', url: mediaUrl }],
          mentionProfileIds: [],
          publishedAt: null,
          receivedAt: Temporal.Now.instant().toString(),
          visibility: PostVisibility.FOLLOWERS,
        },
        change: {
          operation: 'RESOLVE',
          result: 'APPROVED',
          quoteAuthorActorUri: quoteActor,
          expectedStatus: null,
          expectedApprovalUri: null,
          expectedRepostSourceId: null,
          quote: {
            postId: quote.id,
            profileId: author.id,
            uri: quoteUri,
            authorActorUri: quoteActor,
          },
          source: {
            postId: sourceId,
            profileId: source.id,
            uri: sourceUri,
            authorActorUri: sourceActor,
          },
          proof: {
            kind: 'AUTHORIZATION',
            issuerActorUri: sourceActor,
            approvalUri: `https://${domain}/authorization`,
          },
        },
      };
      preparations.set(quote.id, prepared);
      const command: QuoteOwnerCommand = {
        kind: 'NOTE',
        postId: quote.id,
        commandId: randomUUID(),
        actorUri: quoteActor,
        targetUri: sourceUri,
        format: 'FEP_044F',
        approvalUri: `https://${domain}/authorization`,
        authorizationUpdate: false,
        duplicateCreate: false,
        embeddedSource: {},
      };
      const handle = await env.client.workflow.start('postQuoteOwnerWorkflow', {
        workflowId: `post-quote:${quote.id}`,
        taskQueue,
        args: [{ postId: quote.id }],
      });
      handles.push(handle);
      return {
        quote,
        content,
        source,
        author,
        follower,
        local,
        remote,
        command,
        handle,
        sourceId,
        sourceUri,
        mediaUrl,
        prepared,
      };
    };
    try {
      for (const mode of [
        'success',
        'parent-already-deleted',
        'parent-deleted-after-preparation',
        'parent-profile-blocked',
        'parent-with-invalid-media',
        'fence-timeout',
        'cas-revoke',
        'unfollow',
        'unfollow-after-fence',
        'inactive-follower',
        'inactive-instance',
        'uri-author',
        'uri-public',
        'response-loss',
        'response-loss-transient',
      ] as const) {
        await t.test(mode, async () => {
          const f = await fixture();
          const parentMode = mode.startsWith('parent-');
          if (parentMode) {
            const { createPostPersisted, deletePostPersisted } =
              await import('../../../packages/core/services/post');
            const parent = await createPostPersisted({
              document: postContentDocumentFromText('private Source Reply Parent'),
              mentionProfileIds: [],
              objectUri: `${f.sourceUri}/parent`,
              origin: 'ACTIVITYPUB',
              profileId: f.author.id,
              publishedAt: null,
              receivedAt: Temporal.Now.instant(),
              visibility: PostVisibility.PUBLIC,
            });
            assert.ok(parent.created);
            const removeParent = async () => {
              await deletePostPersisted({
                actorProfileId: f.author.id,
                origin: 'ACTIVITYPUB',
                postId: parent.post.id,
              });
            };
            if (mode === 'parent-already-deleted') {
              await removeParent();
            }
            assert.ok(f.prepared.kind === 'CHANGE' && f.prepared.privateSource);
            const source = f.prepared.privateSource;
            preparations.set(f.quote.id, {
              ...f.prepared,
              privateSource: {
                ...source,
                replyParentId: parent.post.id,
                ...(mode === 'parent-with-invalid-media'
                  ? { media: Array.from({ length: 5 }, () => source.media[0]!) }
                  : {}),
              },
            });
            if (mode === 'parent-deleted-after-preparation') {
              // The already-prepared proof retains the Active Parent ID until the write.
              mutations.set(f.quote.id, removeParent);
            }
            if (mode === 'parent-profile-blocked') {
              await db.insert(ProfileBlocks).values({
                ownerProfileId: f.source.id,
                targetProfileId: f.author.id,
              });
            }
          }
          const beforeContent = await db.$count(PostContents);
          const beforeMedia = await db.$count(Media);
          const beforeEffects = effectCount;
          if (mode === 'fence-timeout') {
            failFence = true;
            failures.add(f.quote.id);
          }
          if (mode === 'response-loss' || mode === 'response-loss-transient') {
            lost.add(f.quote.id);
            if (mode === 'response-loss-transient') {
              transientProofs.add(f.quote.id);
            }
          }
          if (mode === 'cas-revoke') {
            mutations.set(f.quote.id, async () => {
              await db
                .update(Posts)
                .set({ quoteConsentStatus: PostQuoteConsentStatus.REVOKED })
                .where(eq(Posts.id, f.quote.id));
            });
          }
          if (mode === 'unfollow-after-fence') {
            afterFence = async () => {
              await db
                .delete(ProfileFollows)
                .where(eq(ProfileFollows.followerProfileId, f.follower.id));
            };
          }
          if (mode === 'unfollow') {
            mutations.set(f.quote.id, async () => {
              await db
                .delete(ProfileFollows)
                .where(eq(ProfileFollows.followerProfileId, f.follower.id));
            });
          }
          if (mode === 'inactive-follower') {
            mutations.set(f.quote.id, async () => {
              await db
                .update(Profiles)
                .set({ state: ProfileState.DISABLED })
                .where(eq(Profiles.id, f.follower.id));
            });
          }
          if (mode === 'inactive-instance') {
            mutations.set(f.quote.id, async () => {
              await db
                .update(Instances)
                .set({ state: InstanceState.SUSPENDED })
                .where(eq(Instances.id, f.local.id));
            });
          }
          if (mode === 'uri-author' || mode === 'uri-public') {
            mutations.set(f.quote.id, async () => {
              const post = await db
                .insert(Posts)
                .values({
                  profileId: mode === 'uri-author' ? f.author.id : f.source.id,
                  currentContentId: f.content.id,
                  visibility:
                    mode === 'uri-author' ? PostVisibility.FOLLOWERS : PostVisibility.PUBLIC,
                  state: PostState.ACTIVE,
                })
                .returning()
                .then(firstOrThrow);
              await db
                .insert(ActivityPubPosts)
                .values({ postId: post.id, uri: f.sourceUri, receivedAt: Temporal.Now.instant() });
            });
          }
          const result = await f.handle.executeUpdate('quoteCommand', { args: [f.command] });
          const row = await db
            .select()
            .from(Posts)
            .where(eq(Posts.id, f.quote.id))
            .then(firstOrThrow);
          assert.equal(row.currentContentId, f.content.id);
          assert.deepEqual(
            (
              await db
                .select()
                .from(PostContents)
                .where(eq(PostContents.id, f.content.id))
                .then(firstOrThrow)
            ).document,
            f.content.document,
          );
          if (
            mode === 'success' ||
            mode === 'parent-already-deleted' ||
            mode === 'parent-deleted-after-preparation' ||
            mode === 'fence-timeout' ||
            mode === 'response-loss' ||
            mode === 'response-loss-transient'
          ) {
            assert.equal(row.quoteConsentStatus, PostQuoteConsentStatus.APPROVED);
            assert.equal(row.repostSourceId, f.sourceId);
            if (parentMode) {
              const source = await db
                .select()
                .from(Posts)
                .where(eq(Posts.id, f.sourceId))
                .then(firstOrThrow);
              assert.equal(source.replyParentId, null);
              assert.equal(await db.$count(PostContents, eq(PostContents.postId, f.sourceId)), 1);
              assert.equal(await db.$count(PostContents), beforeContent + 1);
              assert.equal(await db.$count(Media), beforeMedia + 1);
            }
            assert.equal(await db.$count(Media, eq(Media.url, f.mediaUrl)), 1);
            assert.equal(
              await db.$count(ActivityPubPosts, eq(ActivityPubPosts.uri, f.sourceUri)),
              1,
            );
            if (mode === 'fence-timeout') {
              assert.equal(rollbackObserved, true);
            }
            if (mode === 'response-loss' || mode === 'response-loss-transient') {
              assert.equal(uncertain.has(f.quote.id), true);
              const deadline = Date.now() + 3000;
              while (effectCount < beforeEffects + 1 && Date.now() < deadline) {
                await new Promise((resolve) => setTimeout(resolve, 20));
              }
              assert.equal(effectCount, beforeEffects + 1);
              assert.equal(results.get(f.quote.id)?.sourcePostId, f.sourceId);
              assert.ok(result);
              if (mode === 'response-loss-transient') {
                const next = await f.handle.executeUpdate('quoteCommand', {
                  args: [{ ...f.command, commandId: randomUUID() }],
                });
                assert.ok(next);
                assert.equal(effectCount, beforeEffects + 1);
                assert.equal(
                  await db.$count(ActivityPubPosts, eq(ActivityPubPosts.uri, f.sourceUri)),
                  1,
                );
                assert.equal(await db.$count(Media, eq(Media.url, f.mediaUrl)), 1);
              }
            } else {
              const committed = results.get(f.quote.id)!;
              assert.equal(committed.privateSourceCreatedId, f.sourceId);
              const deadline = Date.now() + 3000;
              while (effectCount < beforeEffects + 1 && Date.now() < deadline) {
                await new Promise((resolve) => setTimeout(resolve, 20));
              }
              assert.equal(effectCount, beforeEffects + 1);
              if (mode === 'success') {
                const calls: string[] = [];
                let fail = true;
                const start = mock.method(
                  temporalClient.workflow,
                  'start',
                  async (_name: string, options: { workflowId?: string }) => {
                    calls.push(options.workflowId!);
                    if (fail) {
                      fail = false;
                      throw new Error('effect startup outage');
                    }
                    return {} as never;
                  },
                );
                try {
                  await assert.rejects(
                    production.sendQuoteOwnerEffectActivity(f.command, committed, 'stable-effect'),
                  );
                  await production.sendQuoteOwnerEffectActivity(
                    f.command,
                    committed,
                    'stable-effect',
                  );
                  assert.deepEqual(calls, [
                    `post-create-effects:${f.sourceId}`,
                    `post-create-effects:${f.sourceId}`,
                  ]);
                  start.mock.restore();
                  const completed = mock.method(temporalClient.workflow, 'start', async () => {
                    throw new WorkflowExecutionAlreadyStartedError(
                      'Source effect already completed',
                      `post-create-effects:${f.sourceId}`,
                      'postCreateEffectsWorkflow',
                    );
                  });
                  try {
                    await production.sendQuoteOwnerEffectActivity(
                      f.command,
                      committed,
                      'stable-effect',
                    );
                  } finally {
                    completed.mock.restore();
                  }
                } finally {
                  start.mock.restore();
                }
              }
            }
          } else {
            assert.equal(row.repostSourceId, null);
            assert.equal(
              row.quoteConsentStatus,
              mode === 'cas-revoke' ? PostQuoteConsentStatus.REVOKED : null,
            );
            assert.equal(await db.$count(Posts, eq(Posts.id, f.sourceId)), 0);
            assert.equal(await db.$count(PostContents), beforeContent);
            assert.equal(await db.$count(Media), beforeMedia);
            assert.equal(effectCount, beforeEffects);
            if (mode === 'parent-profile-blocked') {
              assert.equal(results.get(f.quote.id)?.error?.code, 'NOT_FOUND');
            }
            if (mode === 'parent-with-invalid-media') {
              assert.equal(results.get(f.quote.id)?.error?.code, 'VALIDATION');
              assert.equal(results.get(f.quote.id)?.error?.field, 'media');
            }
          }
          if (mode === 'success') {
            const { deletePostPersisted } = await import('../../../packages/core/services/post');
            const deleted = await deletePostPersisted({
              actorProfileId: f.source.id,
              origin: 'ACTIVITYPUB',
              postId: f.sourceId,
            });
            assert.deepEqual(deleted.revokedQuoteIds, [f.quote.id]);
            const revoked = await db
              .select()
              .from(Posts)
              .where(eq(Posts.id, f.quote.id))
              .then(firstOrThrow);
            assert.equal(revoked.quoteConsentStatus, PostQuoteConsentStatus.REVOKED);
            assert.equal(revoked.repostSourceId, f.sourceId);
            assert.equal(revoked.currentContentId, f.content.id);
          }
          await f.handle.signal('finishQuoteOwner');
          await f.handle.result();
        });
      }
      await t.test(
        'private URI winner binding blocks concurrent Source owner deletion',
        async () => {
          const f = await fixture();
          assert.equal(f.prepared.kind, 'CHANGE');
          assert.ok(f.prepared.kind === 'CHANGE' && f.prepared.privateSource);
          const source = f.prepared.privateSource!;
          const winnerId = randomUUID();
          const beforeEffects = effectCount;
          const { createPostPersisted } = await import('../../../packages/core/services/post');
          mutations.set(f.quote.id, async () => {
            await createPostPersisted(
              {
                ...source,
                origin: 'ACTIVITYPUB',
                publishedAt: null,
                receivedAt: Temporal.Instant.from(source.receivedAt),
              },
              winnerId,
            );
          });
          let signalFence!: () => void;
          let releaseFence!: () => void;
          const fenceReached = new Promise<void>((resolve) => {
            signalFence = resolve;
          });
          const fenceReleased = new Promise<void>((resolve) => {
            releaseFence = resolve;
          });
          afterFence = async () => {
            signalFence();
            await fenceReleased;
          };
          const binding = f.handle.executeUpdate('quoteCommand', { args: [f.command] });
          await fenceReached;
          const deletion = await env.client.workflow.start('postDeleteMutationWorkflow', {
            workflowId: `post-delete:${winnerId}`,
            taskQueue,
            args: [{ actorProfileId: f.source.id, origin: 'ACTIVITYPUB', postId: winnerId }],
          });
          let deletionSettled = false;
          const deleted = deletion.executeUpdate('deletePost').then((result) => {
            deletionSettled = true;
            return result;
          });
          try {
            const deadline = Date.now() + 2500;
            let waiting = false;
            while (!waiting && Date.now() < deadline) {
              const rows = await db.execute<{ waiting: boolean }>(sql`
              select exists (
                select 1 from pg_stat_activity
                where datname = current_database() and wait_event_type = 'Lock'
              ) as waiting
            `);
              waiting = rows[0]?.waiting ?? false;
              if (!waiting) {
                await new Promise((resolve) => setTimeout(resolve, 10));
              }
            }
            assert.equal(waiting, true, 'Source deletion must wait on the binding Source lock');
            assert.equal(deletionSettled, false);
          } finally {
            releaseFence();
          }
          await binding;
          const outcome = await deleted;
          assert.deepEqual(outcome, {
            ok: true,
            result: { postId: winnerId, sourcePostId: null, revokedQuoteIds: [f.quote.id] },
          });
          await deletion.result();
          const quote = await db
            .select()
            .from(Posts)
            .where(eq(Posts.id, f.quote.id))
            .then(firstOrThrow);
          assert.equal(quote.quoteConsentStatus, PostQuoteConsentStatus.REVOKED);
          assert.equal(quote.repostSourceId, winnerId);
          assert.equal(quote.currentContentId, f.content.id);
          assert.deepEqual(
            (
              await db
                .select()
                .from(PostContents)
                .where(eq(PostContents.id, f.content.id))
                .then(firstOrThrow)
            ).document,
            f.content.document,
          );
          const winner = await db
            .select()
            .from(Posts)
            .where(eq(Posts.id, winnerId))
            .then(firstOrThrow);
          assert.equal(winner.state, PostState.DELETED);
          assert.ok(winner.currentContentId);
          assert.equal(await db.$count(Media, eq(Media.url, f.mediaUrl)), 1);
          assert.equal(await db.$count(Posts, eq(Posts.id, f.sourceId)), 0);
          assert.equal(await db.$count(ActivityPubPosts, eq(ActivityPubPosts.uri, f.sourceUri)), 1);
          assert.equal(effectCount, beforeEffects);
          await f.handle.signal('finishQuoteOwner');
          await f.handle.result();
        },
      );
      await t.test(
        'completed native Source effect Workflow rejects duplicate and retries settle once',
        async () => {
          const f = await fixture();
          await f.handle.executeUpdate('quoteCommand', { args: [f.command] });
          await f.handle.signal('finishQuoteOwner');
          await f.handle.result();
          const committed = results.get(f.quote.id)!;
          assert.equal(committed.privateSourceCreatedId, f.sourceId);
          sourceStarts.mock.restore();
          const notifications: string[] = [];
          const effectWorker = await Worker.create({
            connection: env.nativeConnection,
            namespace: env.namespace,
            taskQueue: 'kosmo',
            workflowsPath: new URL('./workflows/index.ts', import.meta.url).pathname,
            activities: {
              createNotificationActivity: async (input: { kind: string; sourceId: string }) => {
                notifications.push(`${input.kind}:${input.sourceId}`);
              },
            },
          });
          await effectWorker.runUntil(async () => {
            const effect = { ...committed, applied: false };
            await production.sendQuoteOwnerEffectActivity(f.command, effect, 'native-effect');
            const workflowId = `post-create-effects:${f.sourceId}`;
            await env.client.workflow.getHandle(workflowId).result();
            assert.equal(notifications.length, 3);
            assert.equal(new Set(notifications).size, 3);
            await assert.rejects(
              temporalClient.workflow.start('postCreateEffectsWorkflow', {
                taskQueue: 'kosmo',
                workflowId,
                workflowIdConflictPolicy: 'USE_EXISTING',
                workflowIdReusePolicy: 'REJECT_DUPLICATE',
                args: [{ postId: f.sourceId, origin: 'ACTIVITYPUB' }],
              }),
              WorkflowExecutionAlreadyStartedError,
            );
            await production.sendQuoteOwnerEffectActivity(f.command, effect, 'native-effect');
            assert.equal(notifications.length, 3);
            assert.equal(
              (await env.client.workflow.getHandle(workflowId).describe()).status.name,
              'COMPLETED',
            );
          });
        },
      );
    } finally {
      fence.mock.restore();
      for (const handle of handles) {
        await handle.signal('finishQuoteOwner').catch(() => {});
        await handle.result().catch(() => {});
      }
      worker.shutdown();
      await running;
      await temporalClient.connection.close();
      await env.teardown();
      sourceStarts.mock.restore();
      await db.update(PostContents).set({ postId: null });
      await db.update(Posts).set({ currentContentId: null, repostSourceId: null });
      await db.delete(Posts);
      await db.delete(PostContents);
      await db.delete(Media);
      await db.delete(Profiles);
      for (const id of instanceIds) {
        await db.delete(Instances).where(eq(Instances.id, id));
      }
      await pg.end({ timeout: 5 });
    }
  },
);
