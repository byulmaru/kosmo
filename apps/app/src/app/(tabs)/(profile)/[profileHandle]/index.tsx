import { useLocalSearchParams } from 'expo-router';
import { graphql, useLazyLoadQuery } from 'react-relay';
import { PostList } from '@/components/post/PostList';
import { ProfileListLayout } from '@/components/profile/ProfileListLayout';
import { normalizeProfileHandle } from '@/components/profile/route';
import { RouteBoundary, useRouteBoundary } from '@/components/RouteBoundary';
import type { InfiniteListRenderer } from '@/components/pagination/InfiniteList';
import type { ProfilePostListPageQuery as ProfilePostListPageQueryType } from './__generated__/ProfilePostListPageQuery.graphql';

const ProfilePostListPageQuery = graphql`
  query ProfilePostListPageQuery($handle: String!) {
    currentSession {
      id
      selectedProfile {
        id
        ...ReplyComposerSurface_profile
      }
    }
    profileByHandle(handle: $handle) {
      id
      ...PostList_profile @arguments(count: 20)
    }
  }
`;

export default function ProfilePostListPage() {
  const { profileHandle } = useLocalSearchParams<{
    profileHandle?: string | string[];
  }>();
  const handle = normalizeProfileHandle(profileHandle);

  return (
    <ProfileListLayout handle={handle}>
      {(renderList) => (
        <RouteBoundary
          error={(retry) => <PostList error onRetry={retry} renderList={renderList} />}
          key={handle}
          loading={<PostList loading renderList={renderList} />}
          title="게시글 목록을 불러오지 못했어요"
        >
          <ProfilePostListPageContent handle={handle} renderList={renderList} />
        </RouteBoundary>
      )}
    </ProfileListLayout>
  );
}

function ProfilePostListPageContent({
  handle,
  renderList,
}: {
  handle: string;
  renderList: InfiniteListRenderer;
}) {
  const { fetchKey } = useRouteBoundary();
  const data = useLazyLoadQuery<ProfilePostListPageQueryType>(
    ProfilePostListPageQuery,
    { handle },
    { fetchKey, fetchPolicy: 'store-and-network' },
  );

  return (
    <PostList
      identityKey={`profile:${data.profileByHandle?.id ?? handle}`}
      profile={data.profileByHandle}
      renderList={renderList}
      replyProfile={data.currentSession?.selectedProfile ?? null}
    />
  );
}
