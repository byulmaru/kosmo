import '@kosmo/core/polyfill';

import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import { readFile, unlink, writeFile } from 'node:fs/promises';
import { test } from 'node:test';
import { setTimeout as delay } from 'node:timers/promises';
import { KOSMO_TASK_QUEUE } from '@kosmo/core/temporal/task-queue';
import { ApplicationFailure } from '@temporalio/activity';
import { TestWorkflowEnvironment } from '@temporalio/testing';
import { Worker } from '@temporalio/worker';
import { and, eq, inArray } from 'drizzle-orm';
import type { pg as corePg } from '@kosmo/core/db';
import type { PostContentDocumentV1 } from '@kosmo/core/post-content';
import type { LocalPostInput } from '../../../packages/core/services/post';

process.env.DATABASE_URL ??= 'postgres://kosmo:kosmo@localhost:54329/kosmo_test';
const databaseUrl = new URL(process.env.DATABASE_URL);
process.env.PGHOST ??= databaseUrl.hostname;
process.env.PGPORT ??= databaseUrl.port || '5432';
process.env.PGUSER ??= decodeURIComponent(databaseUrl.username);
process.env.PGPASSWORD ??= decodeURIComponent(databaseUrl.password);
process.env.PGDATABASE ??= decodeURIComponent(databaseUrl.pathname.slice(1));

type AdmissionLocalPostInput = {
  readonly accountId?: string;
  readonly admissionId: string;
  readonly document: PostContentDocumentV1;
  readonly origin: 'LOCAL';
  readonly profileId: string;
  readonly repostSourceId?: string;
  readonly visibility: 'PUBLIC';
  readonly media?: readonly { altText: string | null; mediaId: string }[];
};

type AdmissionChildResult = {
  readonly kind: 'error' | 'rejected' | 'success';
  readonly message: string;
  readonly postId?: string;
  readonly contentId?: string;
  readonly before: readonly { id: string; currentContentId: string | null }[];
  readonly after: readonly { id: string; currentContentId: string | null }[];
};

const deferred = () => {
  let resolve!: () => void;
  const promise = new Promise<void>((resolvePromise) => {
    resolve = resolvePromise;
  });
  return { promise, resolve };
};

const waitFor = async (condition: () => boolean | Promise<boolean>, timeoutMs = 30_000) => {
  const deadline = Date.now() + timeoutMs;
  while (!(await condition())) {
    if (Date.now() >= deadline) {
      throw new Error('Post create observation deadline exceeded');
    }
    await delay(25);
  }
};

const admissionId = (timestamp = Date.now()) => `${timestamp}:${randomUUID()}`;

const isChildProcess = process.env.POST_ADMISSION_CHILD === '1';

