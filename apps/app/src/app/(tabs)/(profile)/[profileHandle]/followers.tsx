import { useLocalSearchParams } from 'expo-router';
import { graphql, useLazyLoadQuery } from 'react-relay';
import {
  ProfileConnectionList,
  ProfileConnectionListState,
} from '@/components/profile/ProfileConnectionList';
import ProfileLayout from '@/components/profile/ProfileLayout';
import { ProfileRouteContainer, useProfileRoute } from '@/components/profile/ProfileRouteShell';
import { normalizeProfileHandle } from '@/components/profile/route';
import { RouteBoundary, useRouteBoundary } from '@/components/RouteBoundary';
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
  const { profileHandle } = useLocalSearchParams<{
    profileHandle?: string | string[];
  }>();
  const handle = normalizeProfileHandle(profileHandle);
  const scrollKey = `/@${handle}/followers`;

  return (
    <ProfileLayout connectionKind="followers" handle={handle} scrollKey={scrollKey}>
      <ProfileFollowersPageContent handle={handle} />
    </ProfileLayout>
  );
}

function ProfileFollowersPageContent({ handle }: { handle: string }) {
  const { chrome, scrollKey } = useProfileRoute();

  return (
    <ProfileRouteContainer scrollKey={scrollKey}>
      {chrome}
      <RouteBoundary
        error={(retry) => (
          <ProfileConnectionListState kind="followers" onRetry={retry} state="error" />
        )}
        key={handle}
        loading={<ProfileConnectionListState kind="followers" state="loading" />}
        title="팔로워 목록을 불러오지 못했어요"
      >
        <ProfileFollowersPageQueryContent handle={handle} />
      </RouteBoundary>
    </ProfileRouteContainer>
  );
}

function ProfileFollowersPageQueryContent({ handle }: { handle: string }) {
  const { fetchKey } = useRouteBoundary();
  const data = useLazyLoadQuery<ProfileFollowersPageQueryType>(
    ProfileFollowersPageQuery,
    { handle },
    { fetchKey, fetchPolicy: 'store-and-network' },
  );

  return data.profileByHandle ? (
    <ProfileConnectionList kind="followers" profile={data.profileByHandle} />
  ) : null;
}
