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
    <ProfileListLayout handle={handle}>
      {(renderList) => (
        <RouteBoundary
          error={(retry) => (
            <ProfileConnectionListState
              kind="following"
              listIdentityKey={`profile:${handle}:following:state`}
              onRetry={retry}
              renderList={renderList}
              state="error"
            />
          )}
          key={handle}
          loading={
            <ProfileConnectionListState
              kind="following"
              listIdentityKey={`profile:${handle}:following:state`}
              renderList={renderList}
              state="loading"
            />
          }
          title="팔로잉 목록을 불러오지 못했어요"
        >
          <ProfileFollowingPageContent handle={handle} renderList={renderList} />
        </RouteBoundary>
      )}
    </ProfileListLayout>
  );
}

function ProfileFollowingPageContent({
  handle,
  renderList,
}: {
  handle: string;
  renderList: InfiniteListRenderer;
}) {
  const { fetchKey } = useRouteBoundary();
  const data = useLazyLoadQuery<ProfileFollowingPageQueryType>(
    ProfileFollowingPageQuery,
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
      listIdentityKey: `profile:${handle}:following:empty`,
      loadNext: () => undefined,
      paginationMode: 'manual',
      pageSize: 20,
      renderItem: () => null,
    });
  }

  return (
    <ProfileConnectionList
      kind="following"
      listIdentityKey={`profile:${data.profileByHandle.id ?? handle}:following`}
      profile={data.profileByHandle}
      renderList={renderList}
    />
  );
}
