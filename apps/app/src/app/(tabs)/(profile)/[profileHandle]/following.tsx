import { useState } from 'react';
import { graphql, useLazyLoadQuery } from 'react-relay';
import {
  ProfileConnectionList,
  ProfileConnectionListState,
} from '@/components/profile/ProfileConnectionList';
import { useProfileHandle } from '@/components/profile/route';
import { RouteBoundary } from '@/components/RouteBoundary';
import { useRelayActor } from '@/relay/RelayActorProvider';
import type { ProfileFollowingPageQuery as ProfileFollowingPageQueryType } from './__generated__/ProfileFollowingPageQuery.graphql';

const ProfileFollowingPageQuery = graphql`
  query ProfileFollowingPageQuery($handle: String!) {
    profileByHandle(handle: $handle) {
      id
      ...ProfileConnectionList_followingProfile
    }
  }
`;

export default function ProfileFollowingPage() {
  const handle = useProfileHandle();
  const { revision } = useRelayActor();
  const [fetchKey, setFetchKey] = useState(0);

  return (
    <RouteBoundary
      error={(retry) => (
        <ProfileConnectionListState kind="following" onRetry={retry} state="error" />
      )}
      key={handle}
      loading={<ProfileConnectionListState kind="following" state="loading" />}
      onRetry={() => setFetchKey((key) => key + 1)}
      title="팔로잉 목록을 불러오지 못했어요"
    >
      <ProfileFollowingPageContent fetchKey={`${revision}:${fetchKey}`} handle={handle} />
    </RouteBoundary>
  );
}

function ProfileFollowingPageContent({ fetchKey, handle }: { fetchKey: string; handle: string }) {
  const data = useLazyLoadQuery<ProfileFollowingPageQueryType>(
    ProfileFollowingPageQuery,
    { handle },
    { fetchKey, fetchPolicy: 'store-and-network' },
  );

  return data.profileByHandle ? (
    <ProfileConnectionList kind="following" profile={data.profileByHandle} />
  ) : null;
}
