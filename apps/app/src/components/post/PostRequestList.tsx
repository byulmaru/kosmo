import { useCallback } from 'react';
import { graphql, useFragment, useLazyLoadQuery, useRelayEnvironment } from 'react-relay';
import { commitLocalUpdate } from 'relay-runtime';
import { useSession } from '@/session/SessionProvider';
import {
  POST_REQUEST_HOME_ACTIVE_STATUSES,
  reconcilePublishedPostInHome,
} from './postRequestCache';
import { PostRequestCard } from './PostRequestCard';
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

type PublishedPost = Readonly<{
  authorProfileId: string | null;
  postId: string | null;
  requestNodeId: string;
}>;
type RequestSummaryProps = Readonly<{
  fetchKey?: string;
  profileId: string;
  onCompose?: () => void;
}>;

function usePostRequestCardHandlers(profileId: string) {
  const environment = useRelayEnvironment();
  const { selectedProfileId } = useSession();
  const onPublished = useCallback(
    ({ authorProfileId, postId, requestNodeId }: PublishedPost) => {
      commitLocalUpdate(environment, (store) => {
        reconcilePublishedPostInHome(store, {
          authorProfileId,
          currentProfileId: selectedProfileId,
          postId,
          profileId,
          requestNodeId,
        });
      });
    },
    [environment, profileId, selectedProfileId],
  );

  return { onPublished };
}

export function PostRequestListSummary({ fetchKey, onCompose, profileId }: RequestSummaryProps) {
  const data = useLazyLoadQuery<PostRequestListQuery>(
    PostRequestListQuery,
    { profileId },
    {
      fetchKey,
      fetchPolicy: 'store-or-network',
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
