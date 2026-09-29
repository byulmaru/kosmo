import { remoteProfileRefreshWorkflow } from '@kosmo/core/temporal/workflows';
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
import type {
  RemoteProfileActorLookupInput,
  RemoteProfileLookupInput,
  RemoteProfileMaterializationInput,
} from '@kosmo/core/temporal/workflows';
import type * as activities from '../activities';

const {
  lookupRemoteActorUriActivity,
  materializeRemoteProfileActorActivity,
  refreshRemoteProfileActorActivity,
} = proxyActivities<typeof activities>(workflowActivityOptions);

const httpUriSchema = z.url().refine((value) => {
  const uri = new URL(value);
  return (uri.protocol === 'http:' || uri.protocol === 'https:') && uri.hostname !== '';
});

const activityUriSchema = httpUriSchema.optional();
const receiptSchema = z.strictObject({
  activityUri: activityUriSchema,
  receivedAt: z.iso.datetime(),
});
const actorDocumentSchema = z.strictObject({
  jsonLd: z.json(),
  contextOrigin: httpUriSchema,
  receivedAt: z.iso.datetime(),
});

const remoteProfileLookupInputSchema = z.union([
  z.strictObject({
    domain: z.string().min(1),
    handle: z.string().min(1),
    profileId: z.string().min(1).optional(),
  }),
  z.strictObject({
    actorUri: httpUriSchema,
    profileId: z.string().min(1).optional(),
    receipt: receiptSchema.optional(),
    actorDocument: actorDocumentSchema.optional(),
  }),
]);

const parseRemoteProfileLookupInput = (value: unknown): RemoteProfileLookupInput => {
  const result = remoteProfileLookupInputSchema.safeParse(value);
  if (result.success) {
    return result.data;
  }

  throw ApplicationFailure.nonRetryable(
    result.error.issues[0]?.message ?? 'Remote profile lookup input is invalid',
  );
};

const startRefreshIfNeeded = async (
  input: RemoteProfileMaterializationInput,
  state: { readonly profileId: string; readonly needsRefresh: boolean },
): Promise<string> => {
  if (!state.needsRefresh) {
    return state.profileId;
  }

  try {
    await runChildWorkflow(remoteProfileRefreshWorkflow, {
      mode: 'start',
      args: [input],
      cancellationType: ChildWorkflowCancellationType.ABANDON,
      parentClosePolicy: ParentClosePolicy.ABANDON,
      workflowIdReusePolicy: WorkflowIdReusePolicy.ALLOW_DUPLICATE,
    });
  } catch (error: unknown) {
    if (!(error instanceof Error && error.name === 'WorkflowExecutionAlreadyStartedError')) {
      log.error('Remote profile refresh child failed to start', {
        actorUri: input.actorUri,
        error: error instanceof Error ? error.message : String(error),
        profileId: input.profileId ?? null,
      });
    }
  }

  return state.profileId;
};

export async function remoteProfileLookupWorkflow(
  input: RemoteProfileLookupInput,
): Promise<string | null> {
  const parsedInput = parseRemoteProfileLookupInput(input);

  if ('domain' in parsedInput) {
    const actorUri = await lookupRemoteActorUriActivity(parsedInput);
    if (actorUri === null) {
      return null;
    }

    const materializationInput: RemoteProfileActorLookupInput = {
      actorUri,
      ...(parsedInput.profileId ? { profileId: parsedInput.profileId } : {}),
    };
    const state = await materializeRemoteProfileActorActivity(materializationInput);
    return state === null
      ? refreshRemoteProfileActorActivity(materializationInput)
      : startRefreshIfNeeded(materializationInput, state);
  }

  const state = await materializeRemoteProfileActorActivity(parsedInput);
  return state?.profileId ?? null;
}
