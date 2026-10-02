import { ApplicationFailure, proxyActivities } from '@temporalio/workflow';
import { z } from 'zod';
import { workflowActivityOptions } from './activity-options';
import type { RemoteProfileUpdateInput } from '@kosmo/core/temporal/workflows';
import type * as activities from '../activities';

const { getRemoteProfileActorStateActivity, applyRemoteProfileActorActivity } =
  proxyActivities<typeof activities>(workflowActivityOptions);

const httpUriSchema = z.url().refine((value) => {
  const uri = new URL(value);
  return (uri.protocol === 'http:' || uri.protocol === 'https:') && uri.hostname !== '';
});

const remoteProfileUpdateInputSchema = z.strictObject({
  actorUri: httpUriSchema,
  actorJsonLd: z.json(),
  receipt: z.strictObject({
    activityUri: httpUriSchema.optional(),
    receivedAt: z.iso.datetime(),
  }),
});

const parseRemoteProfileUpdateInput = (value: unknown): RemoteProfileUpdateInput => {
  const result = remoteProfileUpdateInputSchema.safeParse(value);
  if (result.success) {
    return result.data;
  }

  throw ApplicationFailure.nonRetryable(
    result.error.issues[0]?.message ?? 'Remote profile Update input is invalid',
  );
};

export async function remoteProfileUpdateWorkflow(
  input: RemoteProfileUpdateInput,
): Promise<string | null> {
  const parsedInput = parseRemoteProfileUpdateInput(input);
  const state = await getRemoteProfileActorStateActivity({ actorUri: parsedInput.actorUri });
  if (state === null) {
    return null;
  }

  return applyRemoteProfileActorActivity({
    actorUri: parsedInput.actorUri,
    actorJsonLd: parsedInput.actorJsonLd,
    observedAt: parsedInput.receipt.receivedAt,
  });
}
