import '@kosmo/core/polyfill';

import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { test } from 'node:test';
import { PostVisibility } from '@kosmo/core/enums';
import {
  POST_CREATE_WORKFLOW_TYPE,
  POST_CREATE_WORKFLOW_V2_TYPE,
  postCreateWorkflow,
  postCreateWorkflowV2,
} from '@kosmo/core/temporal/post-create';
import { KOSMO_TASK_QUEUE } from '@kosmo/core/temporal/task-queue';
import { ApplicationFailure, WorkflowFailedError } from '@temporalio/client';
import { TestWorkflowEnvironment } from '@temporalio/testing';
import { Worker } from '@temporalio/worker';
import { temporalTestExecutable } from './temporal-test-executable.js';
import type { LocalPostInput } from '@kosmo/core/services';
import type {
  ActivityPubPostCreateInput,
  PostCreateActivityInput,
  PostCreateActivityResult,
  PostCreateWorkflowArgs,
  PostCreateWorkflowResult,
} from '@kosmo/core/temporal/post-create';
import type { createNotificationActivity as CreateNotificationActivity } from './activities/notification';
import type { capturePostCreatedActivity as CapturePostCreatedActivity } from './activities/post-created';

type CreateNotificationInput = Parameters<typeof CreateNotificationActivity>[0];
type CapturePostCreatedInput = Parameters<typeof CapturePostCreatedActivity>[0];

const workflowsPath = new URL('./workflows/index.ts', import.meta.url).pathname;

const localPostInput = (bodyText: string): LocalPostInput => ({
  accountId: randomUUID(),
  bodyText,
  origin: 'LOCAL',
  profileId: randomUUID(),
  visibility: PostVisibility.PUBLIC,
});

const activityPubPostInput = (objectUri: string): ActivityPubPostCreateInput => ({
  document: {
    body: {
      content: [{ content: [{ text: 'Remote post', type: 'text' }], type: 'paragraph' }],
      type: 'doc',
    },
    summary: null,
    version: 1,
  },
  hashtagNames: [],
  media: [],
  mentionProfileIds: [],
  objectUri,
  origin: 'ACTIVITYPUB',
  profileId: randomUUID(),
  publishedAt: '2026-10-29T00:00:00.000Z',
  receivedAt: '2026-10-29T00:00:01.000Z',
  visibility: PostVisibility.PUBLIC,
});

const runPostCreate = (
  environment: TestWorkflowEnvironment,
  taskQueue: string,
  args: unknown,
): Promise<PostCreateWorkflowResult> => {
  const typedArgs = args as PostCreateWorkflowArgs;
  return environment.client.workflow.execute(POST_CREATE_WORKFLOW_TYPE, {
    args: [typedArgs],
    taskQueue,
    workflowId: postCreateWorkflow.workflowIdFromArgs(typedArgs),
    workflowExecutionTimeout: '30 seconds',
  }) as Promise<PostCreateWorkflowResult>;
};

const isWorkflowFailureType = (error: unknown, type: string): boolean =>
  error instanceof WorkflowFailedError &&
  error.cause instanceof ApplicationFailure &&
  error.cause.nonRetryable === true &&
  error.cause.type === type;

