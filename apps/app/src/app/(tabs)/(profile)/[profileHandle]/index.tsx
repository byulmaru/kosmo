import { useFocusEffect, useLocalSearchParams } from 'expo-router';
import { startTransition, useCallback, useLayoutEffect, useRef, useState } from 'react';
import { graphql, usePreloadedQuery, useQueryLoader } from 'react-relay';
import { PostList } from '@/components/post/PostList';
import ProfileLayout from '@/components/profile/ProfileLayout';
import { ProfileRouteContainer, useProfileRoute } from '@/components/profile/ProfileRouteShell';
import { normalizeProfileHandle } from '@/components/profile/route';
import { RouteBoundary } from '@/components/RouteBoundary';
import { StateView } from '@/components/ui/StateView';
import type { PreloadedQuery } from 'react-relay';
import type { ProfilePostListPageQuery as ProfilePostListPageQueryType } from './__generated__/ProfilePostListPageQuery.graphql';

export const ProfilePostListPageQuery = graphql`
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
      viewerState {
        profileBlock {
          id
        }
      }
      ...PostList_profile @arguments(count: 20)
      ...PostList_profile_pinned
    }
  }
`;

export default function ProfilePostListPage() {
  const { profileHandle } = useLocalSearchParams<{
    profileHandle?: string | string[];
  }>();
  const handle = normalizeProfileHandle(profileHandle);
  const scrollKey = `/@${handle}`;

  return <ProfilePostsQueryOwner handle={handle} key={handle} scrollKey={scrollKey} />;
}

function ProfilePostsQueryOwner({ handle, scrollKey }: { handle: string; scrollKey: string }) {
  const [queryReference, loadPosts, disposePosts] =
    useQueryLoader<ProfilePostListPageQueryType>(ProfilePostListPageQuery);
  const committedQueryReference = useRef(queryReference);
  useLayoutEffect(() => {
    committedQueryReference.current = queryReference;
  }, [queryReference]);
  const retryPosts = useCallback(
    () => loadPosts({ handle }, { fetchPolicy: 'network-only' }),
    [handle, loadPosts],
  );

  useFocusEffect(
    useCallback(() => {
      const load = () => loadPosts({ handle }, { fetchPolicy: 'store-and-network' });
      if (committedQueryReference.current) {
        load();
      } else {
        startTransition(load);
      }
      return disposePosts;
    }, [disposePosts, handle, loadPosts]),
  );

  return (
    <ProfileLayout connectionKind={null} handle={handle} scrollKey={scrollKey}>
      <ProfilePostListPageContent
        handle={handle}
        queryReference={queryReference ?? null}
        retryPosts={retryPosts}
      />
    </ProfileLayout>
  );
}

function ProfilePostListPageContent({
  handle,
  queryReference,
  retryPosts,
}: {
  handle: string;
  queryReference: PreloadedQuery<ProfilePostListPageQueryType> | null;
  retryPosts: () => void;
}) {
  const { chrome, scrollKey } = useProfileRoute();

  return (
    <ProfileRouteContainer reselectDestination="profile" scrollKey={scrollKey}>
      {chrome}
      <RouteBoundary
        error={(retry) => (
          <PostList
            error
            onRetry={() => {
              retryPosts();
              retry();
            }}
          />
        )}
        key={handle}
        loading={<PostList loading />}
        resetKeys={[queryReference?.fetchKey ?? 'empty']}
        title="게시글 목록을 불러오지 못했어요"
      >
        <ProfilePostListPageData
          handle={handle}
          key={queryReference?.fetchKey ?? 'empty'}
          queryReference={queryReference}
        />
      </RouteBoundary>
    </ProfileRouteContainer>
  );
}

function ProfilePostListPageData({
  handle,
  queryReference,
}: {
  handle: string;
  queryReference: PreloadedQuery<ProfilePostListPageQueryType> | null;
}) {
  if (!queryReference) {
    return <PostList loading />;
  }

  return <ProfilePostListPageDataContent handle={handle} queryReference={queryReference} />;
}

function ProfilePostListPageDataContent({
  handle,
  queryReference,
}: {
  handle: string;
  queryReference: PreloadedQuery<ProfilePostListPageQueryType>;
}) {
  const [acknowledgedProfileBlockId, setAcknowledgedProfileBlockId] = useState<string | null>(null);
  const data = usePreloadedQuery<ProfilePostListPageQueryType>(
    ProfilePostListPageQuery,
    queryReference,
  );
  const profileBlockId = data.profileByHandle?.viewerState?.profileBlock?.id ?? null;

  if (profileBlockId && profileBlockId !== acknowledgedProfileBlockId) {
    return (
      <StateView
        actionLabel="게시물 보기"
        onAction={() => setAcknowledgedProfileBlockId(profileBlockId)}
        title="차단한 프로필의 게시물입니다"
      />
    );
  }

  return (
    <PostList
      ignoreBlock={profileBlockId != null && acknowledgedProfileBlockId === profileBlockId}
      identityKey={`profile:${data.profileByHandle?.id ?? handle}`}
      profile={data.profileByHandle}
      replyProfile={data.currentSession?.selectedProfile ?? null}
    />
  );
}
