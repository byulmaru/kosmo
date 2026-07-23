import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { PostListItem } from '@/components/post/PostListItem';
import { Button } from '@/components/ui/Button';
import { Skeleton } from '@/components/ui/StateView';
import { useTheme } from '@/theme/ThemeProvider';
import { radii, spacing, typography } from '@/theme/tokens';
import type { ReactNode } from 'react';
import type { PostListItem_post$key } from '@/components/post/__generated__/PostListItem_post.graphql';

export type BookmarkListEntry = { id: string; post: PostListItem_post$key };

export type BookmarkListProps = {
  error?: boolean;
  hasNext?: boolean;
  isLoadingMore?: boolean;
  items?: ReadonlyArray<BookmarkListEntry>;
  loading?: boolean;
  onLoadMore?: () => void;
  onRetry?: () => void;
  profileRequired?: boolean;
};

export function BookmarkList({
  error = false,
  hasNext = false,
  isLoadingMore = false,
  items = [],
  loading = false,
  onLoadMore,
  onRetry,
  profileRequired = false,
}: BookmarkListProps): React.JSX.Element {
  const hasData = items.length > 0;
  let content: ReactNode;

  if (profileRequired) {
    content = (
      <BookmarkListState
        description="북마크를 보려면 사용할 프로필을 먼저 선택해주세요."
        title="프로필이 필요해요"
      />
    );
  } else if (loading && !hasData) {
    content = <BookmarkListSkeleton />;
  } else if (error && !hasData) {
    content = (
      <BookmarkListState
        alert
        description="잠시 후 다시 시도해주세요."
        onRetry={onRetry}
        title="북마크 목록을 불러오지 못했어요"
      />
    );
  } else if (!hasData) {
    content = (
      <BookmarkListState
        description="저장한 게시글이 여기에 표시돼요."
        title="아직 북마크가 없어요"
      />
    );
  } else {
    content = (
      <>
        {items.map((item) => (
          <PostListItem key={item.id} post={item.post} />
        ))}
        {error ? (
          <BookmarkListState
            alert
            description="기존 북마크는 그대로 유지돼요."
            onRetry={onRetry}
            title="북마크를 더 불러오지 못했어요"
          />
        ) : hasNext && onLoadMore ? (
          <View style={styles.pagination}>
            <Button
              aria-busy={isLoadingMore}
              accessibilityState={{ busy: isLoadingMore, disabled: isLoadingMore }}
              disabled={isLoadingMore}
              onPress={() => {
                if (!isLoadingMore) {
                  onLoadMore();
                }
              }}
              style={styles.actionButton}
              tone="secondary"
            >
              {isLoadingMore ? '불러오는 중' : '더 불러오기'}
            </Button>
          </View>
        ) : null}
      </>
    );
  }

  return (
    <ScrollView contentContainerStyle={styles.root} testID="bookmark-list-scroll">
      <BookmarkListTitle />
      {content}
    </ScrollView>
  );
}

function BookmarkListTitle() {
  const theme = useTheme();
  return (
    <View style={styles.titleBar}>
      <Text accessibilityRole="header" style={[styles.title, { color: theme.text }]}>
        북마크
      </Text>
    </View>
  );
}

function BookmarkListSkeleton() {
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
        북마크 목록을 불러오는 중입니다.
      </Text>
    </View>
  );
}

function BookmarkListState({
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
        <Button onPress={onRetry} style={styles.actionButton} tone="secondary">
          다시 시도
        </Button>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flexGrow: 1, width: '100%' },
  titleBar: { justifyContent: 'center', minHeight: 43, paddingHorizontal: spacing.lg },
  title: { fontFamily: 'SUIT', fontWeight: '700', ...typography.sm },
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
  state: { alignItems: 'center', gap: spacing.sm, padding: spacing.xxxl },
  stateTitle: { fontFamily: 'SUIT', fontWeight: '700', textAlign: 'center', ...typography.md },
  stateDescription: { fontFamily: 'SUIT', textAlign: 'center', ...typography.sm },
  actionButton: { minHeight: 44 },
  pagination: { alignItems: 'center', padding: spacing.lg },
  srOnly: { height: 1, left: 0, overflow: 'hidden', position: 'absolute', top: 0, width: 1 },
});
