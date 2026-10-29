// PR #1324 baseline (460872f7): old marker present, shared-child marker absent.
import {
  REMOTE_POST_LOOKUP_MAX_DOCUMENT_BYTES,
  remotePostCreateWorkflow,
} from '@kosmo/core/temporal/workflows';
import {
  ApplicationFailure,
  patched,
  proxyActivities,
  WorkflowIdReusePolicy,
} from '@temporalio/workflow';
import { z } from 'zod';
import { workflowActivityOptions } from '../workflows/activity-options';
import { runChildWorkflow } from '../workflows/child';
import type { RemotePostLookupInput } from '@kosmo/core/temporal/workflows';
import type * as activities from '../activities';

const { lookupRemotePostActivity } = proxyActivities<typeof activities>(workflowActivityOptions);
// Temporal Core reports oversized Activity results as retryable failures by default.
const { prepareRemotePostActivity } = proxyActivities<typeof activities>({
  ...workflowActivityOptions,
  retry: {
    ...workflowActivityOptions.retry,
    nonRetryableErrorTypes: ['PayloadsTooLarge'],
  },
});

const httpUriSchema = z.url({ protocol: /^https?$/ });

const inputSchema = z.strictObject({
  objectUri: httpUriSchema,
  signingProfileId: z.uuid().optional(),
  advertisingActorUri: httpUriSchema.optional(),
  maxDocumentBytes: z
    .number()
    .int()
    .nonnegative()
    .max(REMOTE_POST_LOOKUP_MAX_DOCUMENT_BYTES)
    .optional(),
});

const parseInput = (
  value: unknown,
): RemotePostLookupInput & { readonly maxDocumentBytes: number } => {
  const result = inputSchema.safeParse(value);
  if (!result.success) {
    throw ApplicationFailure.nonRetryable(
      result.error.issues[0]?.message ?? 'Remote Post lookup input is invalid',
      'RemotePostLookupInputInvalid',
    );
  }

  return {
    ...result.data,
    maxDocumentBytes: result.data.maxDocumentBytes ?? REMOTE_POST_LOOKUP_MAX_DOCUMENT_BYTES,
  };
};

export async function remotePostLookupWorkflow(input: RemotePostLookupInput) {
  const parsedInput = parseInput(input);
  if (!patched('remote-post-create-child-v1')) {
    return lookupRemotePostActivity(parsedInput);
  }

  const prepared = await prepareRemotePostActivity(parsedInput);
  if (prepared.status === 'rejected') {
    return prepared.result;
  }

  // The prepared Activity result payload bounds this smaller native child input.
  const created = await runChildWorkflow(remotePostCreateWorkflow, {
    args: [{ input: prepared.input, requestId: prepared.requestId }],
    mode: 'execute',
    workflowIdReusePolicy: WorkflowIdReusePolicy.ALLOW_DUPLICATE,
  });
  if (created.status === 'rejected') {
    return {
      documentBytes: prepared.documentBytes,
      reason: 'invalid_note',
      status: 'rejected',
    } as const;
  }

  return {
    authorProfileId: created.authorProfileId,
    documentBytes: prepared.documentBytes,
    postId: created.postId,
    status: created.status,
  } as const;
}

export { postCreateEffectsWorkflow } from '../workflows/create';
export { remotePostCreateWorkflow } from '../workflows/remote-post-create';
