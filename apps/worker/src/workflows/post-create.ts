import { PostVisibility } from '@kosmo/core/enums';
import { isPostContentDocumentV1 } from '@kosmo/core/post-content';
import { postCreateInputKey } from '@kosmo/core/temporal/post';
import {
  allHandlersFinished,
  ApplicationFailure,
  ChildWorkflowCancellationType,
  condition,
  defineUpdate,
  log,
  ParentClosePolicy,
  patched,
  proxyActivities,
  setHandler,
  WorkflowIdReusePolicy,
  workflowInfo,
} from '@temporalio/workflow';
import { z } from 'zod';
import { workflowActivityOptions } from './activity-options';
import { runChildWorkflow } from './child';
import { postCreateEffectsDefinition } from './create';
import { linkPreviewCollectionWorkflowDefinition } from './link-preview';
import { settleEffects } from './settle-effects';
import type { PostContentDocumentV1 } from '@kosmo/core/post-content';
import type { PostCreateInput, PostTransitionOutcome } from '@kosmo/core/temporal/post';
import type {
  ActivityPubPostCreateInput,
  PostAnalyticsPlatform,
  PostCreateWorkflowArgs,
  PostCreateWorkflowResult,
} from '@kosmo/core/temporal/post-create';
import type * as activities from '../activities';

const httpUriSchema = z.url({ protocol: /^https?$/ });
const localPostCreateInputSchema = z.object({
  accountId: z.uuid().optional(),
  admissionId: z.string().optional(),
  bodyText: z.string(),
  contentWarning: z.string().nullable().optional(),
  media: z.array(z.object({ altText: z.string().nullable(), mediaId: z.uuid() })).optional(),
  mentions: z
    .array(
      z.object({
        end: z.number().int(),
        handle: z.string(),
        profileId: z.uuid(),
        relativeHandle: z.string(),
        start: z.number().int(),
      }),
    )
    .optional(),
  origin: z.literal('LOCAL'),
  profileId: z.uuid(),
  replyParentId: z.uuid().optional(),
  repostSourceId: z.uuid().optional(),
  quotePolicy: z.enum(['EVERYONE', 'FOLLOWERS', 'AUTHOR']).nullish(),
  sensitiveMedia: z.boolean().optional(),
  visibility: z.enum(PostVisibility),
});
const activityPubPostCreateInputSchema = z.object({
  document: z.custom<ActivityPubPostCreateInput['document']>(isPostContentDocumentV1),
  hashtagNames: z.array(z.string()).optional(),
  media: z
    .array(
      z.object({
        altText: z.string().nullable(),
        mediaType: z.string().nullable(),
        url: httpUriSchema,
      }),
    )
    .optional(),
  mentionProfileIds: z.array(z.uuid()),
  objectUri: z.url(),
  origin: z.literal('ACTIVITYPUB'),
  profileId: z.uuid(),
  publishedAt: z.iso.datetime().nullable(),
  receivedAt: z.iso.datetime(),
  replyParentId: z.uuid().optional(),
  visibility: z.enum(PostVisibility),
});
const workflowArgsSchema = z.object({
  quoteAdmittedAt: z.iso.datetime().optional(),
  analyticsPlatform: z.enum(['web', 'native']).optional(),
  input: z.discriminatedUnion('origin', [
    localPostCreateInputSchema,
    activityPubPostCreateInputSchema,
  ]),
  mode: z.enum(['publish', 'import']).optional(),
  postId: z.uuid().optional(),
  revalidateAuthorization: z.boolean().optional(),
  requestId: z.uuid(),
});

const { createPostActivity, createPostActivityV2, generatePostIdActivity } =
  proxyActivities<typeof activities>(workflowActivityOptions);

const parseInput = (value: unknown): PostCreateWorkflowArgs => {
  const result = workflowArgsSchema.safeParse(value);
  if (!result.success) {
    const failureType =
      (value as { input?: { origin?: unknown } } | null)?.input?.origin === 'ACTIVITYPUB'
        ? 'RemotePostCreateInputInvalid'
        : 'VALIDATION';
    throw ApplicationFailure.nonRetryable(
      result.error.issues[0]?.message ?? 'Post creation input is invalid',
      failureType,
      ...(result.error.issues[0]?.path.at(-1) === 'admissionId' ? ['admissionId'] : []),
    );
  }
  return result.data;
};

