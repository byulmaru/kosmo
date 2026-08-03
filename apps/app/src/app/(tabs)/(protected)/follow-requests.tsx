import { useState } from 'react';
import { graphql, useLazyLoadQuery } from 'react-relay';
import {
  FollowRequestList,
  FollowRequestListState,
} from '@/components/follow-request/FollowRequestList';
import { RouteBoundary } from '@/components/RouteBoundary';
import { useRelayActor } from '@/relay/RelayActorProvider';
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
  const { revision } = useRelayActor();

  return <FollowRequestsRoute key={revision} revision={revision} />;
}

function FollowRequestsRoute({ revision }: { revision: number }) {
  const [fetchKey, setFetchKey] = useState(0);

  return (
    <RouteBoundary
      error={(retry) => <FollowRequestListState onRetry={retry} state="error" />}
      loading={<FollowRequestListState state="loading" />}
      onRetry={() => setFetchKey((value) => value + 1)}
      title="팔로워 요청을 불러오지 못했어요"
    >
      <FollowRequestsContent fetchKey={`${revision}:${fetchKey}`} />
    </RouteBoundary>
  );
}

function FollowRequestsContent({ fetchKey }: { fetchKey: string }) {
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
