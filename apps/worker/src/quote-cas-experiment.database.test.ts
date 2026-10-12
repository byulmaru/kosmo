import '@kosmo/core/polyfill';

import assert from 'node:assert/strict';
import { fork } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import test from 'node:test';
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
import { Context } from '@temporalio/activity';
import { WorkflowClient } from '@temporalio/client';
import { TestWorkflowEnvironment } from '@temporalio/testing';
import { Worker } from '@temporalio/worker';
import { eq, sql } from 'drizzle-orm';
import {
  applyPostQuoteConsent,
  revokePostQuoteConsentsForSource,
} from '../../../packages/core/services/post-quote-consent';
import type { Input, WriteInput } from './test-fixtures/quote-cas-experiment';

const deferred = () => {
  let resolve!: () => void;
  const promise = new Promise<void>((r) => {
    resolve = r;
  });
  return { promise, resolve };
};
type Gate = ReturnType<typeof deferred>;
type Fixture = Awaited<ReturnType<typeof createFixture>>;
const fixtures = new Map<string, Fixture>();
const gates = new Map<string, Gate>();
const events: string[] = [];
const controls = new Map<string, { idleTimeout?: number; loseResponse?: boolean }>();
const snapshots = new Map<string, { quote: string; source: string; actor: string }>();

function probe(args: string[]) {
  const child = fork(new URL('./test-fixtures/quote-cas-db-probe.ts', import.meta.url), args, {
    execArgv: ['--import', 'tsx'],
    silent: true,
  });
  const messages: unknown[] = [];
  let stderr = '';
  child.on('message', (message) => messages.push(message));
  child.stderr?.on('data', (data) => {
    stderr += data.toString();
  });
  child.stdout?.resume();
  const exited = new Promise<{ code: number | null; signal: string | null }>((resolve) =>
    child.once('exit', (code, signal) => resolve({ code, signal })),
  );
  return { child, messages, exited, stderr: () => stderr };
}

const applyDirect = (
  fixture: Fixture,
  expected: 'APPROVED' | 'REVOKED',
  next: 'APPROVED' | 'REVOKED',
) =>
  applyPostQuoteConsent({
    expectedStatus: expected,
    expectedApprovalUri: fixture.approval,
    expectedRepostSourceId: fixture.source.post.id,
    quote: fixture.quote.identity,
    source: fixture.source.identity,
    ...(next === 'APPROVED'
      ? {
          operation: 'RESOLVE' as const,
          result: 'APPROVED' as const,
          quoteAuthorActorUri: fixture.quote.identity.authorActorUri,
          proof: {
            kind: 'AUTHORIZATION' as const,
            approvalUri: fixture.approval,
            issuerActorUri: fixture.source.identity.authorActorUri,
          },
        }
      : {
          operation: 'REVOKE' as const,
          approvalUri: fixture.approval,
          issuerActorUri: fixture.source.identity.authorActorUri,
        }),
  });

async function until(predicate: () => boolean | Promise<boolean>, label: string) {
  const deadline = Date.now() + 12_000;
  while (!(await predicate())) {
    if (Date.now() > deadline) {
      throw new Error(`Timed out: ${label}; events=${events.join(',')}`);
    }
    await delay(20);
  }
}
async function barrier(key: string, stage: string) {
  events.push(`${key}:${stage}`);
  await gates.get(`${key}:${stage}`)?.promise;
}
const hold = (key: string) => {
  const gate = deferred();
  gates.set(key, gate);
  return gate;
};

