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
  const theme = useTheme();
  const triggerRef = useRef<NativeView>(null);
  const [generation, setGeneration] = useState(0);
  const [aspectRatio, setAspectRatio] = useState(1);
  const [loadState, setLoadState] = useState<{
    generation: number;
    id: string;
    status: 'loading' | 'ready' | 'error';
    url: string | null;
  }>({ generation, id: item.id, status: 'loading', url: item.url });
  const currentSource = useRef({ generation, id: item.id, url: item.url });
  const measuredUrl = useRef<string | null>(null);
  currentSource.current = { generation, id: item.id, url: item.url };
  const status =
    loadState.generation === generation && loadState.id === item.id && loadState.url === item.url
      ? loadState.status
      : 'loading';
  const accessibilityLabel = item.altText?.trim() || `${index + 1}번째 첨부 이미지`;
  const canRetry = Boolean(item.url) && Boolean(interactive);
  const handleError = useCallback(() => {
    if (
      currentSource.current.generation === generation &&
      currentSource.current.id === item.id &&
      currentSource.current.url === item.url
    ) {
      setLoadState({ generation, id: item.id, status: 'error', url: item.url });
    }
  }, [generation, item.id, item.url]);
  const handleLoadStart = useCallback(() => {
    if (
      currentSource.current.generation !== generation ||
      currentSource.current.id !== item.id ||
      currentSource.current.url !== item.url
    ) {
      return;
    }

    setLoadState((current) => {
      if (
        current.generation === generation &&
        current.id === item.id &&
        current.url === item.url &&
        current.status === 'ready'
      ) {
        return current;
      }
      return { generation, id: item.id, status: 'loading', url: item.url };
    });
  }, [generation, item.id, item.url]);
  const updateAspectRatio = useCallback((url: string, width: number, height: number) => {
    if (currentSource.current.url === url && height > 0 && width > 0) {
      measuredUrl.current = url;
      setAspectRatio(Math.max(width / height, 1));
    }
  }, []);
  const handleLoad = useCallback(
    (event?: ImageLoadEvent) => {
      if (
        currentSource.current.generation !== generation ||
        currentSource.current.id !== item.id ||
        currentSource.current.url !== item.url
      ) {
        return;
      }

      setLoadState({ generation, id: item.id, status: 'ready', url: item.url });
      if (fill || !item.url || measuredUrl.current === item.url) {
        return;
      }

      const source = event?.nativeEvent?.source;
      if (source) {
        updateAspectRatio(item.url, source.width, source.height);
        return;
      }

      const url = item.url;
      Image.getSize(
        url,
        (width, height) => updateAspectRatio(url, width, height),
        () => undefined,
      );
    },
    [fill, generation, item.id, item.url, updateAspectRatio],
  );

  useEffect(() => {
    if (fill || !item.url) {
      return;
    }

    let active = true;
    Image.getSize(
      item.url,
      (width, height) => {
        if (active) {
          updateAspectRatio(item.url!, width, height);
        }
      },
      () => undefined,
    );

    return () => {
      active = false;
    };
  }, [fill, generation, item.url, updateAspectRatio]);

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
            onPress={() => {
              setGeneration((value) => value + 1);
              setLoadState({
                generation: generation + 1,
                id: item.id,
                status: 'loading',
                url: item.url,
              });
            }}
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
        fill ? styles.fillFrame : { aspectRatio },
        { backgroundColor: theme.surface },
      ]}
      testID={`post-media-frame-${item.id}`}
    >
      <Image
        accessible={!onOpen || !interactive}
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
