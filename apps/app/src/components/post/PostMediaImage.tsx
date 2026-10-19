import { useCallback, useEffect, useRef, useState } from 'react';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { Skeleton } from '@/components/ui/StateView';
import { useTheme } from '@/theme/ThemeProvider';
import { fontFamilies, radii, spacing, typography } from '@/theme/tokens';
import type { RefObject } from 'react';
import type { GestureResponderEvent, ImageLoadEvent, View as NativeView } from 'react-native';

export type PostMediaItem = {
  readonly altText: string | null;
  readonly id: string;
  readonly url: string | null;
};

export type PostMediaOpenHandler = (
  index: number,
  originControl: RefObject<NativeView | null>,
) => void;

export function PostMediaImage({
  fill = false,
  index,
  interactive = true,
  item,
  onOpen,
}: {
  readonly fill?: boolean;
  readonly index: number;
  readonly interactive?: boolean;
  readonly item: PostMediaItem;
  readonly onOpen?: PostMediaOpenHandler;
}) {
  const triggerRef = useRef<NativeView>(null);
  const [generation, setGeneration] = useState(0);

  return (
    <PostMediaImageAttempt
      key={`${item.id}:${item.url ?? ''}:${generation}`}
      fill={fill}
      index={index}
      interactive={interactive}
      item={item}
      onOpen={onOpen}
      onRetry={() => setGeneration((value) => value + 1)}
      triggerRef={triggerRef}
    />
  );
}

function PostMediaImageAttempt({
  fill,
  index,
  interactive,
  item,
  onOpen,
  onRetry,
  triggerRef,
}: {
  readonly fill: boolean;
  readonly index: number;
  readonly interactive: boolean;
  readonly item: PostMediaItem;
  readonly onOpen?: PostMediaOpenHandler;
  readonly onRetry: () => void;
  readonly triggerRef: RefObject<NativeView | null>;
}) {
  const theme = useTheme();
  const [aspectRatio, setAspectRatio] = useState<number | null>(null);
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const accessibilityLabel = item.altText?.trim() || `${index + 1}번째 첨부 이미지`;
  const canRetry = Boolean(item.url) && Boolean(interactive);
  const updateAspectRatio = useCallback((width: number, height: number) => {
    if (height > 0 && width > 0) {
      setAspectRatio(Math.max(width / height, 1));
    }
  }, []);
  const handleLoad = (event?: ImageLoadEvent) => {
    setStatus('ready');
    if (fill || !item.url || aspectRatio !== null) {
      return;
    }

    const source = event?.nativeEvent?.source;
    if (source) {
      updateAspectRatio(source.width, source.height);
      return;
    }

    Image.getSize(item.url, updateAspectRatio, () => undefined);
  };

  useEffect(() => {
    if (fill || !item.url) {
      return;
    }

    Image.getSize(item.url, updateAspectRatio, () => undefined);
  }, [fill, item.url, updateAspectRatio]);

  if (!item.url || status === 'error') {
    return (
      <View
        accessibilityLiveRegion="polite"
        style={[
          styles.fallback,
          fill ? styles.fillFallback : null,
          { backgroundColor: theme.surface, borderColor: theme.border },
        ]}
        testID={`post-media-error-${item.id}`}
      >
        {canRetry ? null : (
          <Text style={[styles.fallbackText, { color: theme.textSecondary }]}>
            {accessibilityLabel}을 불러오지 못했습니다.
          </Text>
        )}
        {canRetry ? (
          <Pressable
            accessibilityLabel={`${accessibilityLabel} 다시 시도`}
            accessibilityRole="button"
            onPress={onRetry}
            style={({ pressed }) => [
              styles.retryButton,
              fill ? styles.fillRetryButton : null,
              { borderColor: theme.border, opacity: pressed ? 0.7 : 1 },
            ]}
          >
            <Text style={[styles.retryButtonText, { color: theme.text }]}>다시 시도</Text>
          </Pressable>
        ) : null}
      </View>
    );
  }

  const imageFrame = (
    <View
      style={[
        styles.imageFrame,
        fill ? styles.fillFrame : { aspectRatio: aspectRatio ?? 1 },
        { backgroundColor: theme.surface },
      ]}
      testID={`post-media-frame-${item.id}`}
    >
      <Image
        accessible={!onOpen || !interactive}
        accessibilityLabel={accessibilityLabel}
        accessibilityState={{ busy: status === 'loading' }}
        onError={() => setStatus('error')}
        onLoad={handleLoad}
        resizeMode="cover"
        source={{ uri: item.url }}
        style={styles.image}
        testID={`post-media-image-${item.id}`}
      />
      {status === 'loading' ? (
        <Skeleton
          borderRadius={radii.md}
          height="100%"
          style={StyleSheet.absoluteFill}
          width="100%"
        />
      ) : null}
    </View>
  );

  if (!interactive || !onOpen) {
    return imageFrame;
  }

  const handleOpen = (event: GestureResponderEvent) => {
    event.stopPropagation();
    onOpen(index, triggerRef);
  };

  return (
    <Pressable
      accessibilityLabel={`${accessibilityLabel} 크게 보기`}
      accessibilityRole="button"
      onPress={handleOpen}
      ref={triggerRef}
      style={fill ? styles.fillOpenTarget : styles.openTarget}
      testID={`post-media-open-${item.id}`}
    >
      {imageFrame}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  imageFrame: { borderRadius: radii.md, overflow: 'hidden', width: '100%' },
  image: { height: '100%', width: '100%' },
  openTarget: { borderRadius: radii.md, width: '100%' },
  fillOpenTarget: { borderRadius: radii.md, height: '100%', width: '100%' },
  fallback: {
    alignItems: 'center',
    borderRadius: radii.md,
    borderWidth: 1,
    gap: spacing.sm,
    justifyContent: 'center',
    minHeight: 144,
    padding: spacing.lg,
  },
  fillFallback: { height: '100%', minHeight: 0, padding: spacing.xs, width: '100%' },
  fallbackText: { fontFamily: fontFamilies.ui, textAlign: 'center', ...typography.sm },
  fillFrame: { height: '100%', minHeight: 0, width: '100%' },
  fillRetryButton: { minWidth: 0, paddingHorizontal: spacing.xs, width: '100%' },
  retryButton: {
    alignItems: 'center',
    borderRadius: radii.full,
    borderWidth: 1,
    justifyContent: 'center',
    minHeight: 48,
    minWidth: 112,
    paddingHorizontal: spacing.lg,
  },
  retryButtonText: { fontFamily: fontFamilies.ui, fontWeight: '700', ...typography.sm },
});
