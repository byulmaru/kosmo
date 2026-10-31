import { ValidationError } from '@kosmo/core/error';
import { temporalClient } from '@kosmo/core/temporal/client';
import {
  POST_REQUEST_SEARCH_ATTRIBUTES,
  POST_REQUEST_WORKFLOW_TYPE,
  PostRequestStatus,
  postRequestWorkflowId,
} from '@kosmo/core/temporal/post-request';
import { builder } from '@/graphql/builder';
import { Profile } from '@/graphql/resolvers/profile/ref';
import { PostRequestPage } from '../ref';
import { loadPostRequestStateForAccount } from '../state';
import type {
  PostRequestState,
  PostRequestStatus as PostRequestStatusValue,
} from '@kosmo/core/temporal/post-request';
import type { PostRequestPageShape } from '../ref';

const POST_REQUEST_PAGE_SIZE = 20;

const encodePageToken = (pageToken: Uint8Array | null | undefined) =>
  pageToken && pageToken.length > 0 ? Buffer.from(pageToken).toString('base64url') : null;

const decodePageToken = (pageToken: string | null | undefined) => {
  if (pageToken === null || pageToken === undefined) {
    return new Uint8Array();
  }

  try {
    const decoded = Buffer.from(pageToken, 'base64url');
    if (decoded.length === 0 || decoded.toString('base64url') !== pageToken) {
      throw new Error('Non-canonical base64url page token');
    }
    return decoded;
  } catch {
    throw new ValidationError('Invalid Post Request page token', { field: 'pageToken' });
  }
};

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

const resolvePostRequestPage = async ({
  accountId,
  pageToken,
  profileId,
  statuses,
}: {
  readonly accountId: string;
  readonly pageToken?: string | null;
  readonly profileId: string;
  readonly statuses?: readonly PostRequestStatusValue[] | null;
}): Promise<PostRequestPageShape> => {
  let nextPageToken = decodePageToken(pageToken);
  if (statuses !== undefined && statuses !== null && statuses.length === 0) {
    return { nextPageToken: null, requests: [] };
  }

  const query = createListQuery(accountId, profileId, statuses);

  while (true) {
    const response = await temporalClient.workflowService.listWorkflowExecutions({
      namespace: temporalClient.options.namespace,
      query,
      pageSize: POST_REQUEST_PAGE_SIZE,
      nextPageToken,
    });
    const requests: PostRequestState[] = [];

    for (const execution of response.executions ?? []) {
      const workflowId = execution.execution?.workflowId;
      if (!workflowId) {
        continue;
      }

      const workflowIdPrefix = postRequestWorkflowId(accountId, '');
      if (!workflowId.startsWith(workflowIdPrefix)) {
        continue;
      }
      const requestId = workflowId.slice(workflowIdPrefix.length);
      if (!requestId) {
        continue;
      }

      const state = await loadPostRequestStateForAccount({
        accountId,
        profileId,
        requestId,
      });
      if (state && matchesStatuses(state, statuses)) {
        requests.push(state);
      }
    }

    const nextToken = encodePageToken(response.nextPageToken);
    if (requests.length > 0 || nextToken === null) {
      return { nextPageToken: nextToken, requests };
    }

    nextPageToken = Buffer.from(nextToken, 'base64url');
  }
};

builder.queryField('postRequests', (t) =>
  t.withAuth({ login: true }).field({
    type: PostRequestPage,
    args: {
      profileId: t.arg.globalID({ for: Profile }),
      statuses: t.arg({ type: [PostRequestStatus], required: false }),
      pageToken: t.arg.string({ required: false }),
    },
    resolve: (_, args, ctx) =>
      resolvePostRequestPage({
        accountId: ctx.session.accountId,
        profileId: args.profileId.id,
        statuses: args.statuses,
        pageToken: args.pageToken,
      }),
  }),
);
