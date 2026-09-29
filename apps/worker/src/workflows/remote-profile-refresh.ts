import { ApplicationFailure, proxyActivities } from '@temporalio/workflow';
import { z } from 'zod';
import { workflowActivityOptions } from './activity-options';
import type { RemoteProfileMaterializationInput } from '@kosmo/core/temporal/workflows';
import type * as activities from '../activities';

const { refreshRemoteProfileActorActivity } =
  proxyActivities<typeof activities>(workflowActivityOptions);

const httpUriSchema = z.url().refine((value) => {
  const uri = new URL(value);
  return (uri.protocol === 'http:' || uri.protocol === 'https:') && uri.hostname !== '';
});

const refreshInputSchema = z.strictObject({
  actorUri: httpUriSchema,
  profileId: z.string().min(1).optional(),
});

const parseRefreshInput = (value: unknown): RemoteProfileMaterializationInput => {
  const result = refreshInputSchema.safeParse(value);
  if (result.success) {
    return result.data;
  }

  throw ApplicationFailure.nonRetryable(
    result.error.issues[0]?.message ?? 'Remote profile refresh input is invalid',
  );
};

export async function remoteProfileRefreshWorkflow(
  input: RemoteProfileMaterializationInput,
): Promise<string> {
  return refreshRemoteProfileActorActivity(parseRefreshInput(input));
}
