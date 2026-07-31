import { useCallback, useEffect, useState } from 'react';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { useTheme } from '@/theme/ThemeProvider';
import { radii, spacing, typography } from '@/theme/tokens';

export type PostMediaItem = {
  readonly altText: string | null;
  readonly id: string;
  readonly url: string | null;
};

export function PostMediaImage({
  index,
  item,
}: {
  readonly index: number;
  readonly item: PostMediaItem;
}) {
  const theme = useTheme();
  const [generation, setGeneration] = useState(0);
  const [aspectRatio, setAspectRatio] = useState(1);
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const accessibilityLabel = item.altText?.trim() || `${index + 1}번째 첨부 이미지`;
  const handleError = useCallback(() => setStatus('error'), []);
  const handleLoad = useCallback(() => setStatus('ready'), []);
  const handleLoadStart = useCallback(() => setStatus('loading'), []);

  useEffect(() => {
    if (!item.url) {
      return;
    }

    let active = true;
    Image.getSize(
      item.url,
      (width, height) => {
        if (active && height > 0 && width > 0) {
          setAspectRatio(Math.max(width / height, 1));
        }
      },
      () => undefined,
    );

    return () => {
      active = false;
    };
  }, [generation, item.url]);

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
      style={[styles.imageFrame, { aspectRatio, backgroundColor: theme.surface }]}
      testID={`post-media-frame-${item.id}`}
    >
      <Image
        accessibilityLabel={accessibilityLabel}
        accessibilityState={{ busy: status === 'loading' }}
        key={`${item.id}:${generation}`}
        onError={handleError}
        onLoad={handleLoad}
        onLoadStart={handleLoadStart}
        resizeMode="cover"
        source={{ uri: item.url }}
        style={styles.image}
        testID={`post-media-image-${item.id}`}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  imageFrame: { borderRadius: radii.md, overflow: 'hidden', width: '100%' },
  image: { height: '100%', width: '100%' },
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
