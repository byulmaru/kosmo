import '@kosmo/core/polyfill';

import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import { readFile, unlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { setTimeout as delay } from 'node:timers/promises';
import { ValidationError } from '@kosmo/core/error';
import { KOSMO_TASK_QUEUE } from '@kosmo/core/temporal/task-queue';
import { ApplicationFailure } from '@temporalio/activity';
import { TestWorkflowEnvironment } from '@temporalio/testing';
import { Worker } from '@temporalio/worker';
import { and, eq, inArray, sql } from 'drizzle-orm';
import type { pg as corePg } from '@kosmo/core/db';
import type { LegacyLocalPostInput, LocalPostInput } from '../../../packages/core/services/post';

process.env.DATABASE_URL ??= 'postgres://kosmo:kosmo@localhost:54329/kosmo_test';
const databaseUrl = new URL(process.env.DATABASE_URL);
process.env.PGHOST ??= databaseUrl.hostname;
process.env.PGPORT ??= databaseUrl.port || '5432';
process.env.PGUSER ??= decodeURIComponent(databaseUrl.username);
process.env.PGPASSWORD ??= decodeURIComponent(databaseUrl.password);
process.env.PGDATABASE ??= decodeURIComponent(databaseUrl.pathname.slice(1));

type AdmissionLocalPostInput = LocalPostInput & { readonly admissionId: string };

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

const quoteOwnerIds = new Set<string>();

const isAdmissionError = (error: unknown): boolean =>
  (error instanceof ValidationError && error.field === 'admissionId') ||
  (error instanceof ApplicationFailure &&
    error.type === 'VALIDATION' &&
    error.details[0] === 'admissionId');

const createPost = async (input: AdmissionLocalPostInput) => {
  const [coreDb, temporalClient, temporalPost, coreAdmission] = await Promise.all([
    import('@kosmo/core/db'),
    import('@kosmo/core/temporal/client'),
    import('@kosmo/core/temporal/post-create'),
    import('@kosmo/core/temporal/post-admission'),
  ]);
  const args = coreAdmission.postCreateWorkflowArgs(input);
  if (input.repostSourceId) {
    quoteOwnerIds.add(
      coreAdmission.postCreateIdentities(coreAdmission.quotePostCreateInput(input)).postId,
    );
  }
  const result = await temporalClient.runWorkflow(temporalPost.postCreateWorkflow, {
    args: [args],
    mode: 'execute',
    returnExistingResult: true,
    workflowIdConflictPolicy: 'USE_EXISTING',
    workflowIdReusePolicy: 'REJECT_DUPLICATE',
  });
  if (result.status === 'rejected') {
    throw new Error(`Unexpected Local Post rejection: ${result.reason}`);
  }
  const { db, firstOrThrow, PostContents, Posts } = coreDb;
  const post = await db.select().from(Posts).where(eq(Posts.id, result.postId)).then(firstOrThrow);
  assert.ok(post.currentContentId);
  const content = await db
    .select()
    .from(PostContents)
    .where(eq(PostContents.id, post.currentContentId))
    .then(firstOrThrow);
  assert.equal(content.postId, post.id);
  return { created: result.status === 'created', post, content };
};

const finishQuoteOwners = async (environment: TestWorkflowEnvironment) => {
  for (const postId of quoteOwnerIds) {
    const owner = environment.client.workflow.getHandle(`post-quote:${postId}`);
    await owner.signal('finishQuoteOwner').catch(() => undefined);
    await owner.result().catch(() => undefined);
  }
};

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
    const [coreDb, temporalPost, coreAdmission] = await Promise.all([
      import('@kosmo/core/db'),
      import('@kosmo/core/temporal/post-create'),
      import('@kosmo/core/temporal/post-admission'),
    ]);
    const production = await import('./activities');
    const { db, pg, Posts } = coreDb;
    childPg = pg;
    const { postCreateWorkflowArgs } = coreAdmission;
    const { postCreateWorkflow } = temporalPost;

    childWorker = await Worker.create({
      connection: childEnvironment.nativeConnection,
      namespace: childEnvironment.namespace,
      taskQueue: KOSMO_TASK_QUEUE,
      workflowsPath: new URL('./workflows/index.ts', import.meta.url).pathname,
      activities: {
        ...production,
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
        .getHandle(postCreateWorkflow.workflowIdFromArgs(postCreateWorkflowArgs(input)))
        .result();
      result.kind = 'success';
    } else {
      await assert.rejects(createPost(input), isAdmissionError);
      result.kind = 'rejected';
    }
    result.after = await selectRows();
  } catch (error) {
    result.kind = 'error';
    result.message = error instanceof Error ? (error.stack ?? error.message) : String(error);
  } finally {
    if (childEnvironment && childWorkerRun) {
      await finishQuoteOwners(childEnvironment);
    }
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
        coreDocument,
        temporalPost,
        coreAdmission,
        temporalPostCreate,
      ] = await Promise.all([
        import('@kosmo/core/db'),
        import('@kosmo/core/services'),
        import('@kosmo/core/enums'),
        import('@kosmo/core/post-content/server'),
        import('@kosmo/core/temporal/post'),
        import('@kosmo/core/temporal/post-admission'),
        import('@kosmo/core/temporal/post-create'),
      ]);
      const production = await import('./activities');

      const {
        Accounts,
        AccountProfiles,
        db,
        firstOrThrow,
        Hashtags,
        Instances,
        pg,
        Notifications,
        PostContentHashtags,
        PostContents,
        Posts,
        Profiles,
      } = coreDb;
      const {
        InstanceKind,
        InstanceState,
        NotificationKind,
        PostState,
        PostVisibility,
        ProfileFollowPolicy,
        ProfileState,
      } = coreEnums;
      const { postContentDocumentFromText } = coreDocument;
      const { createPost: createLegacyPost } = coreServices;
      const { postCreateIdentities, postCreateWorkflowArgs, quotePostCreateInput } = coreAdmission;
      const { postCreateInputKey, postCreateWorkflow: legacyPostCreateWorkflow } = temporalPost;
      const { postCreateWorkflow } = temporalPostCreate;
      const { revokePostQuoteConsentsForSource } =
        await import('../../../packages/core/services/post-quote-consent');

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

      const createAttempts = new Map<string, number>();
      let transitionGate: ReturnType<typeof deferred> | undefined;
      let transitionEntered: ReturnType<typeof deferred> | undefined;
      let transitionResponseLossOnce = false;
      let transitionResponseLost: ReturnType<typeof deferred> | undefined;
      let quoteApplyResponseLossOnce = false;
      let quoteApplyResponseLost: ReturnType<typeof deferred> | undefined;
      let failCreateEffectPostId: string | undefined;
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
            createPostActivity: async (
              ...args: Parameters<typeof production.createPostActivity>
            ) => {
              const { postId } = args[0];
              createAttempts.set(postId, (createAttempts.get(postId) ?? 0) + 1);
              const gate = transitionGate;
              if (gate) {
                transitionGate = undefined;
                transitionEntered?.resolve();
                await gate.promise;
              }
              const result = await production.createPostActivity(...args);
              if (transitionResponseLossOnce && result.ok) {
                transitionResponseLossOnce = false;
                transitionResponseLost?.resolve();
                throw new Error('Simulated createPostActivity completion loss');
              }
              return result;
            },
            applyQuoteConsentActivity: async (
              ...args: Parameters<typeof production.applyQuoteConsentActivity>
            ) => {
              const result = await production.applyQuoteConsentActivity(...args);
              if (quoteApplyResponseLossOnce && result.applied) {
                quoteApplyResponseLossOnce = false;
                quoteApplyResponseLost?.resolve();
                throw new Error('Simulated Quote owner completion loss');
              }
              return result;
            },
            sendLocalPostCreateActivity: async (postId: string) => {
              if (postId === failCreateEffectPostId) {
                failCreateEffectPostId = undefined;
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
        bodyText: body,
        origin: 'LOCAL',
        profileId,
        repostSourceId,
        visibility: PostVisibility.PUBLIC,
      });

      const runChild = async (
        input: AdmissionLocalPostInput,
        expected: 'reject' | 'success',
      ): Promise<AdmissionChildResult> => {
        const resultPath = join(tmpdir(), `post-admission-child-${randomUUID()}.json`);
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
            stdio: ['ignore', 'ignore', 'pipe'],
          },
        );
        let stderr = '';
        child.stderr.setEncoding('utf8');
        child.stderr.on('data', (chunk: string) => {
          stderr += chunk;
        });
        const exitCode = await new Promise<number>((resolve, reject) => {
          child.once('error', reject);
          child.once('exit', (code) => resolve(code ?? 1));
        });
        const raw = await readFile(resultPath, 'utf8').catch(() => '');
        await unlink(resultPath).catch(() => undefined);
        assert.equal(exitCode, 0, raw || stderr || 'Admission child exited without a result');
        return JSON.parse(raw) as AdmissionChildResult;
      };

      t.after(async () => {
        transitionGate?.resolve();
        await finishQuoteOwners(environment);
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
          try {
            const started = await Promise.race([
              transitionEntered.promise.then(() => 'transition-entered' as const),
              firstAttempt.then((result) => result),
            ]);
            if (started !== 'transition-entered') {
              if (started.status === 'rejected') {
                throw started.error;
              }
              throw new Error('Post create completed before the create Activity gate was entered');
            }

            const firstResult = await firstAttempt;
            assert.equal(firstResult.status, 'rejected');
            assert.equal(
              await db.$count(
                Posts,
                and(eq(Posts.profileId, quoteProfile.id), eq(Posts.repostSourceId, source.id)),
              ),
              0,
            );
          } finally {
            gate.resolve();
          }

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
          await assert.rejects(createPost({ ...input, accountId: randomUUID() }), isAdmissionError);
        },
      );

      await t.test(
        'same identity는 profile·bodyText·source·media payload 변경을 거부한다',
        async () => {
          const base = quoteInput(quoteProfile.id, source.id, 'identity payload');
          const created = await createPost(base);
          const directBodyMismatch = await production.createPostActivity({
            ...postCreateWorkflowArgs({ ...base, bodyText: 'changed directly' }),
            postId: created.post.id,
          });
          assert.equal(directBodyMismatch.ok, false);
          if (!directBodyMismatch.ok) {
            assert.equal(directBodyMismatch.error.field, 'admissionId');
          }
          const directMediaMismatch = await production.createPostActivity({
            ...postCreateWorkflowArgs({
              ...base,
              media: [{ altText: null, mediaId: randomUUID() }],
            }),
            postId: created.post.id,
          });
          assert.equal(directMediaMismatch.ok, false);
          if (!directMediaMismatch.ok) {
            assert.equal(directMediaMismatch.error.field, 'admissionId');
          }
          const before = await db
            .select()
            .from(Posts)
            .where(and(eq(Posts.profileId, quoteProfile.id), eq(Posts.repostSourceId, source.id)));

          const assertMismatch = (promise: Promise<unknown>) =>
            assert.rejects(promise, isAdmissionError);
          await assertMismatch(createPost({ ...base, profileId: otherProfile.id }));
          await assertMismatch(createPost({ ...base, bodyText: 'changed' }));
          await assertMismatch(createPost({ ...base, contentWarning: 'changed warning' }));
          await assertMismatch(createPost({ ...base, sensitiveMedia: true }));
          await assertMismatch(createPost({ ...base, visibility: PostVisibility.UNLISTED }));
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
          try {
            await Promise.race([
              transitionEntered.promise,
              first.then(() => {
                throw new Error('Post create completed before the create Activity gate');
              }),
            ]);
            const second = createPost(input);
            gate.resolve();
            const [firstResult, secondResult] = await Promise.all([first, second]);
            assert.equal(firstResult.post.id, secondResult.post.id);
            assert.equal(firstResult.content.id, secondResult.content.id);

            const completed = await createPost(input);
            assert.equal(completed.post.id, firstResult.post.id);
            assert.equal(completed.content.id, firstResult.content.id);
            assert.equal(createAttempts.get(completed.post.id), 1);
          } finally {
            gate.resolve();
          }
        },
      );

      await t.test(
        'Worker shutdown 뒤 같은 Temporal Run을 replacement Worker가 재개한다',
        async () => {
          const input = quoteInput(quoteProfile.id, source.id, 'worker restart');
          const workflowId = postCreateWorkflow.workflowIdFromArgs(postCreateWorkflowArgs(input));
          const handle = await environment.client.workflow.start('postCreateWorkflow', {
            args: [postCreateWorkflowArgs(input)],
            taskQueue: KOSMO_TASK_QUEUE,
            workflowId,
            workflowIdConflictPolicy: 'USE_EXISTING',
            workflowIdReusePolicy: 'REJECT_DUPLICATE',
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

      await t.test(
        'legacy UWS caller는 오래된 identity의 기존 Update 결과를 회수한다',
        async () => {
          const input = quotePostCreateInput(
            quoteInput(
              quoteProfile.id,
              source.id,
              'old retained result',
              admissionId(Date.now() - 10 * 60_000),
            ),
          );
          const workflowId = legacyPostCreateWorkflow.workflowIdFromArgs(input);
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
            [typeof input]
          >('createPost', { args: [input], updateId });
          await handle.result();

          const recovered = await createLegacyPost(input);
          quoteOwnerIds.add(recovered.post.id);
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
        },
      );

      await t.test(
        'history가 없는 만료 admission은 create Activity와 DB 변경 없이 거부된다',
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
          const beforeContents = await db.$count(PostContents);
          const identity = postCreateIdentities(quotePostCreateInput(input));
          await assert.rejects(createPost(input), isAdmissionError);
          const after = await db
            .select()
            .from(Posts)
            .where(and(eq(Posts.profileId, quoteProfile.id), eq(Posts.repostSourceId, source.id)));
          assert.equal(after.length, before.length);
          assert.equal(await db.$count(PostContents), beforeContents);
          assert.equal(createAttempts.has(identity.postId), false);
          const description = await environment.client.workflow
            .getHandle(postCreateWorkflow.workflowIdFromArgs(postCreateWorkflowArgs(input)))
            .describe();
          assert.equal(description.status.name, 'FAILED');
          assert.equal(await db.$count(Posts, eq(Posts.id, identity.postId)), 0);
        },
      );

      await t.test(
        '완료된 Quote의 history 삭제 뒤에도 재제출은 동일 결과를 회수하거나 안전하게 거부한다',
        async () => {
          const input = quoteInput(quoteProfile.id, source.id, 'history deleted');
          const first = await createPost(input);
          const workflowId = postCreateWorkflow.workflowIdFromArgs(postCreateWorkflowArgs(input));
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

          const changed = await runChild({ ...input, bodyText: 'history changed' }, 'reject');
          assert.equal(changed.kind, 'rejected');
          assert.deepEqual(changed.after, changed.before);
          const afterSame = await db
            .select({ id: Posts.id, currentContentId: Posts.currentContentId })
            .from(Posts)
            .where(and(eq(Posts.profileId, quoteProfile.id), eq(Posts.repostSourceId, source.id)));
          assert.deepEqual(afterSame, before);

          await assert.rejects(
            createPost({ ...input, bodyText: 'history changed' }),
            isAdmissionError,
          );
          await assert.rejects(
            createPost({
              ...input,
              media: [{ altText: null, mediaId: randomUUID() }],
            }),
            isAdmissionError,
          );
          const afterMismatch = await db
            .select({ id: Posts.id, currentContentId: Posts.currentContentId })
            .from(Posts)
            .where(and(eq(Posts.profileId, quoteProfile.id), eq(Posts.repostSourceId, source.id)));
          assert.deepEqual(afterMismatch, before);
        },
      );

      await t.test(
        'commit 응답 유실 뒤 create Activity 재시도는 같은 Post와 Content로 수렴한다',
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
          assert.ok((createAttempts.get(result.post.id) ?? 0) >= 2);
          assert.equal(await db.$count(PostContents, eq(PostContents.postId, result.post.id)), 1);
        },
      );

      await t.test(
        'commit 뒤 effect 실패도 stable retry에서 동일 Post와 Content로 수렴한다',
        async () => {
          const input = quoteInput(quoteProfile.id, source.id, 'effect retry');
          failCreateEffectPostId = postCreateIdentities(quotePostCreateInput(input)).postId;
          createEffectFailed = deferred();
          const first = await createPost(input);
          await createEffectFailed.promise;
          const parent = environment.client.workflow.getHandle(
            postCreateWorkflow.workflowIdFromArgs(postCreateWorkflowArgs(input)),
          );
          assert.equal((await parent.result()).postId, first.post.id);
          assert.equal((await parent.describe()).status.name, 'COMPLETED');
          const child = environment.client.workflow.getHandle(
            `post-create-effects:${first.post.id}`,
          );
          await assert.rejects(child.result());
          assert.equal((await child.describe()).status.name, 'FAILED');

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
          assert.equal(createAttempts.get(retried.post.id), 1);
        },
      );

      await t.test(
        '실제 QUOTE 알림은 한 건만 생성되고 같은 admission 재제출 뒤 ID와 readAt을 보존한다',
        async () => {
          const author = await createProfile('notification-author');
          const recipient = await createProfile('notification-recipient');
          const accounts = await db
            .insert(Accounts)
            .values([
              {
                displayName: 'Quote notification author',
                oidcSubject: randomUUID(),
                state: coreEnums.AccountState.ACTIVE,
              },
              {
                displayName: 'Quote notification recipient',
                oidcSubject: randomUUID(),
                state: coreEnums.AccountState.ACTIVE,
              },
            ])
            .returning();
          const [authorAccount, recipientAccount] = accounts;
          assert.ok(authorAccount);
          assert.ok(recipientAccount);
          assert.notEqual(authorAccount.id, recipientAccount.id);
          await db.insert(AccountProfiles).values([
            {
              accountId: authorAccount.id,
              profileId: author.id,
              role: coreEnums.AccountProfileRole.OWNER,
            },
            {
              accountId: recipientAccount.id,
              profileId: recipient.id,
              role: coreEnums.AccountProfileRole.OWNER,
            },
          ]);
          const notificationSource = await createSource(recipient.id, 'notification source');
          const input = {
            ...quoteInput(author.id, notificationSource.id, 'notification quote #AdmissionTag#'),
            accountId: authorAccount.id,
          };
          const first = await createPost(input);
          assert.deepEqual(
            await db
              .select({ name: Hashtags.name })
              .from(PostContentHashtags)
              .innerJoin(Hashtags, eq(Hashtags.id, PostContentHashtags.hashtagId))
              .where(eq(PostContentHashtags.postContentId, first.content.id)),
            [{ name: 'admissiontag' }],
          );
          const effects = environment.client.workflow.getHandle(
            `post-create-effects:${first.post.id}`,
          );
          await effects.result();
          const notifications = () =>
            db
              .select()
              .from(Notifications)
              .where(
                and(
                  eq(Notifications.kind, NotificationKind.QUOTE),
                  eq(Notifications.sourceId, first.post.id),
                ),
              );
          const original = await notifications();
          assert.equal(original.length, 1);
          assert.equal(original[0]?.recipientAccountId, recipientAccount.id);
          assert.equal(original[0]?.recipientProfileId, recipient.id);
          assert.equal(original[0]?.readAt, null);
          const notification = original[0]!;
          const readAt = Temporal.Instant.from('2026-10-29T00:00:00.123456Z');
          await db
            .update(Notifications)
            .set({ readAt })
            .where(eq(Notifications.id, notification.id));

          const retried = await createPost(input);
          await effects.result();
          const after = await notifications();
          assert.equal(retried.post.id, first.post.id);
          assert.equal(retried.content.id, first.content.id);
          assert.equal(createAttempts.get(first.post.id), 1);
          assert.equal(after.length, 1);
          assert.equal(after[0]?.id, notification.id);
          assert.equal(after[0]?.readAt?.equals(readAt), true);
        },
      );

      await t.test(
        'legacy owner INITIALIZE payload 충돌은 같은 Post에 한 Content만 만들고 거부한다',
        async () => {
          const firstInput = quoteInput(quoteProfile.id, source.id, 'owner initialize');
          const changedInput = quoteInput(
            quoteProfile.id,
            source.id,
            'owner initialize changed',
            firstInput.admissionId,
          );
          const firstIdentity = postCreateIdentities(quotePostCreateInput(firstInput));
          const changedIdentity = postCreateIdentities(quotePostCreateInput(changedInput));
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
            const localInput: LegacyLocalPostInput = { ...quotePostCreateInput(input) };
            delete localInput.admissionId;
            return localInput;
          };
          const command = (
            input: AdmissionLocalPostInput,
            identity: ReturnType<typeof postCreateIdentities>,
          ) => {
            const commandId = `${input.admissionId}:${createHash('sha256')
              .update(postCreateInputKey(quotePostCreateInput(input)))
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
        'Source 삭제 transaction을 기다린 최초 Quote 생성은 삭제 commit 뒤 Content 없이 거부된다',
        async () => {
          const raceSource = await createSource(quoteProfile.id, 'source deleted during quote');
          const input = quoteInput(quoteProfile.id, raceSource.id, 'source deletion race');
          const identity = postCreateIdentities(quotePostCreateInput(input));
          const beforeContents = await db.$count(PostContents);
          const sourceUpdated = deferred();
          const releaseDeletion = deferred();
          let sourceHolderPid: number | undefined;
          const deletion = db.transaction(async (tx) => {
            const [session] = await tx.execute<{ pid: number }>(
              sql`SELECT pg_backend_pid() AS pid`,
            );
            assert.ok(session);
            sourceHolderPid = session.pid;
            await tx
              .update(Posts)
              .set({ state: PostState.DELETED })
              .where(eq(Posts.id, raceSource.id));
            await revokePostQuoteConsentsForSource(tx, raceSource.id);
            sourceUpdated.resolve();
            await releaseDeletion.promise;
          });
          const deletionOutcome = deletion.then(
            () => ({ status: 'fulfilled' as const }),
            (error) => ({ status: 'rejected' as const, error }),
          );
          try {
            const updated = await Promise.race([
              sourceUpdated.promise.then(() => 'source-updated' as const),
              deletionOutcome,
            ]);
            if (updated !== 'source-updated') {
              if (updated.status === 'rejected') {
                throw updated.error;
              }
              throw new Error('Source deletion completed before its commit gate');
            }
            assert.ok(sourceHolderPid);
            const quoteAttempt = createPost(input).then(
              () => ({ status: 'fulfilled' as const }),
              (error) => ({ status: 'rejected' as const, error }),
            );
            try {
              await waitFor(async () => {
                const [observation] = await db.execute<{ blocked: boolean }>(sql`
                  SELECT EXISTS (
                    SELECT 1 FROM pg_stat_activity
                    WHERE datname = current_database()
                      AND pid <> pg_backend_pid()
                      AND ${sourceHolderPid} = ANY(pg_blocking_pids(pid))
                  ) AS blocked
                `);
                return observation?.blocked === true;
              });
              assert.equal(createAttempts.get(identity.postId), 1);
              assert.equal(await db.$count(Posts, eq(Posts.id, identity.postId)), 0);
              assert.equal(await db.$count(PostContents), beforeContents);
            } finally {
              releaseDeletion.resolve();
              await deletion;
            }
            const result = await quoteAttempt;
            assert.equal(result.status, 'rejected');
          } finally {
            releaseDeletion.resolve();
            await deletion;
          }
          const deletedSource = await db
            .select()
            .from(Posts)
            .where(eq(Posts.id, raceSource.id))
            .then(firstOrThrow);
          assert.equal(deletedSource.state, PostState.DELETED);
          assert.equal(
            await db.$count(
              Posts,
              and(eq(Posts.profileId, quoteProfile.id), eq(Posts.repostSourceId, raceSource.id)),
            ),
            0,
          );
          assert.equal(await db.$count(PostContents, eq(PostContents.postId, identity.postId)), 0);
          assert.equal(await db.$count(PostContents, eq(PostContents.id, identity.contentId)), 0);
          assert.equal(await db.$count(PostContents), beforeContents);
        },
      );
    },
  );
}