const runAdmissionChild = async () => {
  const input = JSON.parse(process.argv[2] ?? '{}') as AdmissionLocalPostInput;
  const resultPath = process.env.POST_ADMISSION_CHILD_RESULT;
  if (!resultPath) {
    throw new Error('POST_ADMISSION_CHILD_RESULT is required');
  }
  const expected = process.env.POST_ADMISSION_CHILD_EXPECT ?? 'success';
  const result = {
    kind: 'error' as 'error' | 'success' | 'rejected',
    message: '',
    postId: undefined as string | undefined,
    contentId: undefined as string | undefined,
    before: [] as { id: string; currentContentId: string | null }[],
    after: [] as { id: string; currentContentId: string | null }[],
  };
  let childWorker: Worker | undefined;
  let childWorkerRun: Promise<void> | undefined;
  let childEnvironment: TestWorkflowEnvironment | undefined;
  let childPg: typeof corePg | undefined;
  try {
    childEnvironment = await TestWorkflowEnvironment.createLocal({
      server: { executable: { type: 'cached-download', version: 'v1.8.2' } },
    });
    process.env.TEMPORAL_ADDRESS = childEnvironment.address;
    process.env.TEMPORAL_NAMESPACE = childEnvironment.namespace ?? 'default';
    const [coreDb, coreServices, temporalPost] = await Promise.all([
      import('@kosmo/core/db'),
      import('@kosmo/core/services'),
      import('@kosmo/core/temporal/post'),
    ]);
    const production = await import('./activities');
    const { db, pg, Posts } = coreDb;
    childPg = pg;
    const { createPost } = coreServices;
    const { ValidationError } = await import('@kosmo/core/error');
    const { postCreateWorkflow } = temporalPost;

    childWorker = await Worker.create({
      connection: childEnvironment.nativeConnection,
      namespace: childEnvironment.namespace,
      taskQueue: KOSMO_TASK_QUEUE,
      workflowsPath: new URL('./workflows/index.ts', import.meta.url).pathname,
      activities: {
        ...production,
        createReplyNotificationActivity: async () => {},
        createQuoteNotificationActivity: async () => {},
        sendLocalPostCreateActivity: async () => {},
        sendLocalPostDeleteActivity: async () => {},
        sendLocalPostQuoteRequestActivity: async () => {},
        sendQuoteOwnerEffectActivity: async () => {},
      },
    });
    childWorkerRun = childWorker.run();
    const selectRows = () =>
      db
        .select({ id: Posts.id, currentContentId: Posts.currentContentId })
        .from(Posts)
        .where(
          and(
            eq(Posts.profileId, input.profileId),
            eq(Posts.repostSourceId, input.repostSourceId!),
          ),
        );
    result.before = await selectRows();
    if (expected === 'success') {
      const created = await createPost(input);
      result.postId = created.post.id;
      result.contentId = created.content.id;
      await childEnvironment.client.workflow
        .getHandle(postCreateWorkflow.workflowIdFromArgs(input))
        .result();
      const ownerHandle = childEnvironment.client.workflow.getHandle(
        `post-quote:${created.post.id}`,
      );
      await ownerHandle.signal('finishQuoteOwner').catch(() => undefined);
      await ownerHandle.result().catch(() => undefined);
      result.kind = 'success';
    } else {
      await assert.rejects(
        createPost(input),
        (error: unknown) => error instanceof ValidationError && error.field === 'admissionId',
      );
      result.kind = 'rejected';
    }
    result.after = await selectRows();
  } catch (error) {
    result.kind = 'error';
    result.message = error instanceof Error ? (error.stack ?? error.message) : String(error);
  } finally {
    childWorker?.shutdown();
    await childWorkerRun?.catch(() => undefined);
    await childEnvironment?.teardown().catch(() => undefined);
    await childPg?.end().catch(() => undefined);
    await writeFile(resultPath, JSON.stringify(result));
  }
  if (result.kind === 'error') {
    throw new Error(result.message);
  }
};

