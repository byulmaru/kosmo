import { PermissionDeniedError, ValidationError } from '@kosmo/core/error';
import { temporalClient } from '@kosmo/core/temporal/client';
import {
  POST_REQUEST_SEARCH_ATTRIBUTES,
  POST_REQUEST_WORKFLOW_TYPE,
  PostRequestStatus,
  postRequestWorkflowId,
} from '@kosmo/core/temporal/post-request';
import { builder } from '@/graphql/builder';
import { Account } from '@/graphql/resolvers/account';
import { Profile } from '@/graphql/resolvers/profile/ref';
import { PostRequest, PostRequestConnection } from '../ref';
import { loadPostRequestStateForAccount } from '../state';
import type {
  PostRequestState,
  PostRequestStatus as PostRequestStatusValue,
} from '@kosmo/core/temporal/post-request';

type PostRequestCursor = {
  readonly pageToken: string | null;
  readonly offset: number;
};

type PostRequestEdge = {
  readonly cursor: string;
  readonly node: PostRequestState;
};

type PostRequestConnectionSource = {
  readonly edges: readonly PostRequestEdge[];
  readonly pageInfo: {
    readonly endCursor: string | null;
    readonly hasNextPage: boolean;
    readonly hasPreviousPage: boolean;
    readonly startCursor: string | null;
  };
};

const POST_REQUEST_PAGE_SIZE = 100;
const MAX_POST_REQUEST_PAGE_SIZE = 20;

const encodeCursor = (cursor: PostRequestCursor) =>
  Buffer.from(JSON.stringify(cursor)).toString('base64url');

const decodeCursor = (cursor: string | null | undefined): PostRequestCursor => {
  if (cursor === null || cursor === undefined) {
    return { pageToken: null, offset: 0 };
  }

  try {
    const decoded = Buffer.from(cursor, 'base64url');
    if (decoded.toString('base64url') !== cursor) {
      throw new Error('Non-canonical base64url');
    }

    const value: unknown = JSON.parse(decoded.toString('utf8'));
    if (
      typeof value !== 'object' ||
      value === null ||
      !('pageToken' in value) ||
      !('offset' in value) ||
      (value.pageToken !== null && typeof value.pageToken !== 'string') ||
      typeof value.offset !== 'number' ||
      !Number.isSafeInteger(value.offset) ||
      value.offset < 0
    ) {
      throw new Error('Invalid cursor payload');
    }

    return {
      pageToken: value.pageToken,
      offset: value.offset,
    };
  } catch {
    throw new ValidationError('Invalid Post Request cursor', { field: 'after' });
  }
};

const encodePageToken = (pageToken: Uint8Array | null | undefined) =>
  pageToken && pageToken.length > 0 ? Buffer.from(pageToken).toString('base64url') : null;

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

const emptyConnection = (after: string | null | undefined): PostRequestConnectionSource => ({
  edges: [],
  pageInfo: {
    endCursor: null,
    hasNextPage: false,
    hasPreviousPage: after !== null && after !== undefined,
    startCursor: null,
  },
});

const resolvePostRequestConnection = async ({
  accountId,
  after,
  first,
  profileId,
  statuses,
}: {
  readonly accountId: string;
  readonly after?: string | null;
  readonly first: number;
  readonly profileId: string;
  readonly statuses?: readonly PostRequestStatusValue[] | null;
}): Promise<PostRequestConnectionSource> => {
  const cursor = decodeCursor(after);
  if (first < 0) {
    throw new ValidationError('Invalid Post Request page size', { field: 'first' });
  }
  const pageSize = Math.min(first, MAX_POST_REQUEST_PAGE_SIZE);
  if (statuses !== undefined && statuses !== null && statuses.length === 0) {
    return emptyConnection(after);
  }

  const query = createListQuery(accountId, profileId, statuses);
  const requests: { readonly cursor: string; readonly state: PostRequestState }[] = [];
  let pageToken = cursor.pageToken;
  let offset = cursor.offset;

  while (requests.length < pageSize + 1) {
    const currentPageToken = pageToken;
    const response = await temporalClient.workflowService.listWorkflowExecutions({
      namespace: temporalClient.options.namespace,
      query,
      pageSize: POST_REQUEST_PAGE_SIZE,
      nextPageToken: currentPageToken
        ? Buffer.from(currentPageToken, 'base64url')
        : Buffer.alloc(0),
    });
    const executions = response.executions ?? [];
    const nextPageToken = encodePageToken(response.nextPageToken);

    for (
      let index = offset;
      index < executions.length && requests.length < pageSize + 1;
      index += 1
    ) {
      const execution = executions[index]?.execution;
      const workflowId = execution?.workflowId;
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
      if (
        !state ||
        (statuses !== undefined && statuses !== null && !statuses.includes(state.status))
      ) {
        continue;
      }

      const nextCursor =
        index + 1 < executions.length || nextPageToken === null
          ? { pageToken: currentPageToken, offset: index + 1 }
          : { pageToken: nextPageToken, offset: 0 };
      requests.push({ cursor: encodeCursor(nextCursor), state });
    }

    if (nextPageToken === null) {
      break;
    }
    pageToken = nextPageToken;
    offset = 0;
  }

  const visibleRequests = requests.slice(0, pageSize);
  return {
    edges: visibleRequests.map(({ cursor: edgeCursor, state }) => ({
      cursor: edgeCursor,
      node: state,
    })),
    pageInfo: {
      endCursor: visibleRequests.at(-1)?.cursor ?? null,
      hasNextPage: requests.length > pageSize,
      hasPreviousPage: after !== null && after !== undefined,
      startCursor: visibleRequests[0]?.cursor ?? null,
    },
  };
};

builder.objectField(Account, 'postRequests', (t) =>
  t.withAuth({ login: true }).field({
    type: PostRequestConnection,
    args: {
      profileId: t.arg.globalID({ for: Profile }),
      first: t.arg.int({ required: true }),
      after: t.arg.string({ required: false }),
      statuses: t.arg({ type: [PostRequestStatus], required: false }),
    },
    resolve: (account, args, ctx) => {
      if (ctx.session?.accountId !== account.id) {
        throw new PermissionDeniedError('Account owner is required');
      }

      return resolvePostRequestConnection({
        accountId: account.id,
        profileId: args.profileId.id,
        first: args.first,
        after: args.after,
        statuses: args.statuses,
      });
    },
  }),
);

builder.objectField(Account, 'postRequest', (t) =>
  t.withAuth({ login: true }).field({
    type: PostRequest,
    nullable: true,
    args: {
      requestId: t.arg.string({ required: true }),
      profileId: t.arg.globalID({ for: Profile }),
    },
    resolve: (account, args, ctx) =>
      ctx.session?.accountId === account.id
        ? loadPostRequestStateForAccount({
            accountId: account.id,
            profileId: args.profileId.id,
            requestId: args.requestId,
          })
        : null,
    unauthorizedResolver: () => null,
  }),
);