test(
  'Post Create Workflow returns created posts while its production effects child keeps running',
  { timeout: 120_000 },
  async (t) => {
    const environment = await TestWorkflowEnvironment.createLocal({
      server: { executable: temporalTestExecutable },
    });
    t.after(() => environment.teardown());

    const taskQueue = KOSMO_TASK_QUEUE + '-post-create-workflow-' + process.pid;
    const postIds = [randomUUID(), randomUUID()];
    const generatedIds: string[] = [];
    const createAttempts: PostCreateActivityInput[] = [];
    const effectCalls: string[] = [];
    const analyticsCalls: CapturePostCreatedInput[] = [];
    let retryFirstLocalActivity = true;
    let blockedPostId = '';
    let effectStarted = Promise.withResolvers<void>();
    let effectReleased = Promise.withResolvers<void>();
    let captureStarted = Promise.withResolvers<void>();

    const worker = await Worker.create({
      activities: {
        generatePostIdActivity: async () => {
          const postId = postIds[generatedIds.length];
          assert.ok(postId);
          generatedIds.push(postId);
          return postId;
        },
        createPostActivity: async (
          activityInput: PostCreateActivityInput,
        ): Promise<PostCreateActivityResult> => {
          createAttempts.push(activityInput);
          if (activityInput.input.origin === 'LOCAL' && retryFirstLocalActivity) {
            retryFirstLocalActivity = false;
            throw ApplicationFailure.retryable('Post creation Activity response was lost');
          }
          return {
            ok: true,
            result: {
              authorProfileId: activityInput.input.profileId,
              ...(activityInput.input.origin === 'ACTIVITYPUB'
                ? { replyParentFallback: true }
                : {}),
              postId: activityInput.postId,
              status: 'created',
            },
          };
        },
        createNotificationActivity: async ({ kind, sourceId }: CreateNotificationInput) => {
          effectCalls.push(kind + ':' + sourceId);
          if (sourceId === blockedPostId) {
            effectStarted.resolve();
            await effectReleased.promise;
          }
        },
        sendLocalPostCreateActivity: async (postId: string) => {
          effectCalls.push('send:' + postId);
        },
        capturePostCreatedActivity: async (input: CapturePostCreatedInput) => {
          analyticsCalls.push(input);
          if (input.postId === blockedPostId) {
            captureStarted.resolve();
            await effectReleased.promise;
          }
        },
      },
      connection: environment.nativeConnection,
      namespace: environment.namespace,
      taskQueue,
      workflowsPath,
    });

    await worker.runUntil(async () => {
      try {
        const localMedia = { altText: null, mediaId: randomUUID() };
        const localMention = {
          end: 5,
          handle: '@alice',
          profileId: randomUUID(),
          relativeHandle: 'alice',
          start: 0,
        };
        const expectedLocalInput: LocalPostInput = {
          ...localPostInput('A local post'),
          media: [localMedia],
          mentions: [localMention],
        };
        const futureLocalInput = {
          ...expectedLocalInput,
          futureField: true,
          media: [{ ...localMedia, futureField: true }],
          mentions: [{ ...localMention, futureField: true }],
        };

        const expectedRemoteInput = activityPubPostInput('https://remote.example/notes/1');
        const remoteMedia = {
          altText: null,
          mediaType: 'image/png',
          url: 'https://media.example/image.png',
        };
        const futureRemoteInput = {
          ...expectedRemoteInput,
          futureField: true,
          media: [{ ...remoteMedia, futureField: true }],
        };

        const cases = [
          {
            args: {
              analyticsPlatform: 'web',
              futureField: true,
              input: futureLocalInput,
              requestId: randomUUID(),
            },
            expectedInput: expectedLocalInput,
            postId: postIds[0]!,
          },
          {
            args: {
              analyticsPlatform: undefined,
              futureField: true,
              input: futureRemoteInput,
              requestId: randomUUID(),
            },
            expectedInput: { ...expectedRemoteInput, media: [remoteMedia] },
            postId: postIds[1]!,
          },
        ];

        for (const [index, item] of cases.entries()) {
          blockedPostId = item.postId;
          effectStarted = Promise.withResolvers<void>();
          effectReleased = Promise.withResolvers<void>();
          captureStarted = Promise.withResolvers<void>();
          const resultPromise = runPostCreate(environment, taskQueue, item.args);
          await effectStarted.promise;
          if (item.args.analyticsPlatform !== undefined) {
            await captureStarted.promise;
          }

          const expectedResult = {
            authorProfileId: item.expectedInput.profileId,
            ...(item.expectedInput.origin === 'ACTIVITYPUB' ? { replyParentFallback: true } : {}),
            postId: item.postId,
            status: 'created',
          } as const;
          assert.deepEqual(await resultPromise, expectedResult);

          const workflowId = postCreateWorkflow.workflowIdFromArgs(
            item.args as PostCreateWorkflowArgs,
          );
          assert.equal(
            (await environment.client.workflow.getHandle(workflowId).describe()).status.name,
            'COMPLETED',
          );

          const childHandle = environment.client.workflow.getHandle(
            'post-create-effects:' + item.postId,
          );
          assert.equal((await childHandle.describe()).status.name, 'RUNNING');

          const attemptsForPost = createAttempts.filter(
            (attempt) => attempt.postId === item.postId,
          );
          assert.equal(attemptsForPost.length, index === 0 ? 2 : 1);
          assert.deepEqual(
            attemptsForPost.map((attempt) => attempt.input),
            index === 0
              ? [expectedLocalInput, expectedLocalInput]
              : [{ ...expectedRemoteInput, media: [remoteMedia] }],
          );
          assert.deepEqual(
            analyticsCalls.filter(({ postId: capturedPostId }) => capturedPostId === item.postId),
            item.args.analyticsPlatform === undefined
              ? []
              : [{ analyticsPlatform: item.args.analyticsPlatform, postId: item.postId }],
          );

          effectReleased.resolve();
          await childHandle.result();
          assert.equal((await childHandle.describe()).status.name, 'COMPLETED');
        }

        assert.deepEqual(generatedIds, postIds);
        assert.ok(effectCalls.length > 0);
      } finally {
        effectReleased.resolve();
      }
    });
  },
);

