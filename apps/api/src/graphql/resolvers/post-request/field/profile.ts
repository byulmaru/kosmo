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
import type { PostRequestState } from '@kosmo/core/temporal/post-request';

builder.objectField(Profile, 'postRequests', (t) =>
  t.withAuth({ login: true }).field({
    type: [PostRequest],
    resolve: async (profile, _, ctx) => {
      const accountId = ctx.session.accountId;
      const query = [
        `WorkflowType = '${POST_REQUEST_WORKFLOW_TYPE}'`,
        `${POST_REQUEST_SEARCH_ATTRIBUTES.ownerAccountId} = '${accountId}'`,
        `${POST_REQUEST_SEARCH_ATTRIBUTES.profileId} = '${profile.id}'`,
      ].join(' AND ');
      const requests: PostRequestState[] = [];

      for await (const execution of temporalClient.workflow.list({ query })) {
        const workflowIdPrefix = postRequestWorkflowId(accountId, '');
        if (!execution.workflowId.startsWith(workflowIdPrefix)) {
          continue;
        }

        const requestId = execution.workflowId.slice(workflowIdPrefix.length);
        if (!requestId) {
          continue;
        }

        const state = await loadPostRequestStateForAccount({
          accountId,
          profileId: profile.id,
          requestId,
        });
        if (state && state.status !== PostRequestStatus.PUBLISHED) {
          requests.push(state);
        }
      }

      return requests;
    },
  }),
);