export const startPostCreateEffects = async (
  origin: PostCreateWorkflowArgs['input']['origin'],
  postId: string,
  analyticsPlatform?: PostAnalyticsPlatform,
): Promise<void> => {
  try {
    await runChildWorkflow(postCreateEffectsDefinition, {
      args: [
        {
          origin,
          postId,
          ...(analyticsPlatform !== undefined &&
          patched('post-create-effects-analytics-platform-v1')
            ? { analyticsPlatform }
            : {}),
        },
      ],
      cancellationType: ChildWorkflowCancellationType.ABANDON,
      mode: 'start',
      parentClosePolicy: ParentClosePolicy.ABANDON,
      workflowIdReusePolicy: WorkflowIdReusePolicy.REJECT_DUPLICATE,
    });
  } catch (error) {
    if (!(error instanceof Error && error.name === 'WorkflowExecutionAlreadyStartedError')) {
      log.error('Post Create effects child failed to start', {
        error: error instanceof Error ? error.message : String(error),
        postId,
      });
    }
  }
};

const startPostLinkPreviewCollection = async (postId: string): Promise<void> => {
  try {
    await runChildWorkflow(linkPreviewCollectionWorkflowDefinition, {
      args: [{ postId }],
      cancellationType: ChildWorkflowCancellationType.ABANDON,
      mode: 'start',
      parentClosePolicy: ParentClosePolicy.ABANDON,
      workflowIdReusePolicy: WorkflowIdReusePolicy.REJECT_DUPLICATE,
    });
  } catch (error) {
    if (!(error instanceof Error && error.name === 'WorkflowExecutionAlreadyStartedError')) {
      log.error('Post Link Preview collection child failed to start', {
        error: error instanceof Error ? error.message : String(error),
        postId,
      });
    }
  }
};

async function currentPostCreateWorkflow(
  input: PostCreateWorkflowArgs,
): Promise<PostCreateWorkflowResult> {
  const parsed = parseInput(input);
  if (parsed.revalidateAuthorization && parsed.input.origin !== 'LOCAL') {
    throw ApplicationFailure.nonRetryable(
      'Authorization revalidation is only supported for local Post creation',
      'VALIDATION',
    );
  }
  const isLocalQuote = parsed.input.origin === 'LOCAL' && parsed.input.repostSourceId !== undefined;
  if (parsed.input.origin === 'LOCAL') {
    if (isLocalQuote) {
      const admission = /^(\d{13}):(.+)$/.exec(parsed.input.admissionId ?? '');
      if (!admission || !z.uuid().safeParse(admission[2]).success) {
        throw ApplicationFailure.nonRetryable(
          'Quote creation requires its original admission identity',
          'VALIDATION',
          'admissionId',
        );
      }
      const issuedAt = Number(admission[1]);
      const startedAt =
        parsed.quoteAdmittedAt === undefined
          ? workflowInfo().startTime.getTime()
          : Date.parse(parsed.quoteAdmittedAt);
      if (startedAt > workflowInfo().startTime.getTime()) {
        throw ApplicationFailure.nonRetryable(
          'Quote admission cannot be after publication started',
          'VALIDATION',
          'admissionId',
        );
      }
      if (issuedAt > startedAt + 30_000) {
        throw ApplicationFailure.nonRetryable(
          'Quote admission timestamp is in the future',
          'VALIDATION',
          'admissionId',
        );
      }
      if (startedAt - issuedAt > 5 * 60_000) {
        throw ApplicationFailure.nonRetryable(
          'Quote admission expired; its result cannot be safely recreated',
          'VALIDATION',
          'admissionId',
        );
      }
    } else if (parsed.input.admissionId !== undefined) {
      throw ApplicationFailure.nonRetryable(
        'Quote admission requires its original Source',
        'VALIDATION',
        'admissionId',
      );
    }
  }
  const postId =
    parsed.postId ??
    (isLocalQuote
      ? await generatePostIdActivity(parsed.input)
      : parsed.input.origin === 'ACTIVITYPUB'
        ? await generatePostIdActivity({
            publishedAt: parsed.input.publishedAt,
            receivedAt: parsed.input.receivedAt,
          })
        : await generatePostIdActivity());
  const createPost = parsed.revalidateAuthorization ? createPostActivityV2 : createPostActivity;
  const execution = await createPost({
    input: parsed.input,
    postId,
    ...(isLocalQuote ? { requestId: parsed.requestId } : {}),
    ...(parsed.revalidateAuthorization === undefined
      ? {}
      : { revalidateAuthorization: parsed.revalidateAuthorization }),
  });
  if (!execution.ok) {
    if (
      parsed.input.origin === 'ACTIVITYPUB' &&
      (execution.error.kind === 'reply_profile_blocked' ||
        execution.error.kind === 'note_media_validation_rejected')
    ) {
      return { reason: execution.error.kind, status: 'rejected' };
    }
    throw ApplicationFailure.nonRetryable(
      execution.error.message,
      execution.error.code,
      ...(execution.error.field === undefined ? [] : [execution.error.field]),
    );
  }

  if (execution.result.status === 'created' && patched('post-create-link-preview-collection-v1')) {
    await startPostLinkPreviewCollection(execution.result.postId);
  }

  if (execution.result.status === 'created' && parsed.mode !== 'import') {
    await startPostCreateEffects(
      parsed.input.origin,
      execution.result.postId,
      parsed.analyticsPlatform,
    );
  }

  return execution.result;
}

