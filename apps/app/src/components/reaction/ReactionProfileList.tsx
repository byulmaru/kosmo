import { useEffect, useState } from 'react';
import { AccessibilityInfo, Platform, StyleSheet, Text, View } from 'react-native';
import { PaginationSurface } from '@/components/pagination/PaginationSurface';
import { ProfileListItem } from '@/components/profile/ProfileListItem';
import { StateView } from '@/components/ui/StateView';
import { useTheme } from '@/theme/ThemeProvider';
import { fontFamilies, spacing, typography } from '@/theme/tokens';
import { getReactionEmojiLabel, ReactionEmojiImage } from './ReactionEmojiImage';
import type React from 'react';
import type { UseAutomaticPaginationResult } from '@/components/pagination/useAutomaticPagination';

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
  paginationEndRef?: UseAutomaticPaginationResult['endRef'];
  presentation?: 'modal' | 'route';
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
  paginationEndRef,
  presentation = 'modal',
  reactionType,
}: ReactionProfileListProps): React.ReactElement {
  const theme = useTheme();
  const [announcement, setAnnouncement] = useState('');
  const status =
    presentation === 'route' && items !== undefined
      ? `${reactionType} 반응을 남긴 프로필 ${items.length}명을 표시합니다.`
      : presentation === 'route' && loading
        ? `${reactionType} ${copy.loadingTitle}`
        : '';
  // Update text after the live region mounts, including when a new Type resolves from cache.
  useEffect(() => {
    setAnnouncement(status);
    if (Platform.OS === 'ios' && status) {
      AccessibilityInfo.announceForAccessibilityWithOptions(status, { queue: true });
    }
  }, [status]);

  return (
    <View style={styles.root}>
      {presentation === 'route' ? (
        <Text
          accessibilityLiveRegion="polite"
          role={Platform.OS === 'web' ? 'status' : undefined}
          style={styles.srOnly}
        >
          {announcement}
        </Text>
      ) : (
        <Text accessibilityRole="header" style={[styles.title, { color: theme.text }]}>
          반응한 사람
        </Text>
      )}
      {items !== undefined ? (
        items.length ? (
          <>
            {items.map((item, index) => (
              <View
                key={item.id}
                style={[
                  styles.item,
                  index < items.length - 1 ? styles.itemSeparator : null,
                  { borderColor: theme.border },
                ]}
              >
                <View
                  accessible
                  accessibilityLabel={`${getReactionEmojiLabel(reactionType)} 반응`}
                  accessibilityRole="image"
                  style={styles.itemReaction}
                >
                  <ReactionEmojiImage size={20} type={reactionType} />
                </View>
                <ProfileListItem
                  linked
                  profile={item.profile}
                  showBio={presentation !== 'route'}
                  style={styles.profileItem}
                />
              </View>
            ))}
            <PaginationSurface
              endRef={paginationEndRef}
              error={Boolean(loadMoreError)}
              errorMessage={copy.loadErrorTitle}
              hasNext={Boolean(hasNext)}
              isLoading={Boolean(isLoadingMore)}
              loadingLabel="반응한 프로필을 더 불러오는 중"
              onRetry={onLoadMore}
              style={[styles.pagination, { borderColor: theme.border }]}
            />
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
  title: { fontFamily: fontFamilies.ui, fontWeight: '700', ...typography.lg },
  srOnly: { height: 1, left: 0, overflow: 'hidden', position: 'absolute', top: 0, width: 1 },
  item: { alignItems: 'center', flexDirection: 'row' },
  itemReaction: {
    alignItems: 'center',
    height: 24,
    justifyContent: 'center',
    marginLeft: spacing.lg,
    width: 20,
  },
  itemSeparator: { borderBottomWidth: 1 },
  profileItem: { borderBottomWidth: 0, flex: 1, minWidth: 0 },
  pagination: { borderTopWidth: 1, gap: spacing.sm, paddingTop: spacing.md },
});
