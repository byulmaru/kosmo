import { useLocalSearchParams, useRouter } from 'expo-router';
import { ArrowLeftIcon } from 'lucide-react-native';
import { StyleSheet } from 'react-native';
import { graphql, useLazyLoadQuery } from 'react-relay';
import { PageHeader } from '@/components/PageHeader';
import { PostList } from '@/components/post/PostList';
import { RouteBoundary, useRouteBoundary } from '@/components/RouteBoundary';
import { IconButton } from '@/components/ui/IconButton';
import { StateView } from '@/components/ui/StateView';
import { useTheme } from '@/theme/ThemeProvider';
import { spacing } from '@/theme/tokens';
import type { ReactNode } from 'react';
import type { HashtagPostsPageQuery } from './__generated__/HashtagPostsPageQuery.graphql';

const HashtagPostsPageQuery = graphql`
  query HashtagPostsPageQuery($id: ID!) {
    currentSession {
      id
      selectedProfile {
        id
        ...ReplyComposerSurface_profile
      }
    }
    node(id: $id) {
      __typename
      ... on Hashtag {
        id
        name
        ...PostList_hashtag @arguments(count: 20) @alias(as: "postList")
      }
    }
  }
`;

export default function HashtagPostsScreen() {
  const { hashtagId: rawHashtagId } = useLocalSearchParams<{
    hashtagId?: string | string[];
  }>();
  const hashtagId = typeof rawHashtagId === 'string' && rawHashtagId ? rawHashtagId : null;
  const router = useRouter();
  const theme = useTheme();
  const backButton = (
    <IconButton
      accessibilityLabel="뒤로 가기"
      onPress={() => (router.canGoBack() ? router.back() : router.replace('/home'))}
      style={styles.back}
      targetSize={44}
      visualSize={44}
    >
      <ArrowLeftIcon color={theme.foregroundPrimary} size={20} />
    </IconButton>
  );

  return hashtagId ? (
    <HashtagPostsRoute backButton={backButton} hashtagId={hashtagId} key={hashtagId} />
  ) : (
    <HashtagPostsState backButton={backButton} state="notFound" />
  );
}

function HashtagPostsRoute({
  backButton,
  hashtagId,
}: {
  backButton: ReactNode;
  hashtagId: string;
}) {
  return (
    <RouteBoundary
      error={(retry) => <HashtagPostsState backButton={backButton} onRetry={retry} state="error" />}
      loading={<HashtagPostsState backButton={backButton} state="loading" />}
      title="게시글 목록을 불러오지 못했어요"
    >
      <HashtagPostsContent backButton={backButton} hashtagId={hashtagId} />
    </RouteBoundary>
  );
}

function HashtagPostsContent({
  backButton,
  hashtagId,
}: {
  backButton: ReactNode;
  hashtagId: string;
}) {
  const { fetchKey } = useRouteBoundary();
  const data = useLazyLoadQuery<HashtagPostsPageQuery>(
    HashtagPostsPageQuery,
    { id: hashtagId },
    { fetchKey, fetchPolicy: 'store-and-network' },
  );
  const hashtag = data.node?.__typename === 'Hashtag' && data.node.postList ? data.node : null;
  const selectedProfile = data.currentSession?.selectedProfile ?? null;
  if (!hashtag) {
    return <HashtagPostsState backButton={backButton} state="notFound" />;
  }

  const identityKey = `hashtag:${hashtag.id}:${selectedProfile?.id ?? 'guest'}`;
  return (
    <>
      <PageHeader leading={backButton} title={`#${hashtag.name}`} titleLines={1} />
      <PostList
        hashtag={hashtag.postList}
        identityKey={identityKey}
        replyProfile={selectedProfile}
      />
    </>
  );
}

function HashtagPostsState({
  backButton,
  onRetry,
  state,
}: {
  backButton: ReactNode;
  onRetry?: () => void;
  state: 'error' | 'loading' | 'notFound';
}) {
  return (
    <>
      <PageHeader leading={backButton} title="게시글" />
      {state === 'loading' ? (
        <PostList loading />
      ) : state === 'error' ? (
        <PostList error onRetry={onRetry} />
      ) : (
        <StateView title="해시태그를 찾을 수 없어요" />
      )}
    </>
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
