import { useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { graphql, useLazyLoadQuery } from 'react-relay';
import { PostList } from '@/components/post/PostList';
import { normalizeProfileHandle } from '@/components/profile/route';
import { RouteBoundary } from '@/components/RouteBoundary';
import { useRelayActor } from '@/relay/RelayActorProvider';
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
      <ProfilePostListPageContent
        fetchKey={`${revision}:${fetchKey}`}
        handle={handle}
        key={`${revision}:${handle}`}
      />
    </RouteBoundary>
  );
}

function ProfilePostListPageContent({ fetchKey, handle }: { fetchKey: string; handle: string }) {
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
