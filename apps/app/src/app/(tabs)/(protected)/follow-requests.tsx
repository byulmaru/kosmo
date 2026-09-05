import { graphql, useLazyLoadQuery } from 'react-relay';
import {
  FollowRequestList,
  FollowRequestListState,
} from '@/components/follow-request/FollowRequestList';
import { RouteBoundary, useRouteBoundary } from '@/components/RouteBoundary';
import type { FollowRequestsPageQuery } from './__generated__/FollowRequestsPageQuery.graphql';

const FollowRequestsQuery = graphql`
  query FollowRequestsPageQuery {
    currentSession {
      id
      selectedProfile {
        id
        ...FollowRequestList_profile
      }
    }
  }
`;

export default function FollowRequestsScreen() {
  return <FollowRequestsRoute />;
}

function FollowRequestsRoute() {
  return (
    <RouteBoundary
      error={(retry) => <FollowRequestListState onRetry={retry} state="error" />}
      loading={<FollowRequestListState state="loading" />}
      title="팔로워 요청을 불러오지 못했어요"
    >
      <FollowRequestsContent />
    </RouteBoundary>
  );
}

function FollowRequestsContent() {
  const { fetchKey } = useRouteBoundary();
  const data = useLazyLoadQuery<FollowRequestsPageQuery>(
    FollowRequestsQuery,
    {},
    { fetchKey, fetchPolicy: 'store-and-network' },
  );
  const profile = data.currentSession?.selectedProfile ?? null;

  return profile ? (
    <FollowRequestList profile={profile} />
  ) : (
    <FollowRequestListState state="profileRequired" />
  );
}
