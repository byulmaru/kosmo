import '@kosmo/core/polyfill';

import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { once } from 'node:events';
import { test } from 'node:test';
import { setTimeout as delay } from 'node:timers/promises';
import {
  ActivityPubActors,
  ActivityPubPosts,
  db,
  firstOrThrow,
  Instances,
  pg,
  PostContents,
  Posts,
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
import { KOSMO_TASK_QUEUE } from '@kosmo/core/temporal/task-queue';
import { TestWorkflowEnvironment } from '@temporalio/testing';
import { Worker } from '@temporalio/worker';
import { eq, inArray, sql } from 'drizzle-orm';
import { applyPostQuoteConsent as applyLegacyConsent } from './test-fixtures/legacy-quote-consent-961';
import type { QuoteOwnerCommand } from '@kosmo/core/temporal/post-quote-owner';

const deferred = () => {
  let resolve!: () => void;
  const promise = new Promise<void>((r) => {
    resolve = r;
  });
  return { promise, resolve };
};
const until = async (condition: () => boolean | Promise<boolean>) => {
  const deadline = Date.now() + 30000;
  while (!(await condition())) {
    if (Date.now() > deadline) {
      throw new Error('Lifecycle observation deadline exceeded');
    }
    await delay(25);
  }
};

test(
  'actual #961 writer shutdown → production Worker bootstrap·restart·CAN·new Run recovery',
  { timeout: 300000 },
  async (t) => {
    const environment = await TestWorkflowEnvironment.createLocal({
      server: { executable: { type: 'cached-download', version: 'v1.8.2' } },
    });
    const instance = await db
      .insert(Instances)
      .values({
        domain: `${randomUUID()}.example`,
        kind: InstanceKind.ACTIVITYPUB,
        state: InstanceState.ACTIVE,
      })
      .returning()
      .then(firstOrThrow);
    const makePost = async (name: string) => {
      const profile = await db
        .insert(Profiles)
        .values({
          instanceId: instance.id,
          handle: name,
          normalizedHandle: name,
          displayName: name,
          followPolicy: ProfileFollowPolicy.OPEN,
          state: ProfileState.ACTIVE,
        })
        .returning()
        .then(firstOrThrow);
      const actor = `https://${instance.domain}/actors/${name}`;
      await db.insert(ActivityPubActors).values({
        profileId: profile.id,
        uri: actor,
        type: ActivityPubActorType.PERSON,
      });
      const content = await db
        .insert(PostContents)
        .values({
          document: postContentDocumentFromText('body https://kept.example/link'),
        })
        .returning()
        .then(firstOrThrow);
      const post = await db
        .insert(Posts)
        .values({
          profileId: profile.id,
          currentContentId: content.id,
          state: PostState.ACTIVE,
          visibility: PostVisibility.PUBLIC,
        })
        .returning()
        .then(firstOrThrow);
      const uri = `https://${instance.domain}/notes/${post.id}`;
      await db.insert(ActivityPubPosts).values({
        postId: post.id,
        uri,
        receivedAt: Temporal.Now.instant(),
      });
      return { profile, content, post, actor, uri };
    };
    const source = await makePost('source'),
      quote = await makePost('quote');
    await db
      .update(Posts)
      .set({
        repostSourceId: source.post.id,
        quoteConsentStatus: PostQuoteConsentStatus.PENDING,
      })
      .where(eq(Posts.id, quote.post.id));
    const updated = deferred(),
      release = deferred();
    const oldWorker = await Worker.create({
      connection: environment.nativeConnection,
      namespace: environment.namespace,
      taskQueue: `old-961-${randomUUID()}`,
      workflowsPath: new URL('./test-fixtures/legacy-quote-writer.ts', import.meta.url).pathname,
      // Match #961's unconfigured SDK shutdown grace. Do not simulate owner drain here.
      activities: {
        writeLegacyQuote: async (input: Parameters<typeof applyLegacyConsent>[0]) => {
          await db.transaction(async (tx) => {
            assert.ok(await applyLegacyConsent(input, tx));
            updated.resolve();
            await release.promise;
          });
        },
      },
    });
    const oldRun = oldWorker.run();
    const children: ReturnType<typeof spawn>[] = [];
    const launch = async () => {
      const child = spawn(process.execPath, ['--import', 'tsx', 'src/index.ts'], {
        cwd: new URL('../', import.meta.url).pathname,
        env: {
          ...process.env,
          TEMPORAL_ADDRESS: environment.address,
          TEMPORAL_NAMESPACE: environment.namespace ?? 'default',
          FEDIFY_QUEUE_DATABASE_URL: process.env.DATABASE_URL,
          PUBLIC_ORIGIN: 'http://127.0.0.1:4173',
          HOST: '127.0.0.1',
          PORT: '0',
          ENVIRONMENT: 'test',
        },
        stdio: ['ignore', 'ignore', 'inherit', 'ipc'],
      });
      children.push(child);
      const port = await Promise.race([
        once(child, 'message').then(([value]) => value as number),
        once(child, 'exit').then(([code]) => {
          throw new Error(`Worker startup failed: ${code}`);
        }),
      ]);
      await until(async () => (await fetch(`http://127.0.0.1:${port}/ready`)).status === 200);
      return child;
    };
    const stop = async (child: ReturnType<typeof spawn>) => {
      const exit = once(child, 'exit');
      child.kill('SIGTERM');
      const [code, signal] = await exit;
      assert.equal(code, 0);
      assert.equal(signal, null);
    };
    const handle = await environment.client.workflow.start('postQuoteOwnerWorkflow', {
      taskQueue: KOSMO_TASK_QUEUE,
      workflowId: `post-quote:${quote.post.id}`,
      args: [{ postId: quote.post.id }],
    });
    const note = (commandId: string): QuoteOwnerCommand => ({
      kind: 'NOTE',
      postId: quote.post.id,
      commandId,
      actorUri: quote.actor,
      targetUri: source.uri,
      format: 'LEGACY',
      approvalUri: null,
      authorizationUpdate: false,
      duplicateCreate: false,
    });
    const status = () =>
      db.select().from(Posts).where(eq(Posts.id, quote.post.id)).then(firstOrThrow);
    try {
      await t.test(
        'old default-grace Worker stop does not terminate its in-flight DB transaction; new owner bootstrap waits',
        async () => {
          const legacy = await environment.client.workflow.start('legacyQuoteWriter', {
            taskQueue: oldWorker.options.taskQueue,
            workflowId: `legacy-${randomUUID()}`,
            args: [
              {
                quote: {
                  postId: quote.post.id,
                  profileId: quote.profile.id,
                  uri: quote.uri,
                  authorActorUri: quote.actor,
                },
                source: {
                  postId: source.post.id,
                  profileId: source.profile.id,
                  uri: source.uri,
                  authorActorUri: source.actor,
                },
                expectedStatus: PostQuoteConsentStatus.PENDING,
                expectedApprovalUri: null,
                expectedRepostSourceId: source.post.id,
                operation: 'RESOLVE',
                result: 'APPROVED',
                quoteAuthorActorUri: quote.actor,
                proof: {
                  kind: 'AUTHORIZATION',
                  approvalUri: `https://${instance.domain}/U`,
                  issuerActorUri: source.actor,
                },
              },
            ],
          });
          await updated.promise;
          oldWorker.shutdown();
          let oldStopped = false;
          void oldRun.then(() => {
            oldStopped = true;
          });
          await launch();
          await until(
            async () =>
              (await handle.query<{ phase: string }>('quoteOwnerWork')).phase === 'BOOTSTRAP',
          );
          assert.equal(oldStopped, false);
          assert.equal((await status()).quoteConsentStatus, PostQuoteConsentStatus.PENDING);
          release.resolve();
          await oldRun;
          assert.ok(
            (await legacy.fetchHistory()).events?.some(
              (event) => event.activityTaskCompletedEventAttributes,
            ),
          );
          await until(
            async () =>
              (await handle.query<{ targetUri?: string }>('quoteOwnerBinding')).targetUri ===
              source.uri,
          );
          assert.equal((await status()).quoteConsentStatus, PostQuoteConsentStatus.APPROVED);
          assert.equal((await status()).quoteConsentApprovalUri, `https://${instance.domain}/U`);
        },
      );
      await t.test(
        'production entrypoint SIGTERM leaves the Workflow RUNNING; replacement resumes the same Run',
        async () => {
          const before = await handle.describe();
          await stop(children.at(-1)!);
          assert.equal((await handle.describe()).status.name, 'RUNNING');
          await launch();
          assert.equal((await handle.describe()).runId, before.runId);
          await handle.executeUpdate('quoteCommand', {
            args: [note('after-worker-restart')],
            updateId: 'after-worker-restart',
          });
          assert.equal((await status()).quoteConsentStatus, PostQuoteConsentStatus.APPROVED);
        },
      );
      await t.test(
        'SIGTERM while the production write Activity waits for PostgreSQL resumes safely on replacement',
        async () => {
          await db
            .update(Posts)
            .set({ quoteConsentStatus: PostQuoteConsentStatus.PENDING })
            .where(eq(Posts.id, quote.post.id));
          const locked = deferred(),
            unlock = deferred();
          const holder = db.transaction(async (tx) => {
            await tx
              .select({ id: Posts.id })
              .from(Posts)
              .where(eq(Posts.id, quote.post.id))
              .for('update');
            locked.resolve();
            await unlock.promise;
          });
          await locked.promise;
          const completion = handle.executeUpdate('quoteCommand', {
            args: [note('restart-during-write')],
            updateId: 'restart-during-write',
          });
          try {
            await until(async () => {
              const rows = await db.execute<{ blocked: boolean }>(sql`
                SELECT EXISTS (
                  SELECT 1 FROM pg_stat_activity
                  WHERE datname = current_database() AND wait_event_type = 'Lock'
                    AND query ILIKE '%for update%' AND pid <> pg_backend_pid()
                ) AS blocked`);
              return rows[0]?.blocked === true;
            });
            const before = await handle.describe();
            const stopped = stop(children.at(-1)!);
            unlock.resolve();
            await holder;
            await stopped;
            assert.equal((await handle.describe()).status.name, 'RUNNING');
            await launch();
            await completion;
            assert.equal((await handle.describe()).runId, before.runId);
            assert.equal((await status()).quoteConsentStatus, PostQuoteConsentStatus.APPROVED);
          } finally {
            unlock.resolve();
            await holder;
          }
        },
      );
      await t.test(
        'CAN and normal finish use owner drain; a fresh Run bootstraps the committed DB state',
        async () => {
          const before = await handle.describe();
          await handle.signal('continueQuoteOwner');
          await until(async () => (await handle.describe()).runId !== before.runId);
          await handle.executeUpdate('quoteCommand', {
            args: [note('after-can')],
            updateId: 'after-can',
          });
          await handle.signal('finishQuoteOwner');
          await handle.result();
          const next = await environment.client.workflow.start('postQuoteOwnerWorkflow', {
            taskQueue: KOSMO_TASK_QUEUE,
            workflowId: `post-quote:${quote.post.id}`,
            workflowIdReusePolicy: 'ALLOW_DUPLICATE',
            args: [{ postId: quote.post.id }],
          });
          await next.executeUpdate('quoteCommand', {
            args: [note('new-run')],
            updateId: 'new-run',
          });
          assert.equal((await status()).quoteConsentStatus, PostQuoteConsentStatus.APPROVED);
          const content = await db
            .select()
            .from(PostContents)
            .where(eq(PostContents.id, quote.content.id))
            .then(firstOrThrow);
          assert.deepEqual(content.document, quote.content.document);
          await next.signal('finishQuoteOwner');
          await next.result();
        },
      );
    } finally {
      release.resolve();
      if (oldWorker.getState() === 'RUNNING') {
        oldWorker.shutdown();
      }
      await oldRun.catch(() => undefined);
      for (const child of children) {
        if (child.exitCode === null && child.signalCode === null) {
          await stop(child);
        }
      }
      await environment.teardown();
      await db
        .update(Posts)
        .set({ currentContentId: null, repostSourceId: null })
        .where(inArray(Posts.id, [source.post.id, quote.post.id]));
      await db.delete(Posts).where(inArray(Posts.id, [source.post.id, quote.post.id]));
      await db
        .delete(PostContents)
        .where(inArray(PostContents.id, [source.content.id, quote.content.id]));
      await db.delete(Profiles).where(eq(Profiles.instanceId, instance.id));
      await db.delete(Instances).where(eq(Instances.id, instance.id));
      await pg.end({ timeout: 5 });
    }
  },
);
