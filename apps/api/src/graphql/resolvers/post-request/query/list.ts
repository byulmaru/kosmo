import { temporalClient } from '@kosmo/core/temporal/client';
import {
  POST_REQUEST_SEARCH_ATTRIBUTES,
  POST_REQUEST_WORKFLOW_TYPE,
  PostRequestStatus,
  postRequestWorkflowId,
} from '@kosmo/core/temporal/post-request';
import { builder } from '@/graphql/builder';
import { Profile } from '@/graphql/resolvers/profile/ref';
import { PostRequest } from '../ref';
import { loadPostRequestStateForAccount } from '../state';
import type {
  PostRequestState,
  PostRequestStatus as PostRequestStatusValue,
} from '@kosmo/core/temporal/post-request';

const createListQuery = (
  accountId: string,
  profileId: string,
  statuses: readonly PostRequestStatusValue[] | null | undefined,
) => {
  const clauses = [
    `WorkflowType = '${POST_REQUEST_WORKFLOW_TYPE}'`,
    `${POST_REQUEST_SEARCH_ATTRIBUTES.ownerAccountId} = '${accountId}'`,
    `${POST_REQUEST_SEARCH_ATTRIBUTES.profileId} = '${profileId}'`,
  ];

  if (statuses !== undefined && statuses !== null) {
    clauses.push(
      `${POST_REQUEST_SEARCH_ATTRIBUTES.status} IN (${statuses.map((status) => `'${status}'`).join(', ')})`,
    );
  }

  return clauses.join(' AND ');
};

const matchesStatuses = (
  state: PostRequestState,
  statuses: readonly PostRequestStatusValue[] | null | undefined,
) => statuses === undefined || statuses === null || statuses.includes(state.status);

const resolvePostRequests = async ({
  accountId,
  profileId,
  statuses,
}: {
  readonly accountId: string;
  readonly profileId: string;
  readonly statuses?: readonly PostRequestStatusValue[] | null;
}): Promise<PostRequestState[]> => {
  if (statuses !== undefined && statuses !== null && statuses.length === 0) {
    return [];
  }

  const query = createListQuery(accountId, profileId, statuses);
  const requests: PostRequestState[] = [];

  for await (const execution of temporalClient.workflow.list({ query })) {
    const workflowId = execution.workflowId;
    const workflowIdPrefix = postRequestWorkflowId(accountId, '');
    if (!workflowId.startsWith(workflowIdPrefix)) {
      continue;
    }

    const requestId = workflowId.slice(workflowIdPrefix.length);
    if (!requestId) {
      continue;
    }

    const state = await loadPostRequestStateForAccount({ accountId, profileId, requestId });
    if (state && matchesStatuses(state, statuses)) {
      requests.push(state);
    }
  }

  return requests;
};

builder.queryField('postRequests', (t) =>
  t.withAuth({ login: true }).field({
    type: [PostRequest],
    args: {
      profileId: t.arg.globalID({ for: Profile }),
      statuses: t.arg({ type: [PostRequestStatus], required: false }),
    },
    resolve: (_, args, ctx) =>
      resolvePostRequests({
        accountId: ctx.session.accountId,
        profileId: args.profileId.id,
        statuses: args.statuses,
      }),
  }),
);
