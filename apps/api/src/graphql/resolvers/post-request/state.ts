import { temporalClient } from '@kosmo/core/temporal/client';
import {
  POST_REQUEST_STATE_QUERY,
  postQuoteRequestWorkflowId,
  postRequestWorkflowId,
} from '@kosmo/core/temporal/post-request';
import { WorkflowNotFoundError } from '@temporalio/client';
import type { PostRequestState } from '@kosmo/core/temporal/post-request';

export const loadPostRequestStateForAccount = async ({
  accountId,
  profileId,
  requestId,
}: {
  readonly accountId: string;
  readonly profileId?: string;
  readonly requestId: string;
}): Promise<PostRequestState | null> => {
  let state: PostRequestState | null = null;
  for (const workflowId of [
    postRequestWorkflowId(accountId, requestId),
    postQuoteRequestWorkflowId(requestId),
  ]) {
    try {
      state = await temporalClient.workflow
        .getHandle(workflowId)
        .query<PostRequestState | null>(POST_REQUEST_STATE_QUERY);
      break;
    } catch (error) {
      if (!(error instanceof WorkflowNotFoundError)) {
        throw error;
      }
    }
  }

  if (
    !state ||
    state.snapshot.requestId !== requestId ||
    state.snapshot.input.accountId !== accountId ||
    (profileId !== undefined && state.snapshot.input.profileId !== profileId)
  ) {
    return null;
  }

  return state;
};