async function createFixture() {
  const domain = `${randomUUID()}.example`;
  const instance = await db
    .insert(Instances)
    .values({ domain, kind: InstanceKind.ACTIVITYPUB, state: InstanceState.ACTIVE })
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
    const actor = `https://${domain}/${name}`;
    await db
      .insert(ActivityPubActors)
      .values({ profileId: profile.id, uri: actor, type: ActivityPubActorType.PERSON });
    const content = await db
      .insert(PostContents)
      .values({
        postId: null,
        document: postContentDocumentFromText('authored text https://kept.example/link'),
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
    const uri = `https://${domain}/notes/${post.id}`;
    await db
      .insert(ActivityPubPosts)
      .values({ postId: post.id, uri, receivedAt: Temporal.Now.instant() });
    return {
      post,
      content,
      identity: { postId: post.id, profileId: profile.id, uri, authorActorUri: actor },
    };
  };
  const source = await makePost('source');
  const quote = await makePost('quote');
  const approval = `https://${domain}/authorization/U`;
  await db
    .update(Posts)
    .set({
      repostSourceId: source.post.id,
      quoteConsentStatus: PostQuoteConsentStatus.REVOKED,
      quoteConsentApprovalUri: approval,
    })
    .where(eq(Posts.id, quote.post.id));
  return { source, quote, approval };
}

test(
  'PROD-924: real Temporal + PostgreSQL fencing experiments',
  { timeout: 180_000 },
  async (t) => {
    const environment = await TestWorkflowEnvironment.createLocal({
      server: { executable: { type: 'cached-download', version: 'v1.8.2' } },
    });
    const queryClient = new WorkflowClient({
      connection: environment.connection,
      namespace: environment.namespace,
      queryRejectCondition: 'NOT_OPEN',
    });
    const taskQueue = `quote-cas-experiment-${randomUUID()}`;
    let workflowWorker = await Worker.create({
      connection: environment.nativeConnection,
      namespace: environment.namespace,
      taskQueue,
      workflowsPath: new URL('./test-fixtures/quote-cas-experiment.ts', import.meta.url).pathname,
    });
    let workflowRun = workflowWorker.run();
    const activityWorker = await Worker.create({
      connection: environment.nativeConnection,
      namespace: environment.namespace,
      taskQueue,
      activities: {
        async deleteSource(input: { sourcePostId: string; gateId: string }) {
          await db.transaction(async (tx) => {
            await tx.execute(sql`SET LOCAL lock_timeout = '6s'`);
            await tx
              .update(Posts)
              .set({ state: PostState.DELETED })
              .where(eq(Posts.id, input.sourcePostId));
            events.push(`${input.gateId}:source-updated`);
            await revokePostQuoteConsentsForSource(tx, input.sourcePostId);
            await barrier(input.gateId, 'bulk-updated');
          });
          events.push(`${input.gateId}:deleted`);
        },
        async drainWrites(fixtureId: string) {
          events.push(`${fixtureId}:drain-enter`);
          await db.transaction(async (tx) => {
            await tx.execute(sql`SET LOCAL lock_timeout = '3s'`);
            await tx
              .select({ id: Posts.id })
              .from(Posts)
              .where(eq(Posts.id, fixtureId))
              .for('update');
            events.push(`${fixtureId}:drain-locked`);
          });
          events.push(`${fixtureId}:drain-complete`);
        },
        async writeConsent(input: WriteInput) {
          const info = Context.current().info;
          assert.ok(info.workflowExecution);
          const workflowId = info.workflowExecution.workflowId;
          const key = `${workflowId}/${input.id}/${info.attempt}`;
          const fixture = fixtures.get(input.fixtureId)!;
          try {
            await barrier(key, 'enter');
            await barrier(key, 'before-lock');
            const result = await db.transaction(async (tx) => {
              await tx.execute(
                sql.raw(
                  `SET LOCAL idle_in_transaction_session_timeout = '${controls.get(workflowId)?.idleTimeout ?? 10000}ms'`,
                ),
              );
              await tx.execute(sql`SET LOCAL lock_timeout = '6s'`);
              if (input.sourceLock) {
                await tx
                  .select({ id: Posts.id })
                  .from(Posts)
                  .where(eq(Posts.id, fixture.source.post.id))
                  .for('share');
                await barrier(key, 'source-locked');
              }
              if (input.fenced) {
                await tx
                  .select({ id: Posts.id })
                  .from(Posts)
                  .where(eq(Posts.id, fixture.quote.post.id))
                  .for('update');
                await barrier(key, 'locked');
                const current = await queryClient.withDeadline(Date.now() + 700, () =>
                  queryClient
                    .getHandle(workflowId)
                    .query<{ runId: string; active: string | null }>('active'),
                );
                if (current.runId !== input.runId || current.active !== input.id) {
                  events.push(`${key}:fenced`);
                  return 'fenced';
                }
                await barrier(key, 'queried');
              }
              const identity = snapshots.get(workflowId);
              const applied = await applyPostQuoteConsent(
                {
                  expectedStatus: input.expected,
                  expectedApprovalUri: fixture.approval,
                  expectedRepostSourceId: input.link ? null : fixture.source.post.id,
                  quote: {
                    ...fixture.quote.identity,
                    ...(identity ? { uri: identity.quote } : {}),
                  },
                  source: {
                    ...fixture.source.identity,
                    ...(identity ? { uri: identity.source, authorActorUri: identity.actor } : {}),
                  },
                  ...(input.next === 'APPROVED'
                    ? {
                        operation: 'RESOLVE' as const,
                        result: 'APPROVED' as const,
                        quoteAuthorActorUri: fixture.quote.identity.authorActorUri,
                        proof: {
                          kind: 'AUTHORIZATION' as const,
                          approvalUri: fixture.approval,
                          issuerActorUri: fixture.source.identity.authorActorUri,
                        },
                      }
                    : {
                        operation: 'REVOKE' as const,
                        approvalUri: fixture.approval,
                        issuerActorUri: fixture.source.identity.authorActorUri,
                      }),
                },
                tx,
              );
              await barrier(key, 'updated');
              return applied ? 'applied' : 'cas-rejected';
            });
            events.push(`${key}:committed:${result}`);
            if (controls.get(workflowId)?.loseResponse && input.id === 'A' && info.attempt === 1) {
              await barrier(key, 'response-lost');
            }
            return result;
          } catch (error) {
            let cause: unknown = error;
            const codes: string[] = [];
            while (cause && typeof cause === 'object') {
              const item = cause as { code?: string; cause?: unknown };
              if (item.code) {
                codes.push(item.code);
              }
              cause = item.cause;
            }
            events.push(
              `${key}:failed:${error instanceof Error ? error.name : 'unknown'}:${codes.join(',')}`,
            );
            throw error;
          } finally {
            events.push(`${key}:settled`);
          }
        },
      },
    });
    const activityRun = activityWorker.run();
    const handles: Array<ReturnType<typeof environment.client.workflow.getHandle>> = [];
    const begin = async (
      fenced = true,
      attempts = 2,
      drain = false,
      sourceLock = true,
      link = false,
    ) => {
      const fixture = await createFixture();
      if (link) {
        await db
          .update(Posts)
          .set({ repostSourceId: null, quoteConsentStatus: PostQuoteConsentStatus.PENDING })
          .where(eq(Posts.id, fixture.quote.post.id));
      }
      fixtures.set(fixture.quote.post.id, fixture);
      const workflowId = `quote:${fixture.quote.post.id}`;
      const input: Input = {
        fixtureId: fixture.quote.post.id,
        fenced,
        attempts,
        drain,
        sourceLock,
        link,
      };
      const handle = await environment.client.workflow.start('quoteCasExperiment', {
        workflowId,
        taskQueue,
        args: [input],
      });
      handles.push(handle);
      return {
        fixture,
        workflowId,
        input,
        handle,
        status: async () =>
          (
            await db
              .select()
              .from(Posts)
              .where(eq(Posts.id, fixture.quote.post.id))
              .then(firstOrThrow)
          ).quoteConsentStatus,
      };
    };
    const commandA = { id: 'A', expected: 'REVOKED', next: 'APPROVED' };
    const commandB = { id: 'B', expected: 'APPROVED', next: 'REVOKED' };
    const finished = (id: string, command: string) =>
      queryClient
        .getHandle(id)
        .query<{ active: string | null; completed: number }>('active')
        .then((s) => s.active === null && s.completed >= (command === 'A' ? 1 : 2));
    const deleteSource = async (sourcePostId: string, gateId: string) => {
      const handle = await environment.client.workflow.start('sourceDeletionExperiment', {
        workflowId: gateId,
        taskQueue,
        args: [{ sourcePostId, gateId }],
      });
      handles.push(handle);
      return handle;
    };
    try {
      for (const sourceLock of [true]) {
        for (const link of [false, true]) {
          await t.test(
            `Source deletion after approval UPDATE before commit: sourceLock=${sourceLock}, newLink=${link}`,
            async () => {
              const x = await begin(true, 1, true, sourceLock, link);
              const gate = hold(`${x.workflowId}/A/1:updated`);
              await x.handle.signal('command', {
                ...commandA,
                expected: link ? 'PENDING' : 'REVOKED',
              });
              await until(
                () => events.includes(`${x.workflowId}/A/1:updated`),
                'approval UPDATE uncommitted',
              );
              const deletionId = `source-delete:${randomUUID()}`;
              const deletion = await deleteSource(x.fixture.source.post.id, deletionId);
              if (sourceLock || link) {
                // FK checking a new relation also holds KEY SHARE, which does not conflict with state UPDATE.
                await delay(100);
                if (sourceLock) {
                  assert.ok(!events.includes(`${deletionId}:source-updated`));
                }
              }
              if (!sourceLock) {
                await deletion.result();
              }
              gate.resolve();
              await until(
                () => events.includes(`${x.workflowId}/A/1:committed:applied`),
                'approval committed',
              );
              await deletion.result();
              assert.equal(await x.status(), sourceLock ? 'REVOKED' : 'APPROVED');
            },
          );
        }
      }
      await t.test(
        'bulk deletion is atomic across multiple Quotes and preserves authored Content/relation',
        async () => {
          const x = await begin(true, 1, true, true);
          const y = await begin(true, 1, true, true);
          y.fixture.source = x.fixture.source;
          await db
            .update(Posts)
            .set({
              repostSourceId: x.fixture.source.post.id,
              quoteConsentStatus: PostQuoteConsentStatus.APPROVED,
            })
            .where(eq(Posts.id, y.fixture.quote.post.id));
          await db
            .update(Posts)
            .set({ quoteConsentStatus: PostQuoteConsentStatus.APPROVED })
            .where(eq(Posts.id, x.fixture.quote.post.id));
          const id = `source-delete:${randomUUID()}`;
          const gate = hold(`${id}:bulk-updated`);
          const deletion = await deleteSource(x.fixture.source.post.id, id);
          await until(() => events.includes(`${id}:bulk-updated`), 'bulk UPDATE uncommitted');
          assert.equal(await x.status(), 'APPROVED');
          assert.equal(await y.status(), 'APPROVED');
          const before = await db
            .select()
            .from(Posts)
            .where(eq(Posts.id, x.fixture.source.post.id))
            .then(firstOrThrow);
          assert.equal(before.state, PostState.ACTIVE);
          gate.resolve();
          await deletion.result();
          assert.equal(await x.status(), 'REVOKED');
          assert.equal(await y.status(), 'REVOKED');
          for (const fixture of [x.fixture, y.fixture]) {
            const quote = await db
              .select()
              .from(Posts)
              .where(eq(Posts.id, fixture.quote.post.id))
              .then(firstOrThrow);
            assert.equal(quote.repostSourceId, x.fixture.source.post.id);
            assert.equal(quote.currentContentId, fixture.quote.content.id);
            const content = await db
              .select()
              .from(PostContents)
              .where(eq(PostContents.id, quote.currentContentId!))
              .then(firstOrThrow);
            assert.deepEqual(content.document, fixture.quote.content.document);
          }
        },
      );
      await t.test(
        'cross-linked Quotes: actual deadlock aborts one attempt and Temporal retry converges',
        async () => {
          const x = await begin(true, 3, true, true);
          const y = await begin(true, 3, true, true);
          x.fixture.source = y.fixture.quote;
          y.fixture.source = x.fixture.quote;
          await db
            .update(Posts)
            .set({ repostSourceId: y.fixture.quote.post.id })
            .where(eq(Posts.id, x.fixture.quote.post.id));
          await db
            .update(Posts)
            .set({ repostSourceId: x.fixture.quote.post.id })
            .where(eq(Posts.id, y.fixture.quote.post.id));
          const gx = hold(`${x.workflowId}/A/1:source-locked`);
          const gy = hold(`${y.workflowId}/A/1:source-locked`);
          await x.handle.signal('command', commandA);
          await y.handle.signal('command', commandA);
          await until(
            () =>
              events.includes(`${x.workflowId}/A/1:source-locked`) &&
              events.includes(`${y.workflowId}/A/1:source-locked`),
            'both Source locks',
          );
          gx.resolve();
          gy.resolve();
          await until(
            () =>
              events.some(
                (e) => (e.includes(':failed:') && e.includes('40P01')) || e.includes('deadlock'),
              ),
            'real PostgreSQL deadlock',
          );
          await until(() => finished(x.workflowId, 'A'), 'x completed');
          await until(() => finished(y.workflowId, 'A'), 'y completed');
          assert.equal(await x.status(), 'APPROVED');
          assert.equal(await y.status(), 'APPROVED');
        },
      );
      if (process.env.KOSMO_OWNER_SOURCE_ONLY === '1') {
        return;
      }
      for (const fenced of [false, true]) {
        await t.test(`timeout ABA: fence=${fenced}`, async () => {
          const x = await begin(fenced);
          const gate = hold(`${x.workflowId}/A/1:before-lock`);
          await x.handle.signal('command', commandA);
          await until(
            () => events.includes(`${x.workflowId}/A/2:committed:applied`),
            'A2 committed',
          );
          await until(() => finished(x.workflowId, 'A'), 'A finished');
          await x.handle.signal('command', commandB);
          await until(() => events.includes(`${x.workflowId}/B/1:committed:applied`), 'B revoked');
          gate.resolve();
          await until(
            () => events.some((e) => e.startsWith(`${x.workflowId}/A/1:committed:`)),
            'late A1 settled',
          );
          assert.equal(await x.status(), fenced ? 'REVOKED' : 'APPROVED');
        });
      }
      await t.test('Query passed, A times out, B starts: row lock orders commits', async () => {
        const x = await begin(true, 1);
        const gate = hold(`${x.workflowId}/A/1:queried`);
        await x.handle.signal('command', commandA);
        await until(() => events.includes(`${x.workflowId}/A/1:queried`), 'A query passed');
        await x.handle.signal('command', commandB);
        await until(
          () => events.includes(`${x.workflowId}/B/1:enter`),
          'B started after A timeout',
        );
        assert.ok(!events.includes(`${x.workflowId}/B/1:locked`));
        gate.resolve();
        await until(() => events.includes(`${x.workflowId}/B/1:committed:applied`), 'B committed');
        assert.equal(await x.status(), 'REVOKED');
        assert.ok(
          events.indexOf(`${x.workflowId}/A/1:committed:applied`) <
            events.indexOf(`${x.workflowId}/B/1:committed:applied`),
        );
      });
      await t.test(
        'COUNTEREXAMPLE: termination after Query still permits the old commit',
        async () => {
          const x = await begin(true, 1);
          const gate = hold(`${x.workflowId}/A/1:queried`);
          await x.handle.signal('command', commandA);
          await until(() => events.includes(`${x.workflowId}/A/1:queried`), 'A queried');
          await x.handle.terminate('experiment: terminate after successful query');
          assert.equal((await x.handle.describe()).status.name, 'TERMINATED');
          gate.resolve();
          await until(
            () => events.includes(`${x.workflowId}/A/1:committed:applied`),
            'old run committed',
          );
          assert.equal(await x.status(), 'APPROVED');
        },
      );
      for (const boundary of ['finish', 'renew'] as const) {
        await t.test(
          `drain barrier prevents post-Query write surviving normal ${boundary}`,
          async () => {
            const x = await begin(true, 1, true);
            const gate = hold(`${x.workflowId}/A/1:queried`);
            await x.handle.signal('command', commandA);
            await until(() => events.includes(`${x.workflowId}/A/1:queried`), 'query passed');
            const oldRun = (await x.handle.describe()).runId;
            await x.handle.signal(boundary);
            await until(
              () => events.includes(`${x.fixture.quote.post.id}:drain-enter`),
              'retired operation draining',
            );
            assert.equal((await x.handle.describe()).status.name, 'RUNNING');
            assert.ok(!events.includes(`${x.fixture.quote.post.id}:drain-complete`));
            gate.resolve();
            await until(
              () => events.includes(`${x.fixture.quote.post.id}:drain-complete`),
              'drain complete',
            );
            if (boundary === 'finish') {
              await x.handle.result();
            } else {
              await until(
                async () =>
                  (await queryClient.getHandle(x.workflowId).query<{ runId: string }>('active'))
                    .runId !== oldRun,
                'continued after drain',
              );
            }
            assert.equal(await x.status(), 'APPROVED');
            assert.ok(
              events.indexOf(`${x.workflowId}/A/1:committed:applied`) <
                events.indexOf(`${x.fixture.quote.post.id}:drain-complete`),
            );
          },
        );
      }
      for (const transition of ['complete', 'continue-as-new', 'terminate-new-run'] as const) {
        await t.test(`late pre-lock attempt after ${transition} is fenced`, async () => {
          const x = await begin(true, 1);
          const gate = hold(`${x.workflowId}/A/1:before-lock`);
          await x.handle.signal('command', commandA);
          await until(() => finished(x.workflowId, 'A'), 'A timed out');
          if (transition === 'complete') {
            await x.handle.signal('finish');
            await x.handle.result();
          } else if (transition === 'continue-as-new') {
            const oldRun = (await x.handle.describe()).runId;
            await x.handle.signal('renew');
            await until(
              async () =>
                (await queryClient.getHandle(x.workflowId).query<{ runId: string }>('active'))
                  .runId !== oldRun,
              'new continued run',
            );
          } else {
            await x.handle.terminate('restart test');
            const next = await environment.client.workflow.start('quoteCasExperiment', {
              workflowId: x.workflowId,
              taskQueue,
              args: [x.input],
              workflowIdReusePolicy: 'ALLOW_DUPLICATE',
            });
            handles.push(next);
            await next.signal('command', { ...commandA, id: 'new-A' });
            await until(
              () => events.includes(`${x.workflowId}/new-A/1:committed:applied`),
              'new run approved',
            );
            await next.signal('command', { ...commandB, id: 'new-B' });
            await until(
              () => events.includes(`${x.workflowId}/new-B/1:committed:applied`),
              'new run revoked',
            );
          }
          gate.resolve();
          await until(() => events.includes(`${x.workflowId}/A/1:locked`), 'old attempt locked');
          await until(
            () => events.includes(`${x.workflowId}/A/1:fenced`) || transition === 'complete',
            'old attempt rejected',
          );
          await until(
            () => events.includes(`${x.workflowId}/A/1:settled`),
            'old attempt physically settled',
          );
          assert.equal(await x.status(), 'REVOKED');
        });
      }
      await t.test('commit response lost: retry CAS rejects and B remains revoked', async () => {
        const x = await begin();
        controls.set(x.workflowId, { loseResponse: true });
        const gate = hold(`${x.workflowId}/A/1:response-lost`);
        await x.handle.signal('command', commandA);
        await until(
          () => events.includes(`${x.workflowId}/A/2:committed:cas-rejected`),
          'retry sees committed state',
        );
        await x.handle.signal('command', commandB);
        await until(() => events.includes(`${x.workflowId}/B/1:committed:applied`), 'B revoked');
        gate.resolve();
        assert.equal(await x.status(), 'REVOKED');
      });
      await t.test('Signal and Update enqueue while one Activity is active', async () => {
        const x = await begin();
        const gate = hold(`${x.workflowId}/A/1:queried`);
        await x.handle.signal('command', commandA);
        await until(() => events.includes(`${x.workflowId}/A/1:queried`), 'A active');
        const update = x.handle.executeUpdate('commandUpdate', { args: [commandB] });
        await delay(200);
        assert.ok(!events.includes(`${x.workflowId}/B/1:enter`));
        gate.resolve();
        await update;
        assert.equal(await x.status(), 'REVOKED');
      });
      for (const field of ['quote', 'source', 'actor'] as const) {
        await t.test(`common CAS rejects mismatched ${field} identity`, async () => {
          const x = await begin();
          const captured = {
            quote: x.fixture.quote.identity.uri,
            source: x.fixture.source.identity.uri,
            actor: x.fixture.source.identity.authorActorUri,
          };
          captured[field] = 'https://wrong.example/identity';
          snapshots.set(x.workflowId, captured);
          await x.handle.signal('command', commandA);
          await until(
            () => events.includes(`${x.workflowId}/A/1:committed:cas-rejected`),
            'identity CAS rejection',
          );
          assert.equal(await x.status(), 'REVOKED');
        });
      }
      await t.test(
        'TRY_CANCEL after Query: next command starts but commits after old transaction',
        async () => {
          const x = await begin(true, 1);
          const gate = hold(`${x.workflowId}/A/1:queried`);
          await x.handle.signal('command', commandA);
          await until(() => events.includes(`${x.workflowId}/A/1:queried`), 'query passed');
          await x.handle.signal('cancel-active');
          await x.handle.signal('command', commandB);
          await until(
            () => events.includes(`${x.workflowId}/B/1:enter`),
            'B started after cancellation',
          );
          assert.ok(!events.includes(`${x.workflowId}/B/1:locked`));
          gate.resolve();
          await until(
            () => events.includes(`${x.workflowId}/B/1:committed:applied`),
            'B committed',
          );
          assert.equal(await x.status(), 'REVOKED');
        },
      );
      await t.test(
        'COUNTEREXAMPLE: reversible writes bypassing owner defeat its active-operation Query',
        async () => {
          const x = await begin(true, 1);
          const gate = hold(`${x.workflowId}/A/1:before-lock`);
          await x.handle.signal('command', commandA);
          await until(() => events.includes(`${x.workflowId}/A/1:before-lock`), 'A paused');
          assert.ok(await applyDirect(x.fixture, 'REVOKED', 'APPROVED'));
          assert.ok(await applyDirect(x.fixture, 'APPROVED', 'REVOKED'));
          gate.resolve();
          await until(
            () => events.includes(`${x.workflowId}/A/1:committed:applied`),
            'A overwrote external revocation',
          );
          assert.equal(await x.status(), 'APPROVED');
        },
      );
      await t.test('Source already deleted: common CAS rejects a late approval', async () => {
        const x = await begin(true, 1);
        const gate = hold(`${x.workflowId}/A/1:before-lock`);
        await x.handle.signal('command', commandA);
        await until(() => events.includes(`${x.workflowId}/A/1:before-lock`), 'A paused');
        await db.transaction(async (tx) => {
          await tx
            .update(Posts)
            .set({ state: PostState.DELETED })
            .where(eq(Posts.id, x.fixture.source.post.id));
          await revokePostQuoteConsentsForSource(tx, x.fixture.source.post.id);
        });
        gate.resolve();
        await until(
          () => events.includes(`${x.workflowId}/A/1:committed:cas-rejected`),
          'deleted source rejected',
        );
        assert.equal(await x.status(), 'REVOKED');
      });
      await t.test(
        'Source deletion bypass: terminal transaction blocks late approval',
        async () => {
          const x = await begin();
          const gate = hold(`${x.workflowId}/A/1:queried`);
          await x.handle.signal('command', commandA);
          await until(() => events.includes(`${x.workflowId}/A/1:queried`), 'A holds quote lock');
          const deletion = db.transaction(async (tx) => {
            await tx
              .update(Posts)
              .set({ state: PostState.DELETED })
              .where(eq(Posts.id, x.fixture.source.post.id));
            events.push(`${x.workflowId}:source-delete-uncommitted`);
            await revokePostQuoteConsentsForSource(tx, x.fixture.source.post.id);
          });
          await delay(100);
          assert.ok(!events.includes(`${x.workflowId}:source-delete-uncommitted`));
          gate.resolve();
          await deletion;
          assert.equal(await x.status(), 'REVOKED');
          const quote = await db
            .select()
            .from(Posts)
            .where(eq(Posts.id, x.fixture.quote.post.id))
            .then(firstOrThrow);
          assert.equal(quote.repostSourceId, x.fixture.source.post.id);
          assert.equal(quote.currentContentId, x.fixture.quote.content.id);
          const content = await db
            .select()
            .from(PostContents)
            .where(eq(PostContents.id, quote.currentContentId!))
            .then(firstOrThrow);
          assert.deepEqual(content.document, x.fixture.quote.content.document);
        },
      );
      await t.test(
        'Workflow Worker unavailable: real Query deadline rolls back and releases lock',
        async () => {
          const x = await begin(true, 1);
          const gate = hold(`${x.workflowId}/A/1:locked`);
          await x.handle.signal('command', commandA);
          await until(() => events.includes(`${x.workflowId}/A/1:locked`), 'locked before query');
          workflowWorker.shutdown();
          await workflowRun;
          gate.resolve();
          await delay(1000);
          await db.transaction(async (tx) => {
            await tx.execute(sql`SET LOCAL lock_timeout = '500ms'`);
            await tx
              .select({ id: Posts.id })
              .from(Posts)
              .where(eq(Posts.id, x.fixture.quote.post.id))
              .for('update');
          });
          assert.equal(await x.status(), 'REVOKED');
          workflowWorker = await Worker.create({
            connection: environment.nativeConnection,
            namespace: environment.namespace,
            taskQueue,
            workflowsPath: new URL('./test-fixtures/quote-cas-experiment.ts', import.meta.url)
              .pathname,
          });
          workflowRun = workflowWorker.run();
        },
      );
      await t.test(
        'DB idle timeout probe: rollback releases lock and records late callback outcome',
        async () => {
          const x = await begin();
          const child = probe(['idle', x.fixture.quote.post.id]);
          try {
            await until(() => child.messages.includes('locked'), 'probe acquired lock');
            const exit = await child.exited;
            assert.ok(
              exit.code !== 0 ||
                child.messages.some(
                  (message) =>
                    typeof message === 'object' && message !== null && 'caught' in message,
                ),
            );
            await db.transaction(async (tx) => {
              await tx.execute(sql`SET LOCAL lock_timeout = '500ms'`);
              await tx
                .select({ id: Posts.id })
                .from(Posts)
                .where(eq(Posts.id, x.fixture.quote.post.id))
                .for('update');
            });
            assert.equal(await x.status(), 'REVOKED');
            console.log(
              'IDLE_TIMEOUT_PROBE',
              JSON.stringify({ exit, messages: child.messages, stderr: child.stderr() }),
            );
          } finally {
            child.child.kill('SIGKILL');
          }
        },
      );
      await t.test(
        'real Activity Worker SIGKILL: uncommitted write rolls back and Temporal retries',
        async () => {
          const x = await begin();
          const crashQueue = `${taskQueue}-crash`;
          const wf = await Worker.create({
            connection: environment.nativeConnection,
            namespace: environment.namespace,
            taskQueue: crashQueue,
            workflowsPath: new URL('./test-fixtures/quote-cas-experiment.ts', import.meta.url)
              .pathname,
          });
          const wfRun = wf.run();
          const child = probe([
            'crash',
            x.fixture.quote.post.id,
            environment.address,
            environment.namespace ?? 'default',
            crashQueue,
          ]);
          let retryWorker: Worker | undefined;
          let retryRun: Promise<void> | undefined;
          const id = `${x.workflowId}:crash`;
          const handle = await environment.client.workflow.start('quoteCasExperiment', {
            workflowId: id,
            taskQueue: crashQueue,
            args: [x.input],
          });
          handles.push(handle);
          try {
            await until(() => child.messages.includes('ready'), 'crash Worker ready');
            await handle.signal('command', commandA);
            await until(
              () => child.messages.includes('locked'),
              'Activity wrote inside transaction',
            );
            child.child.kill('SIGKILL');
            assert.equal((await child.exited).signal, 'SIGKILL');
            await db.transaction(async (tx) => {
              await tx.execute(sql`SET LOCAL lock_timeout = '1s'`);
              await tx
                .select({ id: Posts.id })
                .from(Posts)
                .where(eq(Posts.id, x.fixture.quote.post.id))
                .for('update');
            });
            assert.equal(await x.status(), 'REVOKED');
            retryWorker = await Worker.create({
              connection: environment.nativeConnection,
              namespace: environment.namespace,
              taskQueue: crashQueue,
              activities: {
                async writeConsent() {
                  assert.equal(Context.current().info.attempt, 2);
                  const result = await applyDirect(x.fixture, 'REVOKED', 'APPROVED');
                  assert.ok(result);
                  events.push(`${id}:retry-2-committed`);
                  return 'applied';
                },
              },
            });
            retryRun = retryWorker.run();
            await until(
              () => events.includes(`${id}:retry-2-committed`),
              'Temporal retry committed',
            );
            assert.equal(await x.status(), 'APPROVED');
          } finally {
            child.child.kill('SIGKILL');
            await handle.terminate('crash cleanup').catch(() => {});
            wf.shutdown();
            retryWorker?.shutdown();
            await Promise.allSettled([wfRun, retryRun]);
          }
        },
      );
      console.log('EXPERIMENT_EVENTS', JSON.stringify(events));
    } finally {
      for (const gate of gates.values()) {
        gate.resolve();
      }
      for (const handle of handles) {
        await handle.terminate('experiment cleanup').catch(() => {});
      }
      if (workflowWorker.getState() === 'RUNNING') {
        workflowWorker.shutdown();
      }
      activityWorker.shutdown();
      await Promise.allSettled([workflowRun, activityRun]);
      await environment.teardown();
      await pg.end();
    }
  },
);