test(
  'Post Create Workflow preserves validation, duplicate, and domain error behavior',
  { timeout: 120_000 },
  async (t) => {
    const environment = await TestWorkflowEnvironment.createLocal({
      server: { executable: temporalTestExecutable },
    });
    t.after(() => environment.teardown());

    const taskQueue = KOSMO_TASK_QUEUE + '-post-create-results-' + process.pid;
    const generatedIds: string[] = [];
    const activityCalls: PostCreateActivityInput[] = [];
    const effectCalls: string[] = [];
    const existingPostId = randomUUID();

    const worker = await Worker.create({
      activities: {
        generatePostIdActivity: async () => {
          const postId = randomUUID();
          generatedIds.push(postId);
          return postId;
        },
        createPostActivity: async (
          activityInput: PostCreateActivityInput,
        ): Promise<PostCreateActivityResult> => {
          activityCalls.push(activityInput);
          if (activityInput.input.origin === 'ACTIVITYPUB') {
            if (activityInput.input.objectUri.endsWith('/duplicate')) {
              return {
                ok: true,
                result: {
                  authorProfileId: activityInput.input.profileId,
                  postId: existingPostId,
                  status: 'duplicate',
                },
              };
            }
            if (activityInput.input.objectUri.endsWith('/reply-blocked')) {
              return {
                ok: false,
                error: {
                  code: 'CONFLICT',
                  kind: 'reply_profile_blocked',
                  message: 'Reply author is blocked',
                },
              };
            }
            if (activityInput.input.objectUri.endsWith('/invalid-media')) {
              return {
                ok: false,
                error: {
                  code: 'VALIDATION',
                  field: 'media',
                  kind: 'note_media_validation_rejected',
                  message: 'Media is invalid',
                },
              };
            }
            return {
              ok: false,
              error: {
                code: 'CONFLICT',
                field: 'objectUri',
                message: 'Post identity is already in use',
              },
            };
          }

          return {
            ok: false,
            error: {
              code: 'CONFLICT',
              field: 'bodyText',
              message: 'Local post rejected',
            },
          };
        },
        createNotificationActivity: async ({ sourceId }: CreateNotificationInput) => {
          effectCalls.push('notification:' + sourceId);
        },
        sendLocalPostCreateActivity: async (postId: string) => {
          effectCalls.push('send:' + postId);
        },
      },
      connection: environment.nativeConnection,
      namespace: environment.namespace,
      taskQueue,
      workflowsPath,
    });

    await worker.runUntil(async () => {
      const attemptedWorkflowArgs: PostCreateWorkflowArgs[] = [];
      const executeInput = (input: unknown) => {
        const args = { input, requestId: randomUUID() };
        attemptedWorkflowArgs.push(args as PostCreateWorkflowArgs);
        return runPostCreate(environment, taskQueue, args);
      };
      const validLocalInput = localPostInput('local-domain-error');
      const duplicateRemoteInput = activityPubPostInput('https://remote.example/notes/duplicate');
      const validRemoteInput = activityPubPostInput('https://remote.example/notes/domain-error');
      const invalidLocalInput = {
        origin: 'LOCAL',
        profileId: randomUUID(),
        visibility: 'INVALID',
      };
      const invalidRemoteInput = {
        ...activityPubPostInput('https://remote.example/notes/invalid'),
        document: null,
      };

      await assert.rejects(executeInput(invalidLocalInput), (error: unknown) =>
        isWorkflowFailureType(error, 'VALIDATION'),
      );
      await assert.rejects(executeInput(invalidRemoteInput), (error: unknown) =>
        isWorkflowFailureType(error, 'RemotePostCreateInputInvalid'),
      );
      assert.deepEqual(generatedIds, []);
      assert.deepEqual(activityCalls, []);

      assert.deepEqual(await executeInput(duplicateRemoteInput), {
        authorProfileId: duplicateRemoteInput.profileId,
        postId: existingPostId,
        status: 'duplicate',
      });

      const callsBeforeLocalDomainError = activityCalls.length;
      await assert.rejects(
        executeInput(validLocalInput),
        (error: unknown) =>
          error instanceof WorkflowFailedError &&
          error.cause instanceof ApplicationFailure &&
          error.cause.type === 'CONFLICT' &&
          error.cause.details?.[0] === 'bodyText',
      );
      assert.equal(activityCalls.length, callsBeforeLocalDomainError + 1);

      assert.deepEqual(
        await executeInput(activityPubPostInput('https://remote.example/notes/reply-blocked')),
        { reason: 'reply_profile_blocked', status: 'rejected' },
      );
      assert.deepEqual(
        await executeInput(activityPubPostInput('https://remote.example/notes/invalid-media')),
        { reason: 'note_media_validation_rejected', status: 'rejected' },
      );

      const callsBeforeDomainError = activityCalls.length;
      await assert.rejects(executeInput(validRemoteInput), (error: unknown) => {
        if (
          !(error instanceof WorkflowFailedError) ||
          !(error.cause instanceof ApplicationFailure) ||
          error.cause.type !== 'CONFLICT' ||
          error.cause.details?.[0] !== 'objectUri'
        ) {
          return false;
        }
        return true;
      });
      assert.equal(activityCalls.length, callsBeforeDomainError + 1);

      for (const args of attemptedWorkflowArgs) {
        const history = await environment.client.workflow
          .getHandle(postCreateWorkflow.workflowIdFromArgs(args))
          .fetchHistory();
        assert.equal(
          (history.events ?? []).some((event) =>
            Boolean(event.startChildWorkflowExecutionInitiatedEventAttributes),
          ),
          false,
        );
      }
      assert.deepEqual(effectCalls, []);
    });
  },
);

