import { temporalClient } from '@kosmo/core/temporal/client';
import { POST_REQUEST_STATE_QUERY, postRequestWorkflowId } from '@kosmo/core/temporal/post-request';
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
  const handle = temporalClient.workflow.getHandle(postRequestWorkflowId(accountId, requestId));

  let state: PostRequestState | null;
  try {
    state = await handle.query<PostRequestState | null>(POST_REQUEST_STATE_QUERY);
  } catch (error) {
    if (error instanceof WorkflowNotFoundError) {
      return null;
    }
    throw error;
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
