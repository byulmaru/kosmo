import { useLocalSearchParams } from 'expo-router';
import { graphql, useLazyLoadQuery } from 'react-relay';
import { PostList } from '@/components/post/PostList';
import { normalizeProfileHandle } from '@/components/profile/route';
import { RouteBoundary, useRouteBoundary } from '@/components/RouteBoundary';
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
    <RouteBoundary
      error={(retry) => <PostList error onRetry={retry} />}
      key={handle}
      loading={<PostList loading />}
      title="게시글 목록을 불러오지 못했어요"
    >
      <ProfilePostListPageContent handle={handle} />
    </RouteBoundary>
  );
}

function ProfilePostListPageContent({ handle }: { handle: string }) {
  const { fetchKey } = useRouteBoundary();
  const data = useLazyLoadQuery<ProfilePostListPageQueryType>(
    ProfilePostListPageQuery,
    { handle },
    { fetchKey, fetchPolicy: 'store-and-network' },
  );

  return (
    <PostList
      profile={data.profileByHandle}
      replyProfile={data.currentSession?.selectedProfile ?? null}
    />
  );
}