test(
  'Post Create Workflow preserves its committed result when the stable effects child already completed',
  { timeout: 120_000 },
  async (t) => {
    const environment = await TestWorkflowEnvironment.createLocal({
      server: { executable: temporalTestExecutable },
    });
    t.after(() => environment.teardown());

    const taskQueue = KOSMO_TASK_QUEUE + '-post-create-child-reuse-' + process.pid;
    const postId = randomUUID();
    const effectCalls: string[] = [];
    let blockEffectActivities = false;
    const effectReleased = Promise.withResolvers<void>();

    const worker = await Worker.create({
      activities: {
        generatePostIdActivity: async () => postId,
        createPostActivity: async ({
          input,
          postId: createdPostId,
        }: PostCreateActivityInput): Promise<PostCreateActivityResult> => ({
          ok: true,
          result: {
            authorProfileId: input.profileId,
            postId: createdPostId,
            status: 'created',
          },
        }),
        createNotificationActivity: async ({ sourceId }: CreateNotificationInput) => {
          effectCalls.push('notification:' + sourceId);
          if (blockEffectActivities && sourceId === postId) {
            await effectReleased.promise;
          }
        },
        sendLocalPostCreateActivity: async (createdPostId: string) => {
          effectCalls.push('send:' + createdPostId);
        },
      },
      connection: environment.nativeConnection,
      namespace: environment.namespace,
      taskQueue,
      workflowsPath,
    });

    await worker.runUntil(async () => {
      try {
        const effectsWorkflowId = 'post-create-effects:' + postId;
        const existingChild = await environment.client.workflow.start('postCreateEffectsWorkflow', {
          args: [{ origin: 'ACTIVITYPUB', postId }],
          taskQueue,
          workflowId: effectsWorkflowId,
        });
        await existingChild.result();
        const effectCallsAfterExistingChild = effectCalls.length;
        blockEffectActivities = true;

        const input = activityPubPostInput('https://remote.example/notes/reused-child');
        const result = await runPostCreate(environment, taskQueue, {
          input,
          requestId: randomUUID(),
        });

        assert.deepEqual(result, {
          authorProfileId: input.profileId,
          postId,
          status: 'created',
        });
        assert.equal(
          (await environment.client.workflow.getHandle(effectsWorkflowId).describe()).status.name,
          'COMPLETED',
        );
        assert.equal(effectCalls.length, effectCallsAfterExistingChild);
      } finally {
        effectReleased.resolve();
      }
    });
  },
);

