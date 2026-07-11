import { useState } from 'react';
import { graphql, useLazyLoadQuery } from 'react-relay';
import { PostList } from '@/components/post/PostList';
import { useProfileHandle } from '@/components/profile/route';
import { RouteBoundary } from '@/components/RouteBoundary';
import { useRelayActor } from '@/relay/RelayActorProvider';
import type { ProfilePostListPageQuery as ProfilePostListPageQueryType } from './__generated__/ProfilePostListPageQuery.graphql';

const ProfilePostListPageQuery = graphql`
  query ProfilePostListPageQuery($handle: String!) {
    profileByHandle(handle: $handle) {
      id
      ...PostList_profile
    }
  }
`;

export default function ProfilePostListPage() {
  const handle = useProfileHandle();
  const { revision } = useRelayActor();
  const [fetchKey, setFetchKey] = useState(0);

  return (
    <RouteBoundary
      error={(retry) => <PostList error onRetry={retry} />}
      key={handle}
      loading={<PostList loading />}
      onRetry={() => setFetchKey((key) => key + 1)}
      title="게시글 목록을 불러오지 못했어요"
    >
      <ProfilePostListPageContent fetchKey={`${revision}:${fetchKey}`} handle={handle} />
    </RouteBoundary>
  );
}

function ProfilePostListPageContent({ fetchKey, handle }: { fetchKey: string; handle: string }) {
  const data = useLazyLoadQuery<ProfilePostListPageQueryType>(
    ProfilePostListPageQuery,
    { handle },
    { fetchKey, fetchPolicy: 'store-and-network' },
  );

  return <PostList profile={data.profileByHandle} />;
}
