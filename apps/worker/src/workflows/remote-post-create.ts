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
import type { ActivityPubPostCreateInput } from '@kosmo/core/temporal/post-create';
import type {
  RemotePostCreateWorkflowArgs,
  RemotePostCreateWorkflowResult,
} from '@kosmo/core/temporal/remote-post';
import type * as activities from '../activities';

const httpUriSchema = z.url({ protocol: /^https?$/ });
const objectUriSchema = z.url();
const postCreateInputSchema = z.strictObject({
  document: z.custom<ActivityPubPostCreateInput['document']>(isPostContentDocumentV1),
  hashtagNames: z.array(z.string()).optional(),
  media: z
    .array(
      z.strictObject({
        altText: z.string().nullable(),
        mediaType: z.string().nullable(),
        url: httpUriSchema,
      }),
    )
    .optional(),
  mentionProfileIds: z.array(z.uuid()),
  objectUri: objectUriSchema,
  origin: z.literal('ACTIVITYPUB'),
  profileId: z.uuid(),
  publishedAt: z.iso.datetime().nullable(),
  receivedAt: z.iso.datetime(),
  replyParentId: z.uuid().optional(),
  visibility: z.enum(PostVisibility),
});
const workflowArgsSchema = z.strictObject({
  input: postCreateInputSchema,
  requestId: z.uuid(),
});

const { createPostActivity, generatePostIdActivity } =
  proxyActivities<typeof activities>(workflowActivityOptions);

const parseInput = (value: unknown): RemotePostCreateWorkflowArgs => {
  const result = workflowArgsSchema.safeParse(value);
  if (!result.success) {
    throw ApplicationFailure.nonRetryable(
      result.error.issues[0]?.message ?? 'Remote Post creation input is invalid',
      'RemotePostCreateInputInvalid',
    );
  }
  return result.data;
};

const startPostCreateEffects = async (postId: string): Promise<void> => {
  try {
    await runChildWorkflow(postCreateEffectsDefinition, {
      args: [{ origin: 'ACTIVITYPUB', postId }],
      cancellationType: ChildWorkflowCancellationType.ABANDON,
      mode: 'start',
      parentClosePolicy: ParentClosePolicy.ABANDON,
      workflowIdReusePolicy: WorkflowIdReusePolicy.REJECT_DUPLICATE,
    });
  } catch (error) {
    if (!(error instanceof Error && error.name === 'WorkflowExecutionAlreadyStartedError')) {
      log.error('Remote Post Create effects child failed to start', {
        error: error instanceof Error ? error.message : String(error),
        postId,
      });
    }
  }
};

export async function remotePostCreateWorkflow(
  input: RemotePostCreateWorkflowArgs,
): Promise<RemotePostCreateWorkflowResult> {
  const parsed = parseInput(input);
  const execution = await createPostActivity({
    input: parsed.input,
    postId: await generatePostIdActivity(),
  });
  if (!execution.ok) {
    if (execution.error.kind === 'reply_profile_blocked') {
      return { reason: 'reply_profile_blocked', status: 'rejected' };
    }
    if (execution.error.kind === 'note_media_validation_rejected') {
      return { reason: 'note_media_validation_rejected', status: 'rejected' };
    }
    throw ApplicationFailure.nonRetryable(
      execution.error.message,
      execution.error.code,
      ...(execution.error.field === undefined ? [] : [execution.error.field]),
    );
  }

  if (execution.result.status === 'created') {
    await startPostCreateEffects(execution.result.postId);
  }

  return execution.result;
}
