import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useTheme } from '@/theme/ThemeProvider';
import { radii, spacing, typography } from '@/theme/tokens';
import { PostMediaImage } from './PostMediaImage';
import type { PostMediaItem } from './PostMediaImage';

export type { PostMediaItem } from './PostMediaImage';

export function PostMediaGallery({
  media,
  sensitive,
}: {
  readonly media: ReadonlyArray<PostMediaItem> | null;
  readonly sensitive: boolean;
}) {
  const theme = useTheme();
  const [revealed, setRevealed] = useState(false);

  if (media === null) {
    return (
      <View
        accessibilityLiveRegion="polite"
        accessibilityRole="alert"
        style={[styles.unavailable, { backgroundColor: theme.surface, borderColor: theme.border }]}
        testID="post-media-unavailable"
      >
        <Text style={[styles.unavailableText, { color: theme.textSecondary }]}>
          이미지를 불러올 수 없습니다.
        </Text>
      </View>
    );
  }

  const items = media.slice(0, 4);
  if (items.length === 0) {
    return null;
  }

  if (sensitive && !revealed) {
    return (
      <View
        style={[styles.sensitive, { backgroundColor: theme.surface, borderColor: theme.border }]}
        testID="post-media-sensitive"
      >
        <Text style={[styles.sensitiveTitle, { color: theme.text }]}>민감한 이미지</Text>
        <Text style={[styles.sensitiveDescription, { color: theme.textSecondary }]}>
          작성자가 민감한 내용으로 표시했습니다.
        </Text>
        <MediaVisibilityButton expanded={false} onPress={() => setRevealed(true)} />
      </View>
    );
  }

  return (
    <View style={styles.root} testID="post-media-gallery">
      {sensitive ? <MediaVisibilityButton expanded onPress={() => setRevealed(false)} /> : null}
      {items.map((item, index) => (
        <PostMediaImage index={index} item={item} key={item.id} />
      ))}
    </View>
  );
}

function MediaVisibilityButton({
  expanded,
  onPress,
}: {
  readonly expanded: boolean;
  readonly onPress: () => void;
}) {
  const theme = useTheme();

  return (
    <Pressable
      aria-expanded={expanded}
      accessibilityLabel={expanded ? '민감한 이미지 다시 가리기' : '민감한 이미지 표시'}
      accessibilityRole="button"
      accessibilityState={{ expanded }}
      onPress={onPress}
      style={({ pressed }) => [
        styles.visibilityButton,
        { backgroundColor: pressed ? theme.primaryHover : theme.primary },
      ]}
    >
      <Text style={[styles.visibilityButtonText, { color: theme.text }]}>
        {expanded ? '다시 가리기' : '이미지 표시'}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  root: { gap: spacing.sm },
  sensitive: {
    alignItems: 'center',
    borderRadius: radii.md,
    borderWidth: 1,
    gap: spacing.xs,
    padding: spacing.lg,
  },
  sensitiveTitle: { fontFamily: 'SUIT', fontWeight: '700', ...typography.md },
  sensitiveDescription: { fontFamily: 'SUIT', textAlign: 'center', ...typography.sm },
  visibilityButton: {
    alignItems: 'center',
    borderRadius: radii.full,
    justifyContent: 'center',
    marginTop: spacing.xs,
    minHeight: 48,
    minWidth: 120,
    paddingHorizontal: spacing.lg,
  },
  visibilityButtonText: { fontFamily: 'SUIT', fontWeight: '700', ...typography.sm },
  unavailable: {
    alignItems: 'center',
    borderRadius: radii.md,
    borderWidth: 1,
    gap: spacing.sm,
    justifyContent: 'center',
    minHeight: 144,
    padding: spacing.lg,
  },
  unavailableText: { fontFamily: 'SUIT', textAlign: 'center', ...typography.sm },
});