const inputSchema = z.strictObject({
  admissionId: z.string(),
  accountId: z.uuid().optional(),
  authoredBodyText: z.string().optional(),
  document: z.custom<PostContentDocumentV1>(isPostContentDocumentV1),
  media: z.array(z.strictObject({ altText: z.string().nullable(), mediaId: z.uuid() })).optional(),
  origin: z.literal('LOCAL'),
  profileId: z.uuid(),
  replyParentId: z.uuid().optional(),
  repostSourceId: z.uuid().optional(),
  quotePolicy: z.enum(['EVERYONE', 'FOLLOWERS', 'AUTHOR']).nullish(),
  visibility: z.enum(['PUBLIC', 'UNLISTED', 'FOLLOWERS', 'DIRECT']),
}) satisfies z.ZodType<PostCreateInput>;
const {
  reservePostIdActivity,
  createPostTransitionActivity,
  createNotificationActivity,
  createReplyNotificationActivity,
  createQuoteNotificationActivity,
  sendLocalPostCreateActivity,
  sendLocalPostQuoteRequestActivity,
} = proxyActivities<typeof activities>(workflowActivityOptions);

async function quotePostCreateWorkflow(input: PostCreateInput): Promise<void> {
  const currentAdmission = patched('post-create-quote-admission-v1');
  const parsed = inputSchema.safeParse(input);
  if (!parsed.success) {
    throw ApplicationFailure.nonRetryable('Invalid Post create input');
  }
  const admission = /^(\d{13}):(.+)$/.exec(parsed.data.admissionId);
  if (currentAdmission && (!admission || !z.uuid().safeParse(admission[2]).success)) {
    throw ApplicationFailure.nonRetryable('Invalid Post create input');
  }
  let received = false;
  let execution: Awaited<ReturnType<typeof activities.createPostTransitionActivity>> | undefined;
  let failure: unknown;
  setHandler(
    defineUpdate<PostTransitionOutcome<{ postId: string }>, [PostCreateInput?]>('createPost'),
    async (submitted = input) => {
      const candidate = inputSchema.safeParse(submitted);
      if (
        !candidate.success ||
        postCreateInputKey(candidate.data) !== postCreateInputKey(parsed.data)
      ) {
        return {
          ok: false as const,
          error: {
            code: 'VALIDATION' as const,
            message: 'Quote admission payload does not match its original submission',
            field: 'admissionId',
          },
        };
      }
      if (received) {
        await condition(() => execution !== undefined || failure !== undefined);
        if (failure) {
          throw failure;
        }
        return execution!;
      }
      received = true;
      try {
        const postId = currentAdmission
          ? await reservePostIdActivity(parsed.data)
          : await reservePostIdActivity();
        execution = await createPostTransitionActivity(parsed.data, postId);
        return execution.ok ? { ok: true as const, result: execution.result } : execution;
      } catch (error) {
        failure = error;
        throw error;
      }
    },
  );
  if (!(await condition(() => received, '1 minute'))) {
    return;
  }
  await condition(allHandlersFinished);
  if (failure) {
    throw failure;
  }
  if (!execution?.ok) {
    return;
  }
  const postId = execution.result.postId;
  await settleEffects([
    ...(currentAdmission
      ? [
          createNotificationActivity({ kind: 'REPLY', sourceId: postId }),
          createNotificationActivity({ kind: 'QUOTE', sourceId: postId }),
          createNotificationActivity({ kind: 'MENTION', sourceId: postId }),
        ]
      : [createReplyNotificationActivity(postId), createQuoteNotificationActivity(postId)]),
    sendLocalPostCreateActivity(postId),
    ...(execution.quoteRequest ? [sendLocalPostQuoteRequestActivity(execution.quoteRequest)] : []),
  ]);
}

export async function postCreateWorkflow(
  input: PostCreateWorkflowArgs,
): Promise<PostCreateWorkflowResult>;
export async function postCreateWorkflow(input: PostCreateInput): Promise<void>;
export async function postCreateWorkflow(
  input: PostCreateWorkflowArgs | PostCreateInput,
): Promise<PostCreateWorkflowResult | void> {
  return 'requestId' in input ? currentPostCreateWorkflow(input) : quotePostCreateWorkflow(input);
}
