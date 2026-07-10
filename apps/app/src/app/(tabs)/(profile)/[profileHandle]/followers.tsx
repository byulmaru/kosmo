import { useState } from 'react';
import { graphql, useLazyLoadQuery } from 'react-relay';
import { ProfileConnectionList } from '@/components/profile/ProfileConnectionList';
import { ProfileRouteBoundary } from '@/components/profile/ProfileRouteBoundary';
import { useProfileHandle } from '@/components/profile/route';
import { StateView } from '@/components/ui/StateView';
import { useRelayActor } from '@/relay/RelayActorProvider';
import type { ProfileFollowersPageQuery as ProfileFollowersPageQueryType } from './__generated__/ProfileFollowersPageQuery.graphql';

const ProfileFollowersPageQuery = graphql`
  query ProfileFollowersPageQuery($handle: String!) {
    profileByHandle(handle: $handle) {
      id
      ...ProfileConnectionList_followersProfile
    }
  }
`;

export default function ProfileFollowersPage() {
  const handle = useProfileHandle();
  const { revision } = useRelayActor();
  const [fetchKey, setFetchKey] = useState(0);

  return (
    <ProfileRouteBoundary
      key={handle}
      loading={<StateView loading title="팔로워 목록을 불러오는 중입니다." />}
      onRetry={() => setFetchKey((key) => key + 1)}
      title="팔로워 목록을 불러오지 못했어요"
    >
      <ProfileFollowersPageContent fetchKey={`${revision}:${fetchKey}`} handle={handle} />
    </ProfileRouteBoundary>
  );
}

function ProfileFollowersPageContent({ fetchKey, handle }: { fetchKey: string; handle: string }) {
  const data = useLazyLoadQuery<ProfileFollowersPageQueryType>(
    ProfileFollowersPageQuery,
    { handle },
    { fetchKey, fetchPolicy: 'store-and-network' },
  );

  return data.profileByHandle ? (
    <ProfileConnectionList kind="followers" profile={data.profileByHandle} />
  ) : null;
}
