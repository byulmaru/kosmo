import { useIsFocused, useLocalSearchParams } from 'expo-router';
import { graphql, useLazyLoadQuery } from 'react-relay';
import {
  ProfileConnectionList,
  ProfileConnectionListState,
} from '@/components/profile/ProfileConnectionList';
import { ProfileRouteContainer, useProfileRoute } from '@/components/profile/ProfileRouteShell';
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
  const active = useIsFocused();
  const { profileHandle } = useLocalSearchParams<{
    profileHandle?: string | string[];
  }>();
  const handle = normalizeProfileHandle(profileHandle);
  const { chrome, scrollKey } = useProfileRoute();

  return (
    <ProfileRouteContainer scrollKey={scrollKey}>
      {chrome}
      <RouteBoundary
        error={(retry) => (
          <ProfileConnectionListState kind="following" onRetry={retry} state="error" />
        )}
        key={handle}
        loading={<ProfileConnectionListState kind="following" state="loading" />}
        title="팔로잉 목록을 불러오지 못했어요"
      >
        <ProfileFollowingPageContent active={active} handle={handle} />
      </RouteBoundary>
    </ProfileRouteContainer>
  );
}

function ProfileFollowingPageContent({ active, handle }: { active: boolean; handle: string }) {
  const { fetchKey } = useRouteBoundary();
  const data = useLazyLoadQuery<ProfileFollowingPageQueryType>(
    ProfileFollowingPageQuery,
    { handle },
    { fetchKey, fetchPolicy: 'store-and-network' },
  );

  return data.profileByHandle ? (
    <ProfileConnectionList active={active} kind="following" profile={data.profileByHandle} />
  ) : null;
}
