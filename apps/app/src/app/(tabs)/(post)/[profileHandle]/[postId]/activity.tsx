import { Redirect, useLocalSearchParams, useRouter } from 'expo-router';
import { ChevronLeftIcon } from 'lucide-react-native';
import { useCallback } from 'react';
import { Platform, StyleSheet, View } from 'react-native';
import { graphql, useLazyLoadQuery } from 'react-relay';
import { PageHeader } from '@/components/PageHeader';
import { PaginationScrollView } from '@/components/pagination/PaginationScrollView';
import { PostRepostProfileList } from '@/components/post/PostRepostProfileList';
import { normalizeProfileHandle } from '@/components/profile/route';
import { RouteBoundary, useRouteBoundary } from '@/components/RouteBoundary';
import { IconButton } from '@/components/ui/IconButton';
import { StateView } from '@/components/ui/StateView';
import { useTheme } from '@/theme/ThemeProvider';
import { spacing } from '@/theme/tokens';
import type { ReactNode } from 'react';
import type { PostActivityRouteQuery } from './__generated__/PostActivityRouteQuery.graphql';

const postActivityRouteQuery = graphql`
  query PostActivityRouteQuery($postId: ID!) {
    node(id: $postId) {
      __typename
      ... on Post {
        id
        state
        content {
          id
        }
        profile {
          id
          relativeHandle
        }
        ...PostRepostProfileList_post @alias(as: "repostProfileList")
      }
    }
  }
`;

export default function PostActivityRoute() {
  const params = useLocalSearchParams<{
    postId?: string | string[];
    profileHandle?: string | string[];
  }>();
  const router = useRouter();
  const postId = firstParam(params.postId);
  const rawProfileHandle = firstParam(params.profileHandle);
  const handle = normalizeProfileHandle(rawProfileHandle);
  const routeRelativeHandle = rawProfileHandle.startsWith('@')
    ? rawProfileHandle
    : `@${rawProfileHandle}`;
  const validParams =
    typeof params.postId === 'string' &&
    typeof params.profileHandle === 'string' &&
    Boolean(postId && handle);
  const fallbackPostHref = validParams ? `/${routeRelativeHandle}/${postId}` : null;
  const onBack = useCallback(() => {
    if (router.canGoBack()) {
      router.back();
    } else if (fallbackPostHref) {
      router.replace(fallbackPostHref);
    }
  }, [fallbackPostHref, router]);

  return (
    <PostActivityRouteFrame onBack={onBack} scrollKey={postId}>
      {validParams ? (
        <RouteBoundary
          error={(retry) => <PostActivityRouteState onRetry={retry} state="error" />}
          key={`${handle}:${postId}`}
          loading={<PostActivityRouteState state="loading" />}
          title="게시 활동을 불러오지 못했어요"
        >
          <PostActivityRouteContent postId={postId} routeRelativeHandle={routeRelativeHandle} />
        </RouteBoundary>
      ) : (
        <PostActivityRouteState state="missing" />
      )}
    </PostActivityRouteFrame>
  );
}

function PostActivityRouteContent({
  postId,
  routeRelativeHandle,
}: {
  postId: string;
  routeRelativeHandle: string;
}) {
  const { fetchKey, fetchPolicy } = useRouteBoundary();
  const data = useLazyLoadQuery<PostActivityRouteQuery>(
    postActivityRouteQuery,
    { postId },
    { fetchKey, fetchPolicy },
  );
  const post = data.node?.__typename === 'Post' ? data.node : null;

  if (!post) {
    return <PostActivityRouteState state="missing" />;
  }
  if (post.profile.relativeHandle !== routeRelativeHandle) {
    return <Redirect href={`/${post.profile.relativeHandle}/${post.id}/activity`} />;
  }
  if (post.state !== 'ACTIVE' || !post.content || !post.repostProfileList) {
    return <PostActivityRouteState state="missing" />;
  }

  return <PostRepostProfileList post={post.repostProfileList} />;
}

function PostActivityHeader({ onBack }: { onBack: () => void }) {
  const theme = useTheme();

  return (
    <View style={styles.header}>
      <PageHeader
        leading={
          <IconButton
            accessibilityLabel="뒤로 가기"
            onPress={onBack}
            style={styles.back}
            targetSize={44}
            visualSize={44}
          >
            <ChevronLeftIcon color={theme.foregroundPrimary} size={20} />
          </IconButton>
        }
        title="게시 활동"
      />
    </View>
  );
}

function PostActivityRouteFrame({
  children,
  onBack,
  scrollKey,
}: {
  children?: ReactNode;
  onBack: () => void;
  scrollKey: string;
}) {
  const content = (
    <>
      <PostActivityHeader onBack={onBack} />
      {children}
    </>
  );

  return Platform.OS === 'web' ? (
    <View style={styles.webRoot}>{content}</View>
  ) : (
    <PaginationScrollView key={scrollKey} nativeScrollProps={{ style: styles.nativeRoot }}>
      {content}
    </PaginationScrollView>
  );
}

function PostActivityRouteState({
  onRetry,
  state,
}: {
  onRetry?: () => void;
  state: 'error' | 'loading' | 'missing';
}) {
  return state === 'loading' ? (
    <StateView loading title="게시 활동을 불러오는 중입니다." />
  ) : state === 'error' ? (
    <StateView
      actionLabel="다시 시도"
      alert
      description="잠시 후 다시 시도해주세요."
      onAction={onRetry}
      title="게시 활동을 불러오지 못했어요"
    />
  ) : (
    <StateView
      description="이미 삭제되었거나 존재하지 않는 게시글이에요."
      title="게시 활동을 볼 수 없어요"
    />
  );
}

function firstParam(value?: string | string[]) {
  return (Array.isArray(value) ? value[0] : value) ?? '';
}

const styles = StyleSheet.create({
  back: {
    alignItems: 'center',
    height: 44,
    justifyContent: 'center',
    marginLeft: -spacing.sm,
    width: 44,
  },
  header: { width: '100%' },
  nativeRoot: { flex: 1 },
  webRoot: { width: '100%' },
});
