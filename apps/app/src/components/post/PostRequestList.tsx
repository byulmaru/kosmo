import { useCallback } from 'react';
import { graphql, useFragment, useLazyLoadQuery, useRelayEnvironment } from 'react-relay';
import { commitLocalUpdate } from 'relay-runtime';
import {
  POST_REQUEST_HOME_ACTIVE_STATUSES,
  removePostRequestFromLoadedProfileRequests,
} from './postRequestCache';
import { PostRequestCard } from './PostRequestCard';
import type { FetchPolicy } from 'relay-runtime';
import type { PostRequestList_request$key } from './__generated__/PostRequestList_request.graphql';
import type { PostRequestListQuery } from './__generated__/PostRequestListQuery.graphql';

const PostRequestListRequestFragment = graphql`
  fragment PostRequestList_request on PostRequest @relay(plural: true) {
    id
    requestId
    status
    ...PostRequestCard_request
  }
`;

const PostRequestListQuery = graphql`
  query PostRequestListQuery($profileId: ID!) {
    node(id: $profileId) {
      __typename
      ... on Profile {
        id
        postRequests {
          id
          ...PostRequestList_request
        }
      }
    }
  }
`;

type RequestSummaryProps = Readonly<{
  fetchKey?: string;
  fetchPolicy?: FetchPolicy;
  profileId: string;
  onCompose?: () => void;
}>;

function usePostRequestCardHandlers(profileId: string) {
  const environment = useRelayEnvironment();
  const onPublished = useCallback(
    (requestNodeId: string) => {
      commitLocalUpdate(environment, (store) => {
        removePostRequestFromLoadedProfileRequests(store, profileId, requestNodeId);
      });
    },
    [environment, profileId],
  );

  return { onPublished };
}

export function PostRequestListSummary({
  fetchKey,
  fetchPolicy = 'store-or-network',
  onCompose,
  profileId,
}: RequestSummaryProps) {
  const data = useLazyLoadQuery<PostRequestListQuery>(
    PostRequestListQuery,
    { profileId },
    {
      fetchKey,
      fetchPolicy,
    },
  );
  const profile = data.node?.__typename === 'Profile' ? data.node : null;
  const requests = useFragment<PostRequestList_request$key>(
    PostRequestListRequestFragment,
    profile?.postRequests ?? [],
  );
  const { onPublished } = usePostRequestCardHandlers(profileId);
  const homeRequests = requests.filter(
    (item) =>
      POST_REQUEST_HOME_ACTIVE_STATUSES.some((status) => status === item.status) ||
      item.status === 'PUBLISHED',
  );
  return homeRequests.map((request) => (
    <PostRequestCard
      key={request.id}
      onCompose={onCompose}
      onPublished={onPublished}
      request={request}
    />
  ));
}
