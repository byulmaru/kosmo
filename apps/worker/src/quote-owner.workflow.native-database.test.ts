import '@kosmo/core/polyfill';

import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mock, test } from 'node:test';
import { setTimeout as delay } from 'node:timers/promises';
import { getDocumentLoader } from '@fedify/fedify/runtime';
import { QuoteAuthorization } from '@fedify/vocab';
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
import { TestWorkflowEnvironment } from '@temporalio/testing';
import { Worker } from '@temporalio/worker';
import { eq, inArray } from 'drizzle-orm';
import type { QuoteOwnerCommand } from '@kosmo/core/temporal/post-quote-owner';

const deferred = () => {
  let resolve!: () => void;
  const promise = new Promise<void>((r) => (resolve = r));
  return { promise, resolve };
};
const waitFor = async (predicate: () => boolean) => {
  const until = Date.now() + 15000;
  while (!predicate()) {
    if (Date.now() > until) {
      throw new Error('Observation deadline exceeded');
    }
    await delay(20);
  }
};

async function fixture(local = false) {
  const domain = `${randomUUID()}.example`;
  const instance = await db
    .insert(Instances)
    .values({
      domain,
      kind: local ? InstanceKind.LOCAL : InstanceKind.ACTIVITYPUB,
      state: InstanceState.ACTIVE,
      ...(local ? { canonicalOrigin: `https://${domain}` } : {}),
    })
    .returning()
    .then(firstOrThrow);
  const make = async (name: string) => {
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
    const actor = local
      ? `https://${domain}/ap/actor/${profile.id}`
      : `https://${domain}/actor/${name}`;
    if (!local) {
      await db
        .insert(ActivityPubActors)
        .values({ profileId: profile.id, uri: actor, type: ActivityPubActorType.PERSON });
    }
    const content = await db
      .insert(PostContents)
      .values({
        postId: null,
        document: postContentDocumentFromText('authored body https://kept.example/link'),
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
    const uri = local
      ? `https://${domain}/ap/note/${post.id}`
      : `https://${domain}/notes/${post.id}`;
    if (!local) {
      await db
        .insert(ActivityPubPosts)
        .values({ postId: post.id, uri, receivedAt: Temporal.Now.instant() });
    }
    return { post, profile, actor, uri, content };
  };
  const source = await make('source'),
    quote = await make('quote');
  const approval = `https://${domain}/authorization/U`;
  await db
    .update(Posts)
    .set({
      repostSourceId: source.post.id,
      quoteConsentStatus: PostQuoteConsentStatus.PENDING,
      quoteConsentApprovalUri: null,
    })
    .where(eq(Posts.id, quote.post.id));
  return { source, quote, approval, instance };
}

test(
  'production Quote owner는 실제 DB fence·FIFO·ABA reconciliation·Continue-As-New·effect retry를 실행한다',
  { timeout: 120000 },
  async (t) => {
    const environment = await TestWorkflowEnvironment.createLocal({
      server: { executable: { type: 'cached-download', version: 'v1.8.2' } },
    });
    process.env.TEMPORAL_ADDRESS = environment.address;
    process.env.TEMPORAL_NAMESPACE = environment.namespace ?? 'default';
    const production = await import('./activities/quote-owner');
    const { federation } = await import('@kosmo/fedify');
    const { temporalClient } = await import('@kosmo/core/temporal/client');
    const f = await fixture();
    const fixtures = [f];
    const document = await new QuoteAuthorization({
      id: new URL(f.approval),
      attribution: new URL(f.source.actor),
      interactingObject: new URL(f.quote.uri),
      interactionTarget: new URL(f.source.uri),
    }).toJsonLd({ format: 'expand', contextLoader: getDocumentLoader() });
    let gate = deferred();
    let gated = true,
      proofReads = 0;
    const events: string[] = [];
    const effectIds: string[] = [];
    const firstCommand = 'approve-concurrent';
    let failedEffect = false;
    const documents = new Map<string, unknown>([[f.approval, document]]);
    const failOnce = new Set<string>();
    const readsByUri = new Map<string, number>();
    const preparedGates = new Map<string, ReturnType<typeof deferred>>();
    const preparedKinds = new Map<string, string>();
    const lostResponses = new Set<string>();
    const originalContext = federation.createContext.bind(federation);
    const contextMock = mock.method(federation, 'createContext', (origin: URL, data: undefined) =>
      Object.assign(originalContext(origin, data), {
        quoteAuthorizationDocumentLoader: async (url: string) => {
          assert.ok(documents.has(url));
          readsByUri.set(url, (readsByUri.get(url) ?? 0) + 1);
          if (failOnce.delete(url)) {
            throw new Error('Simulated transient issuer timeout');
          }
          proofReads++;
          events.push('proof');
          if (gated) {
            gated = false;
            await gate.promise;
          }
          return { contextUrl: null, document: documents.get(url), documentUrl: url };
        },
      }),
    );
    const taskQueue = `prod924-owner-${randomUUID()}`;
    const worker = await Worker.create({
      connection: environment.nativeConnection,
      namespace: environment.namespace,
      taskQueue,
      workflowsPath: new URL('./workflows/quote-owner.ts', import.meta.url).pathname,
      activities: {
        ...production,
        bootstrapQuoteOwnerActivity: async (
          ...args: Parameters<typeof production.bootstrapQuoteOwnerActivity>
        ) => {
          events.push('bootstrap');
          return production.bootstrapQuoteOwnerActivity(...args);
        },
        drainQuoteOwnerActivity: async (
          ...args: Parameters<typeof production.drainQuoteOwnerActivity>
        ) => {
          await production.drainQuoteOwnerActivity(...args);
          events.push('drain');
        },
        prepareQuoteConsentActivity: async (
          ...args: Parameters<typeof production.prepareQuoteConsentActivity>
        ) => {
          const result = await production.prepareQuoteConsentActivity(...args);
          preparedKinds.set(args[0].commandId, result.kind);
          await preparedGates.get(args[0].commandId)?.promise;
          return result;
        },
        applyQuoteConsentActivity: async (
          ...args: Parameters<typeof production.applyQuoteConsentActivity>
        ) => {
          events.push(`write:${args[0].command.commandId}`);
          const result = await production.applyQuoteConsentActivity(...args);
          events.push(`commit:${args[0].command.commandId}`);
          if (
            ['commit-response-loss', 'initialize-response-loss'].includes(
              args[0].command.commandId,
            ) &&
            !lostResponses.has(args[0].command.commandId) &&
            result.applied
          ) {
            lostResponses.add(args[0].command.commandId);
            throw new Error('DB committed but Activity completion response was lost');
          }
          return result;
        },
        sendQuoteOwnerEffectActivity: async (
          command: QuoteOwnerCommand,
          result: Awaited<ReturnType<typeof production.applyQuoteConsentActivity>>,
          id: string,
        ) => {
          if (!result.applied) {
            return;
          }
          effectIds.push(id);
          events.push(`effect:${command.commandId}`);
          if (command.commandId === firstCommand && !failedEffect) {
            failedEffect = true;
            throw new Error('Simulated remote transport timeout before completion');
          }
        },
      },
    });
    const workerRun = worker.run();
    const handle = await environment.client.workflow.start('postQuoteOwnerWorkflow', {
      workflowId: `post-quote:${f.quote.post.id}`,
      taskQueue,
      args: [{ postId: f.quote.post.id, uncertainHistory: false }],
    });
    const note = (id: string): QuoteOwnerCommand => ({
      kind: 'NOTE',
      postId: f.quote.post.id,
      commandId: id,
      actorUri: f.quote.actor,
      targetUri: f.source.uri,
      format: 'FEP_044F',
      approvalUri: f.approval,
      authorizationUpdate: false,
      duplicateCreate: false,
    });
    const deletion = (id: string): QuoteOwnerCommand => ({
      kind: 'DELETE',
      postId: f.quote.post.id,
      commandId: id,
      actorUri: f.source.actor,
      approvalUri: f.approval,
      activityId: null,
      targetUri: null,
    });
    const status = async () =>
      db.select().from(Posts).where(eq(Posts.id, f.quote.post.id)).then(firstOrThrow);
    const update = (command: QuoteOwnerCommand, updateId = command.commandId) =>
      handle.executeUpdate('quoteCommand', { args: [command], updateId });
    try {
      await t.test(
        '동일 command의 동시 Update는 한 번의 proof·write로 수렴하고 effect retry ID를 유지한다',
        async () => {
          const first = update(note(firstCommand), 'admission-one');
          await waitFor(() => proofReads === 1);
          const duplicate = update(note(firstCommand), 'admission-two');
          await delay(100);
          assert.equal((await status()).quoteConsentStatus, PostQuoteConsentStatus.PENDING);
          assert.equal(
            events.some((event) => event.startsWith('write:')),
            false,
          );
          gate.resolve();
          for (const preparedGate of preparedGates.values()) {
            preparedGate.resolve();
          }
          const results = await Promise.all([first, duplicate]);
          assert.deepEqual(results[0], results[1]);
          await waitFor(() => effectIds.length >= 2);
          assert.equal(effectIds[0], effectIds[1]);
          assert.equal(proofReads, 1);
          assert.equal(events.filter((event) => event === `write:${firstCommand}`).length, 1);
          assert.equal((await status()).quoteConsentStatus, PostQuoteConsentStatus.APPROVED);
        },
      );
      await t.test('동일 URI 재승인 후 Delete는 issuer 재검증으로 승인을 유지한다', async () => {
        await update(deletion('clear-delete'));
        assert.equal((await status()).quoteConsentStatus, PostQuoteConsentStatus.REVOKED);
        assert.equal(proofReads, 1);
        await update(note('reapprove-same-uri'));
        assert.equal((await status()).quoteConsentStatus, PostQuoteConsentStatus.APPROVED);
        const before = proofReads;
        await update(deletion('old-delete-after-reapproval'));
        assert.equal(proofReads, before + 1);
        const row = await status();
        assert.equal(row.quoteConsentStatus, PostQuoteConsentStatus.APPROVED);
        assert.equal(row.repostSourceId, f.source.post.id);
      });
      await t.test('독립 명령은 선행 READ가 끝난 뒤 FIFO WRITE 경계를 통과한다', async () => {
        gated = true;
        gate = deferred();
        const expectedReads = proofReads + 1;
        const first = update(note('fifo-refresh'));
        await waitFor(() => proofReads === expectedReads);
        const second = update(deletion('fifo-ambiguous-delete'));
        await delay(100);
        assert.equal(proofReads, expectedReads);
        assert.equal(events.includes('write:fifo-ambiguous-delete'), false);
        gate.resolve();
        for (const preparedGate of preparedGates.values()) {
          preparedGate.resolve();
        }
        await Promise.all([first, second]);
        assert.ok(
          events.indexOf('commit:fifo-refresh') < events.indexOf('write:fifo-ambiguous-delete'),
        );
        assert.equal((await status()).quoteConsentStatus, PostQuoteConsentStatus.APPROVED);
      });
      await t.test('commit 응답 유실은 기존 CAS 실패 뒤 fresh proof로 재검증한다', async () => {
        const second = await fixture();
        fixtures.push(second);
        documents.set(
          second.approval,
          await new QuoteAuthorization({
            id: new URL(second.approval),
            attribution: new URL(second.source.actor),
            interactingObject: new URL(second.quote.uri),
            interactionTarget: new URL(second.source.uri),
          }).toJsonLd({ format: 'expand', contextLoader: getDocumentLoader() }),
        );
        const secondHandle = await environment.client.workflow.start('postQuoteOwnerWorkflow', {
          workflowId: `post-quote:${second.quote.post.id}`,
          taskQueue,
          args: [{ postId: second.quote.post.id, uncertainHistory: false }],
        });
        const before = proofReads;
        const command: QuoteOwnerCommand = {
          kind: 'NOTE',
          postId: second.quote.post.id,
          commandId: 'commit-response-loss',
          actorUri: second.quote.actor,
          targetUri: second.source.uri,
          format: 'FEP_044F',
          approvalUri: second.approval,
          authorizationUpdate: false,
          duplicateCreate: false,
        };
        const result = await secondHandle.executeUpdate<{ status: string }, [QuoteOwnerCommand]>(
          'quoteCommand',
          {
            args: [command],
            updateId: command.commandId,
          },
        );
        assert.equal(result.status, PostQuoteConsentStatus.APPROVED);
        assert.equal(lostResponses.has('commit-response-loss'), true);
        assert.equal(proofReads, before + 2);
        assert.equal(events.filter((event) => event === 'write:commit-response-loss').length, 3);
        await waitFor(() => effectIds.some((id) => id.includes('commit-response-loss')));
        assert.equal(effectIds.filter((id) => id.includes('commit-response-loss')).length, 1);
        await secondHandle.signal('finishQuoteOwner');
        await secondHandle.result();
      });
      await t.test('로컬 INITIALIZE는 commit 응답 유실 후 중복 생성 없이 복구한다', async () => {
        const local = await fixture(true);
        fixtures.push(local);
        await db
          .update(Posts)
          .set({ currentContentId: null })
          .where(eq(Posts.id, local.quote.post.id));
        await db.delete(Posts).where(eq(Posts.id, local.quote.post.id));
        await db.delete(PostContents).where(eq(PostContents.id, local.quote.content.id));
        const localHandle = await environment.client.workflow.start('postQuoteOwnerWorkflow', {
          workflowId: `post-quote:${local.quote.post.id}`,
          taskQueue,
          args: [
            {
              postId: local.quote.post.id,
              initialSourcePostId: local.source.post.id,
              uncertainHistory: false,
            },
          ],
        });
        const command: QuoteOwnerCommand = {
          kind: 'INITIALIZE',
          postId: local.quote.post.id,
          commandId: 'initialize-response-loss',
          input: {
            origin: 'LOCAL',
            profileId: local.quote.profile.id,
            repostSourceId: local.source.post.id,
            document: local.quote.content.document,
            authoredBodyText: 'authored body https://kept.example/link',
            visibility: PostVisibility.PUBLIC,
          },
        };
        const result = await localHandle.executeUpdate<{ status: string }, [QuoteOwnerCommand]>(
          'quoteCommand',
          { args: [command], updateId: command.commandId },
        );
        assert.equal(result.status, PostQuoteConsentStatus.APPROVED);
        assert.equal(lostResponses.has(command.commandId), true);
        const row = await db
          .select()
          .from(Posts)
          .where(eq(Posts.id, command.postId))
          .then(firstOrThrow);
        assert.equal(row.repostSourceId, local.source.post.id);
        assert.equal(row.quoteConsentApprovalUri, null);
        const contents = await db
          .select()
          .from(PostContents)
          .where(eq(PostContents.postId, command.postId));
        assert.equal(contents.length, 1);
        assert.deepEqual(contents[0].document, local.quote.content.document);
        local.quote.content = contents[0];
        await waitFor(() => effectIds.some((id) => id.includes(command.commandId)));
        assert.equal(effectIds.filter((id) => id.includes(command.commandId)).length, 1);
        await localHandle.signal('finishQuoteOwner');
        await localHandle.result();
      });
      await t.test('새 승인 명령은 이전 NOTE의 내부 재검증을 대체한다', async () => {
        const stale = await fixture();
        fixtures.push(stale);
        const u1 = stale.approval,
          u2 = stale.approval + '-new';
        for (const uri of [u1, u2]) {
          documents.set(
            uri,
            await new QuoteAuthorization({
              id: new URL(uri),
              attribution: new URL(stale.source.actor),
              interactingObject: new URL(stale.quote.uri),
              interactionTarget: new URL(stale.source.uri),
            }).toJsonLd({ format: 'expand', contextLoader: getDocumentLoader() }),
          );
        }
        failOnce.add(u1);
        const staleHandle = await environment.client.workflow.start('postQuoteOwnerWorkflow', {
          workflowId: `post-quote:${stale.quote.post.id}`,
          taskQueue,
          args: [{ postId: stale.quote.post.id, uncertainHistory: false }],
        });
        const command = (uri: string, id: string): QuoteOwnerCommand => ({
          kind: 'NOTE',
          postId: stale.quote.post.id,
          commandId: id,
          actorUri: stale.quote.actor,
          targetUri: stale.source.uri,
          format: 'FEP_044F',
          approvalUri: uri,
          authorizationUpdate: true,
          duplicateCreate: false,
        });
        const first = await staleHandle.executeUpdate<{ retryable: boolean }, [QuoteOwnerCommand]>(
          'quoteCommand',
          { args: [command(u1, 'stale-proof-U1')], updateId: 'stale-proof-U1' },
        );
        assert.equal(first.retryable, true);
        const firstWrites = events.filter((event) => event === 'write:stale-proof-U1').length;
        await staleHandle.executeUpdate('quoteCommand', {
          args: [command(u2, 'current-proof-U2')],
          updateId: 'current-proof-U2',
        });
        await delay(1200);
        const work = await staleHandle.query<{ phase: string }>('quoteOwnerWork');
        assert.equal(work.phase, 'IDLE');
        const row = await db
          .select()
          .from(Posts)
          .where(eq(Posts.id, stale.quote.post.id))
          .then(firstOrThrow);
        assert.equal(row.quoteConsentStatus, PostQuoteConsentStatus.APPROVED);
        assert.equal(row.quoteConsentApprovalUri, u2);
        assert.equal(readsByUri.get(u1), 1);
        assert.equal(
          events.filter((event) => event === 'write:stale-proof-U1').length,
          firstWrites,
        );
        await staleHandle.signal('finishQuoteOwner');
        await staleHandle.result();
      });
      await t.test('중복 Create는 현재 PENDING 승인 재검증을 취소하지 않는다', async () => {
        const pending = await fixture();
        fixtures.push(pending);
        documents.set(
          pending.approval,
          await new QuoteAuthorization({
            id: new URL(pending.approval),
            attribution: new URL(pending.source.actor),
            interactingObject: new URL(pending.quote.uri),
            interactionTarget: new URL(pending.source.uri),
          }).toJsonLd({ format: 'expand', contextLoader: getDocumentLoader() }),
        );
        failOnce.add(pending.approval);
        const pendingHandle = await environment.client.workflow.start('postQuoteOwnerWorkflow', {
          workflowId: `post-quote:${pending.quote.post.id}`,
          taskQueue,
          args: [{ postId: pending.quote.post.id, uncertainHistory: false }],
        });
        const first: QuoteOwnerCommand = {
          kind: 'NOTE',
          postId: pending.quote.post.id,
          commandId: 'pending-proof-U1',
          actorUri: pending.quote.actor,
          targetUri: pending.source.uri,
          format: 'FEP_044F',
          approvalUri: pending.approval,
          authorizationUpdate: false,
          duplicateCreate: false,
        };
        const result = await pendingHandle.executeUpdate<
          { retryable: boolean },
          [QuoteOwnerCommand]
        >('quoteCommand', { args: [first], updateId: first.commandId });
        assert.equal(result.retryable, true);
        await pendingHandle.executeUpdate('quoteCommand', {
          args: [
            {
              ...first,
              commandId: 'duplicate-pending-create',
              approvalUri: null,
              duplicateCreate: true,
            },
          ],
          updateId: 'duplicate-pending-create',
        });
        await waitFor(() => readsByUri.get(pending.approval) === 2);
        await delay(300);
        const row = await db
          .select()
          .from(Posts)
          .where(eq(Posts.id, pending.quote.post.id))
          .then(firstOrThrow);
        assert.equal(row.quoteConsentStatus, PostQuoteConsentStatus.APPROVED);
        assert.equal(row.quoteConsentApprovalUri, pending.approval);
        await pendingHandle.signal('finishQuoteOwner');
        await pendingHandle.result();
      });
      await t.test(
        'Source 없는 Quote가 READ 뒤 삭제되면 PENDING 쓰기를 적용하지 않는다',
        async () => {
          const deleted = await fixture();
          fixtures.push(deleted);
          await db
            .update(Posts)
            .set({ state: PostState.DELETED })
            .where(eq(Posts.id, deleted.source.post.id));
          await db
            .update(Posts)
            .set({ repostSourceId: null, quoteConsentStatus: null })
            .where(eq(Posts.id, deleted.quote.post.id));
          const readGate = deferred();
          preparedGates.set('deleted-after-read', readGate);
          const deletedHandle = await environment.client.workflow.start('postQuoteOwnerWorkflow', {
            workflowId: `post-quote:${deleted.quote.post.id}`,
            taskQueue,
            args: [{ postId: deleted.quote.post.id, uncertainHistory: false }],
          });
          const command: QuoteOwnerCommand = {
            kind: 'NOTE',
            postId: deleted.quote.post.id,
            commandId: 'deleted-after-read',
            actorUri: deleted.quote.actor,
            targetUri: deleted.source.uri,
            format: 'FEP_044F',
            approvalUri: deleted.approval,
            authorizationUpdate: false,
            duplicateCreate: false,
          };
          const completion = deletedHandle.executeUpdate('quoteCommand', {
            args: [command],
            updateId: command.commandId,
          });
          await waitFor(() => preparedKinds.has(command.commandId));
          assert.equal(preparedKinds.get(command.commandId), 'PENDING_WITHOUT_SOURCE');
          await db
            .update(Posts)
            .set({ state: PostState.DELETED })
            .where(eq(Posts.id, command.postId));
          readGate.resolve();
          await completion;
          const row = await db
            .select()
            .from(Posts)
            .where(eq(Posts.id, command.postId))
            .then(firstOrThrow);
          assert.equal(row.state, PostState.DELETED);
          assert.equal(row.quoteConsentStatus, null);
          assert.equal(row.quoteConsentApprovalUri, null);
          assert.equal(row.repostSourceId, null);
          await deletedHandle.signal('finishQuoteOwner');
          await deletedHandle.result();
        },
      );
      await t.test('Continue-As-New는 drain 후 새 Run bootstrap을 실행한다', async () => {
        const before = await handle.describe();
        const bootstraps = events.filter((event) => event === 'bootstrap').length;
        await handle.signal('continueQuoteOwner');
        await waitFor(() => events.filter((event) => event === 'bootstrap').length > bootstraps);
        const after = await handle.describe();
        assert.notEqual(before.runId, after.runId);
        const secondBootstrap = events.lastIndexOf('bootstrap');
        assert.equal(events[secondBootstrap - 1], 'drain');
        await update(note('after-continue'));
        assert.equal((await status()).quoteConsentStatus, PostQuoteConsentStatus.APPROVED);
        const content = await db
          .select()
          .from(PostContents)
          .where(eq(PostContents.id, f.quote.content.id))
          .then(firstOrThrow);
        assert.deepEqual(content.document, f.quote.content.document);
        await handle.signal('finishQuoteOwner');
        await handle.result();
        assert.equal(events.at(-1), 'drain');
      });
    } finally {
      gate.resolve();
      for (const preparedGate of preparedGates.values()) {
        preparedGate.resolve();
      }
      const description = await handle.describe().catch(() => null);
      if (description?.status.name === 'RUNNING') {
        await handle.signal('finishQuoteOwner');
        await handle.result().catch(() => undefined);
      }
      worker.shutdown();
      await workerRun;
      contextMock.mock.restore();
      await temporalClient.connection.close();
      await environment.teardown();
      try {
        for (const fixture of fixtures) {
          await db
            .update(PostContents)
            .set({ postId: null })
            .where(inArray(PostContents.postId, [fixture.quote.post.id, fixture.source.post.id]));
          await db
            .update(Posts)
            .set({ currentContentId: null, repostSourceId: null })
            .where(inArray(Posts.id, [fixture.quote.post.id, fixture.source.post.id]));
          await db
            .delete(Posts)
            .where(inArray(Posts.id, [fixture.quote.post.id, fixture.source.post.id]));
          await db
            .delete(PostContents)
            .where(inArray(PostContents.id, [fixture.quote.content.id, fixture.source.content.id]));
          await db.delete(Profiles).where(eq(Profiles.instanceId, fixture.instance.id));
          await db.delete(Instances).where(eq(Instances.id, fixture.instance.id));
        }
      } finally {
        await pg.end({ timeout: 5 });
      }
    }
  },
);
