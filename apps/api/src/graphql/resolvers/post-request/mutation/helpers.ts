import { POST_REQUEST_SEARCH_ATTRIBUTES } from '@kosmo/core/temporal/post-request';
import { rethrowPostWorkflowFailure } from '../../post/mutation/errors';
import type {
  PostRequestSnapshot,
  PostRequestState,
  PostRequestStatus,
} from '@kosmo/core/temporal/post-request';
import type { Workflow, WorkflowStartOptions } from '@temporalio/client';

export const postRequestStateFromSnapshot = (
  snapshot: PostRequestSnapshot,
  status: PostRequestStatus,
): PostRequestState => ({ snapshot, status });

export const postRequestTypedSearchAttributes = (
  snapshot: PostRequestSnapshot,
  status: PostRequestStatus,
): NonNullable<WorkflowStartOptions<Workflow>['typedSearchAttributes']> => [
  {
    key: { name: POST_REQUEST_SEARCH_ATTRIBUTES.ownerAccountId, type: 'KEYWORD' },
    value: snapshot.input.accountId,
  },
  {
    key: { name: POST_REQUEST_SEARCH_ATTRIBUTES.profileId, type: 'KEYWORD' },
    value: snapshot.input.profileId,
  },
  {
    key: { name: POST_REQUEST_SEARCH_ATTRIBUTES.status, type: 'KEYWORD' },
    value: status,
  },
];

export const rethrowPostRequestFailure = rethrowPostWorkflowFailure;
