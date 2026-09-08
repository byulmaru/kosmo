import { useLocalSearchParams } from 'expo-router';
import { graphql, useLazyLoadQuery } from 'react-relay';
import {
  ProfileConnectionList,
  ProfileConnectionListState,
} from '@/components/profile/ProfileConnectionList';
import { normalizeProfileHandle } from '@/components/profile/route';
import { RouteBoundary, useRouteBoundary } from '@/components/RouteBoundary';
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
  const { profileHandle } = useLocalSearchParams<{
    profileHandle?: string | string[];
  }>();
  const handle = normalizeProfileHandle(profileHandle);

  return (
    <RouteBoundary
      error={(retry) => (
        <ProfileConnectionListState kind="following" onRetry={retry} state="error" />
      )}
      key={handle}
      loading={<ProfileConnectionListState kind="following" state="loading" />}
      title="팔로잉 목록을 불러오지 못했어요"
    >
      <ProfileFollowingPageContent handle={handle} />
    </RouteBoundary>
  );
}

function ProfileFollowingPageContent({ handle }: { handle: string }) {
  const { fetchKey } = useRouteBoundary();
  const data = useLazyLoadQuery<ProfileFollowingPageQueryType>(
    ProfileFollowingPageQuery,
    { handle },
    { fetchKey, fetchPolicy: 'store-and-network' },
  );

  return data.profileByHandle ? (
    <ProfileConnectionList kind="following" profile={data.profileByHandle} />
  ) : null;
}
