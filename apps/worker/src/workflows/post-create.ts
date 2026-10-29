import { PostVisibility } from '@kosmo/core/enums';
import { isPostContentDocumentV1 } from '@kosmo/core/post-content';
import {
  ApplicationFailure,
  ChildWorkflowCancellationType,
  log,
  ParentClosePolicy,
  proxyActivities,
  WorkflowIdReusePolicy,
} from '@temporalio/workflow';
import { z } from 'zod';
import { workflowActivityOptions } from './activity-options';
import { runChildWorkflow } from './child';
import { postCreateEffectsDefinition } from './create';
import type {
  ActivityPubPostCreateInput,
  PostCreateWorkflowArgs,
  PostCreateWorkflowResult,
} from '@kosmo/core/temporal/post-create';
import type * as activities from '../activities';

const httpUriSchema = z.url({ protocol: /^https?$/ });
const localPostCreateInputSchema = z.object({
  accountId: z.uuid().optional(),
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
  input: z.discriminatedUnion('origin', [
    localPostCreateInputSchema,
    activityPubPostCreateInputSchema,
  ]),
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
    );
  }
  return result.data;
};

const startPostCreateEffects = async (
  origin: PostCreateWorkflowArgs['input']['origin'],
  postId: string,
): Promise<void> => {
  try {
    await runChildWorkflow(postCreateEffectsDefinition, {
      args: [{ origin, postId }],
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

export async function postCreateWorkflow(
  input: PostCreateWorkflowArgs,
): Promise<PostCreateWorkflowResult> {
  const parsed = parseInput(input);
  if (parsed.revalidateAuthorization && parsed.input.origin !== 'LOCAL') {
    throw ApplicationFailure.nonRetryable(
      'Authorization revalidation is only supported for local Post creation',
      'VALIDATION',
    );
  }

  const postId = parsed.postId ?? (await generatePostIdActivity());
  const createPost = parsed.revalidateAuthorization ? createPostActivityV2 : createPostActivity;
  const execution = await createPost({
    input: parsed.input,
    postId,
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

  if (execution.result.status === 'created') {
    await startPostCreateEffects(parsed.input.origin, execution.result.postId);
  }

  return execution.result;
}
