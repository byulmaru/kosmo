import { StyleSheet, Text, View } from 'react-native';
import { graphql, useFragment } from 'react-relay';
import { Button } from '@/components/ui/Button';
import { Skeleton } from '@/components/ui/StateView';
import { useTheme } from '@/theme/ThemeProvider';
import { radii, spacing, typography } from '@/theme/tokens';
import { PostListItem } from './PostListItem';
import type { PostList_homeTimeline$key } from './__generated__/PostList_homeTimeline.graphql';
import type { PostList_profile$key } from './__generated__/PostList_profile.graphql';

const PostListProfileFragment = graphql`
  fragment PostList_profile on Profile {
    id
    posts(first: 20) {
      edges {
        cursor
        node {
          id
          ...PostListItem_post
        }
      }
    }
  }
`;

const PostListHomeTimelineFragment = graphql`
  fragment PostList_homeTimeline on PostConnection {
    edges {
      cursor
      node {
        id
        ...PostListItem_post
      }
    }
  }
`;

type Props = {
  error?: boolean;
  homeTimeline?: PostList_homeTimeline$key | null;
  loading?: boolean;
  onRetry?: () => void;
  profile?: PostList_profile$key | null;
};

export function PostList({
  error = false,
  homeTimeline: timelineKey,
  loading = false,
  onRetry,
  profile: profileKey,
}: Props) {
  const profile = useFragment(PostListProfileFragment, profileKey ?? null);
  const timeline = useFragment(PostListHomeTimelineFragment, timelineKey ?? null);
  const edges = timeline?.edges ?? profile?.posts.edges ?? [];
  const hasData = Boolean(timeline || profile);

  if (loading && !hasData) {
    return <PostListSkeleton />;
  }

  if (error && !hasData) {
    return (
      <PostListState
        alert
        description="잠시 후 다시 시도해주세요."
        onRetry={onRetry}
        title="게시글 목록을 불러오지 못했어요"
      />
    );
  }

  if (edges.length === 0) {
    return (
      <PostListState
        description="첫 게시글이 올라오면 여기에 표시돼요."
        title="아직 게시글이 없어요"
      />
    );
  }

  return (
    <View style={styles.root}>
      {edges.map((edge) => (
        <PostListItem key={edge.cursor} post={edge.node} />
      ))}
    </View>
  );
}

function PostListSkeleton() {
  const theme = useTheme();

  return (
    <View>
      <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
        {[0, 1, 2].map((item) => (
          <View key={item} style={[styles.skeletonItem, { borderColor: theme.border }]}>
            <View
              style={[
                styles.avatarSkeleton,
                { backgroundColor: theme.surface, borderColor: theme.border },
              ]}
            />
            <View style={styles.skeletonCopy}>
              <View style={styles.skeletonHeader}>
                <Skeleton height={12} width={160} />
                <Skeleton height={12} width={80} />
              </View>
              <View style={styles.skeletonBody}>
                <Skeleton height={12} />
                <Skeleton height={12} />
                <Skeleton height={12} width="70%" />
              </View>
            </View>
          </View>
        ))}
      </View>
      <Text accessibilityLiveRegion="polite" style={styles.srOnly}>
        게시글 목록을 불러오는 중입니다.
      </Text>
    </View>
  );
}

function PostListState({
  alert = false,
  description,
  onRetry,
  title,
}: {
  alert?: boolean;
  description: string;
  onRetry?: () => void;
  title: string;
}) {
  const theme = useTheme();

  return (
    <View accessibilityRole={alert ? 'alert' : undefined} style={styles.state}>
      <Text style={[styles.stateTitle, { color: theme.text }]}>{title}</Text>
      <Text style={[styles.stateDescription, { color: theme.textSecondary }]}>{description}</Text>
      {onRetry ? (
        <Button onPress={onRetry} style={styles.retry} tone="secondary">
          다시 시도
        </Button>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { width: '100%' },
  skeletonItem: {
    alignItems: 'flex-start',
    borderBottomWidth: 1,
    flexDirection: 'row',
    gap: spacing.md,
    paddingBottom: spacing.lg,
    paddingHorizontal: spacing.sm,
    paddingTop: spacing.sm,
  },
  avatarSkeleton: { borderRadius: radii.full, borderWidth: 1, height: 48, width: 48 },
  skeletonCopy: { flex: 1, minWidth: 0 },
  skeletonHeader: { gap: spacing.sm },
  skeletonBody: { gap: 10, marginTop: spacing.md },
  state: { alignItems: 'center', paddingHorizontal: spacing.lg, paddingVertical: spacing.xxxl },
  stateTitle: { fontFamily: 'SUIT', fontWeight: '700', textAlign: 'center', ...typography.md },
  stateDescription: {
    fontFamily: 'SUIT',
    marginTop: spacing.xs,
    textAlign: 'center',
    ...typography.sm,
  },
  retry: { marginTop: spacing.lg },
  srOnly: {
    height: 1,
    left: 0,
    overflow: 'hidden',
    position: 'absolute',
    top: 0,
    width: 1,
  },
});