test(
  'Post Create Workflow uses a supplied stable ID and forwards authorization revalidation',
  { timeout: 120_000 },
  async (t) => {
    const environment = await TestWorkflowEnvironment.createLocal({
      server: { executable: temporalTestExecutable },
    });
    t.after(() => environment.teardown());

    const taskQueue = KOSMO_TASK_QUEUE + '-post-create-stable-id-' + process.pid;
    const postId = randomUUID();
    const generatedIds: string[] = [];
    const activityInputs: PostCreateActivityInput[] = [];
    const createPostActivityStub = async (
      activityInput: PostCreateActivityInput,
    ): Promise<PostCreateActivityResult> => {
      activityInputs.push(activityInput);
      return {
        ok: true,
        result: {
          authorProfileId: activityInput.input.profileId,
          postId: activityInput.postId,
          status: 'created',
        },
      };
    };
    const worker = await Worker.create({
      activities: {
        generatePostIdActivity: async () => {
          generatedIds.push(postId);
          return postId;
        },
        createPostActivity: createPostActivityStub,
        createPostActivityV2: createPostActivityStub,
        createNotificationActivity: async () => {},
        sendLocalPostCreateActivity: async () => {},
      },
      connection: environment.nativeConnection,
      namespace: environment.namespace,
      taskQueue,
      workflowsPath,
    });

    await worker.runUntil(async () => {
      const args: PostCreateWorkflowArgs = {
        input: localPostInput('Stable post request'),
        postId,
        revalidateAuthorization: true,
        requestId: randomUUID(),
      };
      const result = (await environment.client.workflow.execute(POST_CREATE_WORKFLOW_V2_TYPE, {
        args: [args],
        taskQueue,
        workflowId: postCreateWorkflowV2.workflowIdFromArgs(args),
        workflowExecutionTimeout: '30 seconds',
      })) as PostCreateWorkflowResult;

      assert.deepEqual(result, {
        authorProfileId: args.input.profileId,
        postId,
        status: 'created',
      });
      assert.deepEqual(generatedIds, []);
      assert.deepEqual(activityInputs, [
        { input: args.input, postId, revalidateAuthorization: true },
      ]);
    });
  },
);
