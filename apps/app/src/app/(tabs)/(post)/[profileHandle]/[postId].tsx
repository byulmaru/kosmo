import { useLocalSearchParams, usePathname, useRouter, useSegments } from 'expo-router';
import { ChevronLeftIcon } from 'lucide-react-native';
import { useEffect, useState } from 'react';
import { Platform, StyleSheet, useWindowDimensions } from 'react-native';
import { graphql, useLazyLoadQuery } from 'react-relay';
import { PageHeader } from '@/components/PageHeader';
import { PostDetailFrame, PostDetailThread } from '@/components/post/PostDetailThread';
import { RouteBoundary, useRouteBoundary } from '@/components/RouteBoundary';
import { getWebMobileShellHeader } from '@/components/shell/shellLayout';
import { IconButton } from '@/components/ui/IconButton';
import { StateView } from '@/components/ui/StateView';
import { useTheme } from '@/theme/ThemeProvider';
import { spacing } from '@/theme/tokens';
import type { Href } from 'expo-router';
import type { ReactNode } from 'react';
import type { PostDetailQuery } from './__generated__/PostDetailQuery.graphql';

const PostQuery = graphql`
  query PostDetailQuery($postId: ID!) {
    currentSession {
      id
      selectedProfile {
        id
        ...ReplyComposerSurface_profile
      }
    }
    node(id: $postId) {
      __typename
      ... on Post {
        id
        state
        profile {
          id
          relativeHandle
        }
        content {
          id
        }
        replyParent {
          id
        }
        repostSource {
          id
          profile {
            relativeHandle
          }
        }
        ...PostDetailThread_post @arguments(count: 20) @alias(as: "thread")
      }
    }
  }
`;

export default function PostDetailScreen() {
  const params = useLocalSearchParams<{ postId: string; profileHandle: string }>();
  const pathname = usePathname();
  const routeSegments = useSegments();
  const { width } = useWindowDimensions();
  const postId = params.postId ?? '';
  const routeRelativeHandle = params.profileHandle ?? '';
  const header = getWebMobileShellHeader(
    Platform.OS === 'web',
    width,
    pathname,
    routeSegments,
  ) ? null : (
    <PostDetailHeader />
  );

  return (
    <RouteBoundary
      error={(retry) => (
        <PostDetailFrame header={header}>
          <StateView
            actionLabel="다시 시도"
            alert
            onAction={retry}
            title="게시글을 불러오지 못했어요"
          />
        </PostDetailFrame>
      )}
      key={`${routeRelativeHandle}:${postId}`}
      loading={
        <PostDetailFrame header={header}>
          <StateView loading title="게시글을 불러오는 중입니다." />
        </PostDetailFrame>
      }
      title="게시글을 불러오지 못했어요"
    >
      <PostDetailContent
        header={header}
        postId={postId}
        routeRelativeHandle={routeRelativeHandle}
      />
    </RouteBoundary>
  );
}

function PostDetailHeader() {
  const theme = useTheme();
  const router = useRouter();

  return (
    <PageHeader
      leading={
        <IconButton
          accessibilityLabel="뒤로 가기"
          onPress={() => router.back()}
          style={styles.back}
          targetSize={44}
          visualSize={44}
        >
          <ChevronLeftIcon color={theme.text} size={20} />
        </IconButton>
      }
      title="게시글"
    />
  );
}

function PostDetailContent({
  header,
  postId,
  routeRelativeHandle,
}: {
  header: ReactNode;
  postId: string;
  routeRelativeHandle: string;
}) {
  const router = useRouter();
  const { fetchKey, refetch } = useRouteBoundary();
  const [locallyDeleted, setLocallyDeleted] = useState(false);
  const data = useLazyLoadQuery<PostDetailQuery>(
    PostQuery,
    { postId },
    { fetchKey, fetchPolicy: 'store-and-network' },
  );
  const post = data.node?.__typename === 'Post' ? data.node : null;
  const pureRepostSource = post && !post.content && !post.replyParent ? post.repostSource : null;
  const pureRepostSourceHref: Href | null = pureRepostSource
    ? `/${pureRepostSource.profile.relativeHandle}/${pureRepostSource.id}`
    : null;

  useEffect(() => {
    setLocallyDeleted(false);
  }, [fetchKey]);

  useEffect(() => {
    if (pureRepostSourceHref) {
      router.replace(pureRepostSourceHref);
    } else if (post && post.profile.relativeHandle !== routeRelativeHandle) {
      router.replace(`/${post.profile.relativeHandle}/${postId}`);
    }
  }, [post, postId, pureRepostSourceHref, routeRelativeHandle, router]);

  return pureRepostSourceHref ? null : locallyDeleted ? (
    <PostDetailFrame header={header}>
      <StateView description="작성자가 이 게시글을 삭제했어요." title="삭제된 게시글이에요" />
    </PostDetailFrame>
  ) : !post ? (
    <PostDetailFrame header={header}>
      <StateView
        description="이미 삭제되었거나 존재하지 않는 게시글이에요."
        title="게시글을 찾을 수 없어요"
      />
    </PostDetailFrame>
  ) : post.state === 'DELETED' ? (
    <PostDetailFrame header={header}>
      <StateView description="작성자가 이 게시글을 삭제했어요." title="삭제된 게시글이에요" />
    </PostDetailFrame>
  ) : !post.thread ? (
    <PostDetailFrame header={header}>
      <StateView
        description="게시글 데이터를 다시 불러와 주세요."
        title="게시글을 표시할 수 없어요"
      />
    </PostDetailFrame>
  ) : (
    <PostDetailThread
      header={header}
      identity={postId}
      onPostDeleted={() => setLocallyDeleted(true)}
      onReplyCreated={refetch}
      post={post.thread}
      replyProfile={data.currentSession?.selectedProfile ?? null}
    />
  );
}

const styles = StyleSheet.create({
  back: {
    alignItems: 'center',
    height: 44,
    justifyContent: 'center',
    marginLeft: -spacing.sm,
    width: 44,
  },
});
