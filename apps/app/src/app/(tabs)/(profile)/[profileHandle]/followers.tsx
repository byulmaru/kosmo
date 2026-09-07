import { useLocalSearchParams } from 'expo-router';
import { graphql, useLazyLoadQuery } from 'react-relay';
import {
  ProfileConnectionList,
  ProfileConnectionListState,
} from '@/components/profile/ProfileConnectionList';
import { ProfileListLayout } from '@/components/profile/ProfileListLayout';
import { normalizeProfileHandle } from '@/components/profile/route';
import { RouteBoundary, useRouteBoundary } from '@/components/RouteBoundary';
import type { InfiniteListRenderer } from '@/components/pagination/InfiniteList';
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

  return (
    <ProfileListLayout handle={handle}>
      {(renderList) => (
        <RouteBoundary
          error={(retry) => (
            <ProfileConnectionListState
              kind="followers"
              listIdentityKey={`profile:${handle}:followers:state`}
              onRetry={retry}
              renderList={renderList}
              state="error"
            />
          )}
          key={handle}
          loading={
            <ProfileConnectionListState
              kind="followers"
              listIdentityKey={`profile:${handle}:followers:state`}
              renderList={renderList}
              state="loading"
            />
          }
          title="팔로워 목록을 불러오지 못했어요"
        >
          <ProfileFollowersPageContent handle={handle} renderList={renderList} />
        </RouteBoundary>
      )}
    </ProfileListLayout>
  );
}

function ProfileFollowersPageContent({
  handle,
  renderList,
}: {
  handle: string;
  renderList: InfiniteListRenderer;
}) {
  const { fetchKey } = useRouteBoundary();
  const data = useLazyLoadQuery<ProfileFollowersPageQueryType>(
    ProfileFollowersPageQuery,
    { handle },
    { fetchKey, fetchPolicy: 'store-and-network' },
  );

  if (!data.profileByHandle) {
    return renderList({
      data: [],
      empty: null,
      hasNext: false,
      isLoadingNext: false,
      keyExtractor: () => 'empty',
      listIdentityKey: `profile:${handle}:followers:empty`,
      loadNext: () => undefined,
      paginationMode: 'manual',
      pageSize: 20,
      renderItem: () => null,
    });
  }

  return (
    <ProfileConnectionList
      kind="followers"
      listIdentityKey={`profile:${data.profileByHandle.id ?? handle}:followers`}
      profile={data.profileByHandle}
      renderList={renderList}
    />
  );
}