if (isChildProcess) {
  await runAdmissionChild();
} else {
  test(
    'Post admission은 실제 PostgreSQL·Temporal에서 Quote owner와 stable identity를 보존한다',
    { timeout: 240_000 },
    async (t) => {
      const environment = await TestWorkflowEnvironment.createLocal({
        server: { executable: { type: 'cached-download', version: 'v1.8.2' } },
      });
      process.env.TEMPORAL_ADDRESS = environment.address;
      process.env.TEMPORAL_NAMESPACE = environment.namespace ?? 'default';

      const [
        coreDb,
        coreServices,
        coreEnums,
        coreError,
        coreDocument,
        temporalPost,
        coreAdmission,
      ] = await Promise.all([
        import('@kosmo/core/db'),
        import('@kosmo/core/services'),
        import('@kosmo/core/enums'),
        import('@kosmo/core/error'),
        import('@kosmo/core/post-content/server'),
        import('@kosmo/core/temporal/post'),
        import('@kosmo/core/temporal/post-admission'),
      ]);
      const production = await import('./activities');

      const {
        Accounts,
        AccountProfiles,
        db,
        firstOrThrow,
        Instances,
        pg,
        PostContents,
        Posts,
        Profiles,
      } = coreDb;
      const {
        InstanceKind,
        InstanceState,
        PostState,
        PostVisibility,
        ProfileFollowPolicy,
        ProfileState,
      } = coreEnums;
      const { postContentDocumentFromText } = coreDocument;
      const { createPost } = coreServices;
      const { ValidationError } = coreError;
      const { postCreateIdentities } = coreAdmission;
      const { postCreateInputKey, postCreateWorkflow } = temporalPost;

      const instance = await db
        .insert(Instances)
        .values({
          canonicalOrigin: `https://${randomUUID()}.example`,
          domain: `${randomUUID()}.example`,
          kind: InstanceKind.LOCAL,
          state: InstanceState.ACTIVE,
        })
        .returning()
        .then(firstOrThrow);

      const createProfile = async (label: string) => {
        const handle = `${label}-${randomUUID()}`;
        return db
          .insert(Profiles)
          .values({
            displayName: label,
            followPolicy: ProfileFollowPolicy.OPEN,
            handle,
            instanceId: instance.id,
            normalizedHandle: handle,
            state: ProfileState.ACTIVE,
          })
          .returning()
          .then(firstOrThrow);
      };

      const createSource = async (profileId: string, text: string) => {
        const content = await db
          .insert(PostContents)
          .values({
            document: postContentDocumentFromText(text),
            postId: null,
          })
          .returning()
          .then(firstOrThrow);
        const post = await db
          .insert(Posts)
          .values({
            currentContentId: content.id,
            profileId,
            state: PostState.ACTIVE,
            visibility: PostVisibility.PUBLIC,
          })
          .returning()
          .then(firstOrThrow);
        await db
          .update(PostContents)
          .set({ postId: post.id })
          .where(eq(PostContents.id, content.id));
        return post;
      };

      const quoteProfile = await createProfile('quote');
      const otherProfile = await createProfile('other');
      const source = await createSource(quoteProfile.id, 'source one');
      const otherSource = await createSource(otherProfile.id, 'source two');

      let transitionGate: ReturnType<typeof deferred> | undefined;
      let transitionEntered: ReturnType<typeof deferred> | undefined;
      let transitionResponseLossOnce = false;
      let transitionResponseLost: ReturnType<typeof deferred> | undefined;
      let quoteApplyGate: ReturnType<typeof deferred> | undefined;
      let quoteApplyEntered: ReturnType<typeof deferred> | undefined;
      let quoteApplyResponseLossOnce = false;
      let quoteApplyResponseLost: ReturnType<typeof deferred> | undefined;
      let failCreateEffectOnce = false;
      let createEffectFailed: ReturnType<typeof deferred> | undefined;
      const workers: Array<{ worker: Worker; run: Promise<void>; stopped: boolean }> = [];

      const createWorker = async () => {
        const worker = await Worker.create({
          connection: environment.nativeConnection,
          namespace: environment.namespace,
          taskQueue: KOSMO_TASK_QUEUE,
          workflowsPath: new URL('./workflows/index.ts', import.meta.url).pathname,
          activities: {
            ...production,
            createPostTransitionActivity: async (
              ...args: Parameters<typeof production.createPostTransitionActivity>
            ) => {
              const gate = transitionGate;
              if (gate) {
                transitionGate = undefined;
                transitionEntered?.resolve();
                await gate.promise;
              }
              const result = await production.createPostTransitionActivity(...args);
              if (transitionResponseLossOnce && result.ok) {
                transitionResponseLossOnce = false;
                transitionResponseLost?.resolve();
                throw new Error('Simulated post transition completion loss');
              }
              return result;
            },
            applyQuoteConsentActivity: async (
              ...args: Parameters<typeof production.applyQuoteConsentActivity>
            ) => {
              const gate = quoteApplyGate;
              if (gate) {
                quoteApplyGate = undefined;
                quoteApplyEntered?.resolve();
                await gate.promise;
              }
              const result = await production.applyQuoteConsentActivity(...args);
              if (quoteApplyResponseLossOnce && result.applied) {
                quoteApplyResponseLossOnce = false;
                quoteApplyResponseLost?.resolve();
                throw new Error('Simulated Quote owner completion loss');
              }
              return result;
            },
            createReplyNotificationActivity: async () => {},
            createQuoteNotificationActivity: async () => {},
            sendLocalPostCreateActivity: async () => {
              if (failCreateEffectOnce) {
                failCreateEffectOnce = false;
                createEffectFailed?.resolve();
                throw ApplicationFailure.nonRetryable('Simulated post-create effect failure');
              }
            },
            sendLocalPostDeleteActivity: async () => {},
            sendLocalPostQuoteRequestActivity: async () => {},
            sendQuoteOwnerEffectActivity: async () => {},
          },
        });
        const run = worker.run();
        workers.push({ worker, run, stopped: false });
        return worker;
      };

      const stopWorker = async (worker: Worker) => {
        const entry = workers.find((candidate) => candidate.worker === worker);
        if (entry && !entry.stopped) {
          entry.stopped = true;
          worker.shutdown();
        }
        await entry?.run;
      };

      const quoteInput = (
        profileId: string,
        repostSourceId: string,
        body: string,
        id = admissionId(),
      ): AdmissionLocalPostInput => ({
        admissionId: id,
        document: postContentDocumentFromText(body),
        origin: 'LOCAL',
        profileId,
        repostSourceId,
        visibility: PostVisibility.PUBLIC,
      });

      const runChild = async (
        input: AdmissionLocalPostInput,
        expected: 'reject' | 'success',
      ): Promise<AdmissionChildResult> => {
        const resultPath = `/private/tmp/post-admission-child-${randomUUID()}.json`;
        const child = spawn(
          process.execPath,
          ['--import', 'tsx', new URL(import.meta.url).pathname, JSON.stringify(input)],
          {
            cwd: process.cwd(),
            env: {
              ...process.env,
              POST_ADMISSION_CHILD: '1',
              POST_ADMISSION_CHILD_EXPECT: expected,
              POST_ADMISSION_CHILD_RESULT: resultPath,
            },
            stdio: 'ignore',
          },
        );
        const exitCode = await new Promise<number>((resolve, reject) => {
          child.once('error', reject);
          child.once('exit', (code) => resolve(code ?? 1));
        });
        const raw = await readFile(resultPath, 'utf8').catch(() => '');
        await unlink(resultPath).catch(() => undefined);
        assert.equal(exitCode, 0, raw);
        return JSON.parse(raw) as AdmissionChildResult;
      };

      t.after(async () => {
        transitionGate?.resolve();
        for (const entry of workers.reverse()) {
          if (!entry.stopped) {
            entry.stopped = true;
            entry.worker.shutdown();
          }
          await entry.run;
        }
        await environment.teardown();
        await pg.end();
      });

      const worker = await createWorker();

      await t.test(
        'timeout 뒤 late commit은 같은 identity 재전송에서 한 Post와 Content로 수렴한다',
        async () => {
          const account = await db
            .insert(Accounts)
            .values({
              displayName: 'Quote timeout author',
              oidcSubject: randomUUID(),
              state: coreEnums.AccountState.ACTIVE,
            })
            .returning()
            .then(firstOrThrow);
          await db.insert(AccountProfiles).values({
            accountId: account.id,
            profileId: quoteProfile.id,
            role: coreEnums.AccountProfileRole.OWNER,
          });
          const input = {
            ...quoteInput(quoteProfile.id, source.id, 'late quote'),
            accountId: account.id,
          };
          const gate = deferred();
          transitionGate = gate;
          transitionEntered = deferred();
          const firstAttempt = createPost(input).then(
            (value) => ({ status: 'fulfilled' as const, value }),
            (error) => ({ status: 'rejected' as const, error }),
          );
          const started = await Promise.race([
            transitionEntered.promise.then(() => 'transition-entered' as const),
            firstAttempt.then((result) => result),
          ]);
          if (started !== 'transition-entered') {
            if (started.status === 'rejected') {
              throw started.error;
            }
            throw new Error('Post create completed before the transition gate was entered');
          }

          await delay(31_000);
          const firstResult = await firstAttempt;
          assert.equal(firstResult.status, 'rejected');

          gate.resolve();
          const beforePosts = await db
            .select()
            .from(Posts)
            .where(and(eq(Posts.profileId, quoteProfile.id), eq(Posts.repostSourceId, source.id)));
          await waitFor(
            async () =>
              (
                await db
                  .select()
                  .from(Posts)
                  .where(
                    and(eq(Posts.profileId, quoteProfile.id), eq(Posts.repostSourceId, source.id)),
                  )
              ).length ===
              beforePosts.length + 1,
          );

          const recovered = await createPost(input);
          assert.equal(recovered.created, true);
          const posts = await db
            .select()
            .from(Posts)
            .where(and(eq(Posts.profileId, quoteProfile.id), eq(Posts.repostSourceId, source.id)));
          const contents = await db
            .select()
            .from(PostContents)
            .where(
              inArray(
                PostContents.postId,
                posts.map(({ id }) => id),
              ),
            );
          assert.equal(posts.length, 1);
          assert.equal(contents.length, 1);
          assert.equal(recovered.post.id, posts[0]?.id);
          assert.equal(recovered.content.id, contents[0]?.id);
          assert.equal(posts[0]?.actorAccountId, account.id);
          assert.equal(recovered.post.actorAccountId, account.id);
          await assert.rejects(createPost({ ...input, accountId: randomUUID() }), ValidationError);
        },
      );

      await t.test(
        'same identity는 profile·document·source·media payload 변경을 거부한다',
        async () => {
          const base = quoteInput(quoteProfile.id, source.id, 'identity payload');
          const created = await createPost(base);
          const directBodyMismatch = await production.createPostTransitionActivity(
            { ...base, document: postContentDocumentFromText('changed directly') },
            created.post.id,
          );
          assert.equal(directBodyMismatch.ok, false);
          if (!directBodyMismatch.ok) {
            assert.equal(directBodyMismatch.error.field, 'admissionId');
          }
          const directMediaMismatch = await production.createPostTransitionActivity(
            { ...base, media: [{ altText: null, mediaId: randomUUID() }] },
            created.post.id,
          );
          assert.equal(directMediaMismatch.ok, false);
          if (!directMediaMismatch.ok) {
            assert.equal(directMediaMismatch.error.field, 'admissionId');
          }
          const before = await db
            .select()
            .from(Posts)
            .where(and(eq(Posts.profileId, quoteProfile.id), eq(Posts.repostSourceId, source.id)));

          const assertMismatch = (promise: Promise<unknown>) =>
            assert.rejects(
              promise,
              (error: unknown) => error instanceof ValidationError && error.field === 'admissionId',
            );
          await assertMismatch(createPost({ ...base, profileId: otherProfile.id }));
          await assertMismatch(
            createPost({ ...base, document: postContentDocumentFromText('changed') }),
          );
          await assertMismatch(createPost({ ...base, repostSourceId: otherSource.id }));
          await assertMismatch(createPost({ ...base, repostSourceId: undefined }));
          await assertMismatch(
            createPost({
              ...base,
              media: [{ altText: null, mediaId: randomUUID() }],
            }),
          );

          const after = await db
            .select()
            .from(Posts)
            .where(and(eq(Posts.profileId, quoteProfile.id), eq(Posts.repostSourceId, source.id)));
          assert.equal(created.created, true);
          assert.deepEqual(
            after.map(({ id, currentContentId, repostSourceId }) => ({
              id,
              currentContentId,
              repostSourceId,
            })),
            before.map(({ id, currentContentId, repostSourceId }) => ({
              id,
              currentContentId,
              repostSourceId,
            })),
          );
        },
      );

      await t.test('두 명시적 identity는 서로 다른 Quote Post를 생성한다', async () => {
        const first = await createPost(quoteInput(quoteProfile.id, source.id, 'explicit one'));
        const second = await createPost(quoteInput(quoteProfile.id, source.id, 'explicit two'));
        assert.notEqual(first.post.id, second.post.id);
        assert.notEqual(first.content.id, second.content.id);
      });

      await t.test(
        'in-progress concurrent reconnect와 completed result는 같은 결과를 반환한다',
        async () => {
          const input = quoteInput(quoteProfile.id, source.id, 'concurrent reconnect');
          const gate = deferred();
          transitionGate = gate;
          transitionEntered = deferred();
          const first = createPost(input);
          await transitionEntered.promise;
          const second = createPost(input);
          gate.resolve();
          const [firstResult, secondResult] = await Promise.all([first, second]);
          assert.equal(firstResult.post.id, secondResult.post.id);
          assert.equal(firstResult.content.id, secondResult.content.id);

          const completed = await createPost(input);
          assert.equal(completed.post.id, firstResult.post.id);
          assert.equal(completed.content.id, firstResult.content.id);
        },
      );

      await t.test(
        'Worker shutdown 뒤 같은 Temporal Run을 replacement Worker가 재개한다',
        async () => {
          const input = quoteInput(quoteProfile.id, source.id, 'worker restart');
          const workflowId = postCreateWorkflow.workflowIdFromArgs(input);
          const handle = await environment.client.workflow.start('postCreateWorkflow', {
            args: [input],
            taskQueue: KOSMO_TASK_QUEUE,
            workflowId,
            workflowIdConflictPolicy: 'USE_EXISTING',
          });
          const runId = (await handle.describe()).runId;

          await stopWorker(worker);
          await createWorker();

          const result = await createPost(input);
          assert.equal(result.created, true);
          assert.equal((await handle.describe()).runId, runId);
          assert.equal(result.post.profileId, quoteProfile.id);
          await handle.result();
        },
      );

      await t.test('namespace TTL 안의 오래된 identity는 기존 Update 결과를 회수한다', async () => {
        const input = quoteInput(
          quoteProfile.id,
          source.id,
          'old retained result',
          admissionId(Date.now() - 10 * 60_000),
        );
        const workflowId = postCreateWorkflow.workflowIdFromArgs(input);
        const handle = await environment.client.workflow.start('postCreateWorkflow', {
          args: [input],
          taskQueue: KOSMO_TASK_QUEUE,
          workflowId,
          workflowIdConflictPolicy: 'USE_EXISTING',
          workflowIdReusePolicy: 'REJECT_DUPLICATE',
        });
        const updateId = createHash('sha256').update(postCreateInputKey(input)).digest('hex');
        const first = await handle.executeUpdate<
          { ok: boolean; result?: { postId: string } },
          [AdmissionLocalPostInput]
        >('createPost', { args: [input], updateId });
        await handle.result();

        const recovered = await createPost(input);
        assert.equal(first.ok, true);
        if (!first.ok || !first.result) {
          assert.fail('Direct UWS did not create the retained Post');
        }
        assert.equal(recovered.post.id, first.result.postId);
        const retainedPost = await db
          .select({ currentContentId: Posts.currentContentId })
          .from(Posts)
          .where(eq(Posts.id, first.result.postId))
          .then(firstOrThrow);
        assert.equal(recovered.content.id, retainedPost.currentContentId);
      });

      await t.test(
        'history retention 밖의 admission identity는 새 실행을 시작하지 않는다',
        async () => {
          const input = quoteInput(
            quoteProfile.id,
            source.id,
            'expired identity',
            admissionId(Date.now() - 10 * 60_000),
          );
          const before = await db
            .select()
            .from(Posts)
            .where(and(eq(Posts.profileId, quoteProfile.id), eq(Posts.repostSourceId, source.id)));
          await assert.rejects(
            createPost(input),
            (error: unknown) => error instanceof ValidationError && error.field === 'admissionId',
          );
          const after = await db
            .select()
            .from(Posts)
            .where(and(eq(Posts.profileId, quoteProfile.id), eq(Posts.repostSourceId, source.id)));
          assert.equal(after.length, before.length);
          await assert.rejects(
            environment.client.workflow
              .getHandle(postCreateWorkflow.workflowIdFromArgs(input))
              .describe(),
          );
        },
      );

      await t.test(
        '완료된 Quote의 history 삭제 뒤에도 재제출은 동일 결과를 회수하거나 안전하게 거부한다',
        async () => {
          const input = quoteInput(quoteProfile.id, source.id, 'history deleted');
          const first = await createPost(input);
          const workflowId = postCreateWorkflow.workflowIdFromArgs(input);
          const handle = environment.client.workflow.getHandle(workflowId);
          await handle.result();

          const before = await db
            .select({ id: Posts.id, currentContentId: Posts.currentContentId })
            .from(Posts)
            .where(and(eq(Posts.profileId, quoteProfile.id), eq(Posts.repostSourceId, source.id)));
          const description = await handle.describe();
          await environment.client.workflowService.deleteWorkflowExecution({
            namespace: environment.namespace ?? 'default',
            workflowExecution: { workflowId, runId: description.runId },
          });
          const recovered = await runChild(input, 'success');
          assert.equal(recovered.kind, 'success');
          assert.equal(recovered.postId, first.post.id);
          assert.equal(recovered.contentId, first.content.id);
          assert.deepEqual(recovered.after, recovered.before);

          const changed = await runChild(
            { ...input, document: postContentDocumentFromText('history changed') },
            'reject',
          );
          assert.equal(changed.kind, 'rejected');
          assert.deepEqual(changed.after, changed.before);
          const afterSame = await db
            .select({ id: Posts.id, currentContentId: Posts.currentContentId })
            .from(Posts)
            .where(and(eq(Posts.profileId, quoteProfile.id), eq(Posts.repostSourceId, source.id)));
          assert.deepEqual(afterSame, before);

          await assert.rejects(
            createPost({ ...input, document: postContentDocumentFromText('history changed') }),
            (error: unknown) => error instanceof ValidationError && error.field === 'admissionId',
          );
          await assert.rejects(
            createPost({
              ...input,
              media: [{ altText: null, mediaId: randomUUID() }],
            }),
            (error: unknown) => error instanceof ValidationError && error.field === 'admissionId',
          );
          const afterMismatch = await db
            .select({ id: Posts.id, currentContentId: Posts.currentContentId })
            .from(Posts)
            .where(and(eq(Posts.profileId, quoteProfile.id), eq(Posts.repostSourceId, source.id)));
          assert.deepEqual(afterMismatch, before);
        },
      );

      await t.test(
        'commit 응답 유실 뒤 transition Activity 재시도는 같은 Post와 Content로 수렴한다',
        async () => {
          const input = quoteInput(quoteProfile.id, source.id, 'transition response loss');
          const before = await db
            .select({ id: Posts.id, currentContentId: Posts.currentContentId })
            .from(Posts)
            .where(and(eq(Posts.profileId, quoteProfile.id), eq(Posts.repostSourceId, source.id)));
          transitionResponseLost = deferred();
          transitionResponseLossOnce = true;
          const result = await createPost(input);
          await transitionResponseLost.promise;
          const after = await db
            .select({ id: Posts.id, currentContentId: Posts.currentContentId })
            .from(Posts)
            .where(and(eq(Posts.profileId, quoteProfile.id), eq(Posts.repostSourceId, source.id)));
          const retriedPost = after.find(({ id }) => id === result.post.id);
          assert.equal(after.length, before.length + 1);
          assert.ok(retriedPost);
          assert.equal(result.content.id, retriedPost.currentContentId);
          assert.equal(result.created, true);
        },
      );

      await t.test(
        'commit 뒤 effect 실패도 stable retry에서 동일 Post와 Content로 수렴한다',
        async () => {
          const input = quoteInput(quoteProfile.id, source.id, 'effect retry');
          failCreateEffectOnce = true;
          createEffectFailed = deferred();
          const first = await createPost(input);
          await createEffectFailed.promise;
          await assert.rejects(
            environment.client.workflow
              .getHandle(postCreateWorkflow.workflowIdFromArgs(input))
              .result(),
          );

          const before = await db
            .select({ id: Posts.id, currentContentId: Posts.currentContentId })
            .from(Posts)
            .where(and(eq(Posts.profileId, quoteProfile.id), eq(Posts.repostSourceId, source.id)));
          const retried = await createPost(input);
          const after = await db
            .select({ id: Posts.id, currentContentId: Posts.currentContentId })
            .from(Posts)
            .where(and(eq(Posts.profileId, quoteProfile.id), eq(Posts.repostSourceId, source.id)));
          assert.equal(retried.post.id, first.post.id);
          assert.equal(retried.content.id, first.content.id);
          assert.deepEqual(after, before);
        },
      );

      await t.test(
        '같은 deterministic Post ID의 INITIALIZE payload 충돌은 한 Content만 만들고 거부한다',
        async () => {
          const firstInput = quoteInput(quoteProfile.id, source.id, 'owner initialize');
          const changedInput = quoteInput(
            quoteProfile.id,
            source.id,
            'owner initialize changed',
            firstInput.admissionId,
          );
          const firstIdentity = postCreateIdentities(firstInput);
          const changedIdentity = postCreateIdentities(changedInput);
          assert.equal(changedIdentity.postId, firstIdentity.postId);
          assert.notEqual(changedIdentity.contentId, firstIdentity.contentId);

          const ownerWorkflowId = `post-quote:${firstIdentity.postId}`;
          const ownerHandle = await environment.client.workflow.start('postQuoteOwnerWorkflow', {
            args: [{ postId: firstIdentity.postId, initialSourcePostId: source.id }],
            taskQueue: KOSMO_TASK_QUEUE,
            workflowId: ownerWorkflowId,
            workflowIdConflictPolicy: 'USE_EXISTING',
            workflowIdReusePolicy: 'REJECT_DUPLICATE',
          });
          const ownerInput = (input: AdmissionLocalPostInput) => {
            const localInput: LocalPostInput = { ...input };
            delete localInput.admissionId;
            return localInput;
          };
          const command = (
            input: AdmissionLocalPostInput,
            identity: ReturnType<typeof postCreateIdentities>,
          ) => {
            const commandId = `${input.admissionId}:${createHash('sha256')
              .update(postCreateInputKey(input))
              .digest('hex')}`;
            return {
              kind: 'INITIALIZE' as const,
              postId: identity.postId,
              commandId,
              initialContentId: identity.contentId,
              input: ownerInput(input),
            };
          };
          const firstCommand = command(firstInput, firstIdentity);
          const changedCommand = command(changedInput, changedIdentity);
          quoteApplyResponseLost = deferred();
          quoteApplyResponseLossOnce = true;
          type OwnerResult = {
            readonly error?: { readonly field?: string };
            readonly postId: string;
          };
          let acceptedContentId: string | undefined;
          try {
            const firstResult = ownerHandle.executeUpdate('quoteCommand', {
              args: [firstCommand],
              updateId: firstCommand.commandId,
            });
            const changedResult = ownerHandle.executeUpdate('quoteCommand', {
              args: [changedCommand],
              updateId: changedCommand.commandId,
            });
            const outcomes = (await Promise.all([firstResult, changedResult])) as OwnerResult[];
            await quoteApplyResponseLost.promise;
            // RPC arrival determines admission order; concurrent callers need not arrive in JS call order.
            const accepted = outcomes.flatMap((result, index) => (result.error ? [] : [index]));
            assert.equal(accepted.length, 1);
            const rejected = outcomes.filter((result) => result.error);
            assert.equal(rejected.length, 1);
            assert.equal(rejected[0]?.error?.field, 'admissionId');
            acceptedContentId =
              accepted[0] === 0 ? firstIdentity.contentId : changedIdentity.contentId;
          } finally {
            await ownerHandle.signal('finishQuoteOwner');
            await ownerHandle.result();
          }

          const posts = await db.select().from(Posts).where(eq(Posts.id, firstIdentity.postId));
          const contents = await db
            .select()
            .from(PostContents)
            .where(eq(PostContents.postId, firstIdentity.postId));
          assert.equal(posts.length, 1);
          assert.ok(acceptedContentId);
          assert.equal(posts[0]?.currentContentId, acceptedContentId);
          assert.equal(contents.length, 1);
          assert.equal(contents[0]?.id, acceptedContentId);
        },
      );

      await t.test(
        'Source 삭제가 Quote owner commit보다 먼저 끝나면 삭제된 Source를 승인하지 않는다',
        async () => {
          const { deletePost } = coreServices;
          const raceSource = await createSource(quoteProfile.id, 'source deleted during quote');
          const input = quoteInput(quoteProfile.id, raceSource.id, 'source deletion race');
          const applyGate = deferred();
          quoteApplyGate = applyGate;
          quoteApplyEntered = deferred();

          const quoteAttempt = createPost(input).then(
            () => ({ status: 'fulfilled' as const }),
            (error) => ({ status: 'rejected' as const, error }),
          );
          await quoteApplyEntered.promise;

          const sourceLockAcquired = deferred();
          const releaseSourceLock = deferred();
          const sourceLock = db.transaction(async (tx) => {
            await tx
              .select({ id: Posts.id })
              .from(Posts)
              .where(eq(Posts.id, raceSource.id))
              .for('update');
            sourceLockAcquired.resolve();
            await releaseSourceLock.promise;
          });
          await sourceLockAcquired.promise;
          releaseSourceLock.resolve();

          await deletePost({
            actorProfileId: quoteProfile.id,
            origin: 'LOCAL',
            postId: raceSource.id,
          });
          applyGate.resolve();

          const result = await quoteAttempt;
          assert.equal(result.status, 'rejected');
          await sourceLock;
          const deletedSource = await db
            .select()
            .from(Posts)
            .where(eq(Posts.id, raceSource.id))
            .then(firstOrThrow);
          assert.equal(deletedSource.state, PostState.DELETED);
          assert.equal(
            (
              await db
                .select()
                .from(Posts)
                .where(
                  and(
                    eq(Posts.profileId, quoteProfile.id),
                    eq(Posts.repostSourceId, raceSource.id),
                  ),
                )
            ).length,
            0,
          );
        },
      );
    },
  );
}
