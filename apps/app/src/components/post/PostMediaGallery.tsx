import { useState } from 'react';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { useTheme } from '@/theme/ThemeProvider';
import { radii, spacing, typography } from '@/theme/tokens';

export type PostMediaItem = {
  readonly altText: string | null;
  readonly id: string;
  readonly url: string | null;
};

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
        style={[styles.fallback, { backgroundColor: theme.surface, borderColor: theme.border }]}
        testID="post-media-unavailable"
      >
        <Text style={[styles.fallbackText, { color: theme.textSecondary }]}>
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

function PostMediaImage({ index, item }: { readonly index: number; readonly item: PostMediaItem }) {
  const theme = useTheme();
  const [generation, setGeneration] = useState(0);
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const accessibilityLabel = item.altText?.trim() || `${index + 1}번째 첨부 이미지`;

  if (!item.url || status === 'error') {
    return (
      <View
        accessibilityLiveRegion="polite"
        style={[styles.fallback, { backgroundColor: theme.surface, borderColor: theme.border }]}
        testID={`post-media-error-${item.id}`}
      >
        <Text style={[styles.fallbackText, { color: theme.textSecondary }]}>
          {accessibilityLabel}을 불러오지 못했습니다.
        </Text>
        {item.url ? (
          <Pressable
            accessibilityLabel={`${accessibilityLabel} 다시 시도`}
            accessibilityRole="button"
            onPress={() => {
              setGeneration((value) => value + 1);
              setStatus('loading');
            }}
            style={({ pressed }) => [
              styles.retryButton,
              { borderColor: theme.border, opacity: pressed ? 0.7 : 1 },
            ]}
          >
            <Text style={[styles.retryButtonText, { color: theme.text }]}>다시 시도</Text>
          </Pressable>
        ) : null}
      </View>
    );
  }

  return (
    <View
      style={[styles.imageFrame, { backgroundColor: theme.surface }]}
      testID={`post-media-frame-${item.id}`}
    >
      <Image
        accessibilityLabel={accessibilityLabel}
        accessibilityState={{ busy: status === 'loading' }}
        key={`${item.id}:${generation}`}
        onError={() => setStatus('error')}
        onLoad={() => setStatus('ready')}
        onLoadStart={() => setStatus('loading')}
        resizeMode="cover"
        source={{ uri: item.url }}
        style={styles.image}
        testID={`post-media-image-${item.id}`}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { gap: spacing.sm },
  imageFrame: { aspectRatio: 16 / 9, borderRadius: radii.md, overflow: 'hidden' },
  image: { height: '100%', width: '100%' },
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
  fallback: {
    alignItems: 'center',
    borderRadius: radii.md,
    borderWidth: 1,
    gap: spacing.sm,
    justifyContent: 'center',
    minHeight: 144,
    padding: spacing.lg,
  },
  fallbackText: { fontFamily: 'SUIT', textAlign: 'center', ...typography.sm },
  retryButton: {
    alignItems: 'center',
    borderRadius: radii.full,
    borderWidth: 1,
    justifyContent: 'center',
    minHeight: 48,
    minWidth: 112,
    paddingHorizontal: spacing.lg,
  },
  retryButtonText: { fontFamily: 'SUIT', fontWeight: '700', ...typography.sm },
});
