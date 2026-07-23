import { StyleSheet, Text, View } from 'react-native';
import { ProfileListItem } from '@/components/profile/ProfileListItem';
import { Button } from '@/components/ui/Button';
import { StateView } from '@/components/ui/StateView';
import { useTheme } from '@/theme/ThemeProvider';
import { spacing, typography } from '@/theme/tokens';
import type React from 'react';

export type ReactionProfileListEntry = Readonly<{
  id: string;
  profile: Parameters<typeof ProfileListItem>[0]['profile'];
}>;

export type ReactionProfileListProps = {
  error?: boolean;
  hasNext?: boolean;
  isLoadingMore?: boolean;
  items?: ReadonlyArray<ReactionProfileListEntry>;
  loadMoreError?: boolean;
  loading?: boolean;
  onLoadMore?: () => void;
  onRetry?: () => void;
  reactionType: string;
};

const copy = {
  emptyDescription: '이 반응을 남긴 프로필이 생기면 여기에 표시돼요.',
  emptyTitle: '아직 이 반응을 남긴 프로필이 없어요',
  errorDescription: '잠시 후 다시 시도해주세요.',
  errorTitle: '반응한 프로필을 불러오지 못했어요',
  loadErrorTitle: '반응한 프로필을 더 불러오지 못했어요',
  loadingTitle: '반응한 프로필을 불러오는 중입니다.',
} as const;

export function ReactionProfileList({
  error,
  hasNext,
  isLoadingMore,
  items,
  loadMoreError,
  loading,
  onLoadMore,
  onRetry,
  reactionType,
}: ReactionProfileListProps): React.ReactElement {
  const theme = useTheme();
  const showPagination = Boolean(onLoadMore && (hasNext || loadMoreError));
  const loadMore = () => {
    if (isLoadingMore) {
      return;
    }

    onLoadMore?.();
  };

  return (
    <View style={styles.root}>
      <Text accessibilityRole="header" style={[styles.title, { color: theme.text }]}>
        {`${reactionType} 반응`}
      </Text>
      {items !== undefined ? (
        items.length ? (
          <>
            {items.map((item) => (
              <ProfileListItem key={item.id} linked profile={item.profile} />
            ))}
            {showPagination ? (
              <View style={[styles.pagination, { borderColor: theme.border }]}>
                {loadMoreError ? (
                  <>
                    <Text
                      accessibilityRole="alert"
                      style={[styles.stateTitle, { color: theme.text }]}
                    >
                      {copy.loadErrorTitle}
                    </Text>
                    <Text style={[styles.stateDescription, { color: theme.textSecondary }]}>
                      {copy.errorDescription}
                    </Text>
                  </>
                ) : null}
                <Button
                  accessibilityState={{ busy: isLoadingMore, disabled: isLoadingMore }}
                  aria-busy={isLoadingMore}
                  disabled={isLoadingMore}
                  onPress={loadMore}
                  style={styles.paginationAction}
                  tone="secondary"
                >
                  {isLoadingMore ? '불러오는 중' : loadMoreError ? '다시 시도' : '더 불러오기'}
                </Button>
              </View>
            ) : null}
          </>
        ) : (
          <StateView description={copy.emptyDescription} title={copy.emptyTitle} />
        )
      ) : error ? (
        <StateView
          actionLabel="다시 시도"
          alert
          description={copy.errorDescription}
          onAction={onRetry}
          title={copy.errorTitle}
        />
      ) : loading ? (
        <StateView loading title={copy.loadingTitle} />
      ) : (
        <StateView description={copy.emptyDescription} title={copy.emptyTitle} />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { gap: spacing.md },
  title: { fontFamily: 'SUIT', fontWeight: '700', ...typography.lg },
  pagination: { borderTopWidth: 1, gap: spacing.sm, paddingTop: spacing.md },
  paginationAction: { minHeight: 44 },
  stateTitle: { fontFamily: 'SUIT', fontWeight: '700', textAlign: 'center', ...typography.md },
  stateDescription: { fontFamily: 'SUIT', textAlign: 'center', ...typography.sm },
});
