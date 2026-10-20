import { REMOTE_POST_LOOKUP_MAX_DOCUMENT_BYTES } from '@kosmo/core/temporal/workflows';
import { ApplicationFailure, proxyActivities } from '@temporalio/workflow';
import { z } from 'zod';
import { workflowActivityOptions } from './activity-options';
import type { RemotePostLookupInput } from '@kosmo/core/temporal/workflows';
import type * as activities from '../activities';

const { lookupRemotePostActivity } = proxyActivities<typeof activities>(workflowActivityOptions);

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
  return lookupRemotePostActivity(parseInput(input));
}
