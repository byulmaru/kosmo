import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Image,
  Modal,
  PanResponder,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import { Avatar } from '@/components/ui/Avatar';
import { useTheme } from '@/theme/ThemeProvider';
import { breakpoints, radii, spacing, typography } from '@/theme/tokens';
import { focusPostMediaViewerTarget } from './postMediaViewerSession';
import type { ReactNode, RefObject } from 'react';
import type { LayoutChangeEvent, View as NativeView } from 'react-native';
import type { PostMediaItem } from './PostMediaImage';

type ImageState = Readonly<{
  generation: number;
  status: 'loading' | 'ready' | 'error';
}>;

type Props = Readonly<{
  actionBar: ReactNode;
  bodyText: string;
  contentId: string;
  fallbackFocus?: RefObject<NativeView | null>;
  media: ReadonlyArray<PostMediaItem>;
  onClose: () => void;
  originControl: RefObject<NativeView | null>;
  profile: {
    avatarUrl: string | null;
    displayName: string;
    handle: string;
  };
  selectedIndex: number;
}>;

export function PostMediaViewer({
  actionBar,
  bodyText,
  contentId,
  fallbackFocus,
  media,
  onClose,
  originControl,
  profile,
  selectedIndex,
}: Props) {
  const theme = useTheme();
  const { width } = useWindowDimensions();
  const closeRef = useRef<NativeView>(null);
  const dialogRef = useRef<NativeView>(null);
  const ignoreNextPlatformClose = useRef(false);
  const [currentIndex, setCurrentIndex] = useState(() => boundedIndex(selectedIndex, media.length));
  const [expanded, setExpanded] = useState(false);
  const [hasOverflow, setHasOverflow] = useState(false);
  const [imageStates, setImageStates] = useState<Record<string, ImageState>>({});
  const wide = Platform.OS === 'web' && width >= breakpoints.compact;
  const currentMedia = media[currentIndex];
  const currentMediaId = currentMedia?.id;
  const currentMediaUrl = currentMedia?.url;

  useEffect(() => {
    setCurrentIndex(boundedIndex(selectedIndex, media.length));
    setExpanded(false);
    setHasOverflow(false);
    setImageStates({});
  }, [contentId, media.length, selectedIndex]);

  useEffect(() => {
    const frame = requestAnimationFrame(() => focusPostMediaViewerTarget(closeRef));
    return () => globalThis.cancelAnimationFrame?.(frame);
  }, []);

  const requestClose = useCallback(() => {
    onClose();
    requestAnimationFrame(() => focusPostMediaViewerTarget(originControl, fallbackFocus));
  }, [fallbackFocus, onClose, originControl]);
  const handlePlatformRequestClose = useCallback(() => {
    if (Platform.OS === 'web' && ignoreNextPlatformClose.current) {
      ignoreNextPlatformClose.current = false;
      return;
    }
    requestClose();
  }, [requestClose]);

  const moveBy = useCallback(
    (delta: number) => {
      setCurrentIndex((index) => boundedIndex(index + delta, media.length));
    },
    [media.length],
  );

  useEffect(() => {
    if (Platform.OS !== 'web') {
      return;
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      const targetInsideViewer = containsTarget(dialogRef, event.target);
      if (event.key === 'Escape' && !targetInsideViewer) {
        ignoreNextPlatformClose.current = true;
        return;
      }
      if (
        event.defaultPrevented ||
        event.altKey ||
        event.ctrlKey ||
        event.metaKey ||
        !targetInsideViewer ||
        isEditableTarget(event.target)
      ) {
        return;
      }
      if (event.key === 'ArrowLeft') {
        event.preventDefault();
        moveBy(-1);
      } else if (event.key === 'ArrowRight') {
        event.preventDefault();
        moveBy(1);
      }
    };

    globalThis.addEventListener?.('keydown', handleKeyDown);
    return () => globalThis.removeEventListener?.('keydown', handleKeyDown);
  }, [moveBy]);

  const swipeResponder = useMemo(
    () =>
      PanResponder.create({
        onMoveShouldSetPanResponder: (_event, gesture) =>
          Platform.OS !== 'web' &&
          Math.abs(gesture.dx) > 12 &&
          Math.abs(gesture.dx) > Math.abs(gesture.dy) * 1.2,
        onPanResponderRelease: (_event, gesture) => {
          if (gesture.dx <= -48) {
            moveBy(1);
          } else if (gesture.dx >= 48) {
            moveBy(-1);
          }
        },
      }),
    [moveBy],
  );

  const setCurrentImageState = useCallback(
    (update: (state: ImageState) => ImageState) => {
      if (!currentMediaId) {
        return;
      }
      setImageStates((states) => ({
        ...states,
        [currentMediaId]: update(
          states[currentMediaId] ?? {
            generation: 0,
            status: currentMediaUrl ? 'loading' : 'error',
          },
        ),
      }));
    },
    [currentMediaId, currentMediaUrl],
  );
  const handleImageError = useCallback(
    () => setCurrentImageState((state) => ({ ...state, status: 'error' })),
    [setCurrentImageState],
  );
  const handleImageLoad = useCallback(
    () => setCurrentImageState((state) => ({ ...state, status: 'ready' })),
    [setCurrentImageState],
  );
  const handleImageLoadStart = useCallback(
    () => setCurrentImageState((state) => ({ ...state, status: 'loading' })),
    [setCurrentImageState],
  );
  const handleBodyLayout = useCallback((event: LayoutChangeEvent) => {
    setHasOverflow(event.nativeEvent.layout.height > typography.md.lineHeight * 3 + 0.5);
  }, []);

  if (!currentMedia) {
    return null;
  }

  const imageName = currentMedia.altText?.trim() || `${currentIndex + 1}번째 첨부 이미지`;
  const currentState = imageStates[currentMedia.id] ?? {
    generation: 0,
    status: currentMedia.url ? 'loading' : 'error',
  };
  const multiple = media.length > 1;
  const previousDisabled = currentIndex === 0;
  const nextDisabled = currentIndex === media.length - 1;

  return (
    <Modal
      accessibilityLabel="이미지 뷰어"
      animationType="fade"
      onRequestClose={handlePlatformRequestClose}
      presentationStyle="overFullScreen"
      transparent
      visible
    >
      <View
        style={[
          styles.backdrop,
          Platform.OS === 'web'
            ? wide
              ? styles.wideWebBackdrop
              : styles.compactWebBackdrop
            : null,
        ]}
        testID="post-media-viewer-backdrop"
      >
        <Pressable
          accessible={false}
          onPress={requestClose}
          style={styles.backdropDismissTarget}
          testID="post-media-viewer-backdrop-dismiss"
        />
        <View
          accessibilityViewIsModal
          ref={dialogRef}
          style={[styles.dialog, Platform.OS === 'web' ? styles.webDialog : null]}
          testID="post-media-viewer-dialog"
        >
          <View style={styles.chrome}>
            <Pressable
              accessibilityLabel="이미지 뷰어 닫기"
              accessibilityRole="button"
              onPress={requestClose}
              ref={closeRef}
              style={({ pressed }) => [styles.iconButton, { opacity: pressed ? 0.7 : 1 }]}
              testID="post-media-viewer-close"
            >
              <Text aria-hidden style={styles.closeIcon}>
                ×
              </Text>
            </Pressable>
            {multiple ? (
              <Text aria-hidden style={styles.counter} testID="post-media-viewer-counter">
                {currentIndex + 1} / {media.length}
              </Text>
            ) : (
              <View />
            )}
            <View style={styles.chromeSpacer} />
          </View>

          <View
            style={[styles.layout, wide ? styles.wideLayout : styles.mobileLayout]}
            testID="post-media-viewer-layout"
          >
            <View
              {...swipeResponder.panHandlers}
              style={[styles.imagePane, wide ? styles.wideImagePane : null]}
              testID="post-media-viewer-image-pane"
            >
              {currentState.status === 'error' ? (
                <View
                  accessibilityLiveRegion="polite"
                  style={styles.imageFallback}
                  testID={`post-media-viewer-error-${currentMedia.id}`}
                >
                  <Text style={styles.imageFallbackText}>이미지를 불러오지 못했습니다.</Text>
                  {currentMedia.url ? (
                    <Pressable
                      accessibilityLabel={`${imageName} 다시 시도`}
                      accessibilityRole="button"
                      onPress={() =>
                        setCurrentImageState((state) => ({
                          generation: state.generation + 1,
                          status: 'loading',
                        }))
                      }
                      style={styles.retryButton}
                    >
                      <Text style={styles.retryText}>다시 시도</Text>
                    </Pressable>
                  ) : null}
                </View>
              ) : (
                <Image
                  accessibilityLabel={imageName}
                  accessibilityState={{ busy: currentState.status === 'loading' }}
                  key={`${currentMedia.id}:${currentState.generation}`}
                  onError={handleImageError}
                  onLoad={handleImageLoad}
                  onLoadStart={handleImageLoadStart}
                  resizeMode="contain"
                  source={{ uri: currentMedia.url! }}
                  style={styles.image}
                  testID="post-media-viewer-image"
                />
              )}

              {multiple ? (
                <>
                  <NavigationButton
                    disabled={previousDisabled}
                    direction="previous"
                    onPress={() => moveBy(-1)}
                  />
                  <NavigationButton
                    disabled={nextDisabled}
                    direction="next"
                    onPress={() => moveBy(1)}
                  />
                </>
              ) : null}
              <Text
                accessibilityLiveRegion="polite"
                role="status"
                style={styles.screenReaderOnly}
                testID="post-media-viewer-position"
              >
                {currentIndex + 1} / {media.length}
              </Text>
            </View>

            <View
              style={[
                styles.detailPanel,
                wide ? styles.wideDetailPanel : null,
                { backgroundColor: theme.card },
              ]}
              testID="post-media-viewer-detail"
            >
              <View style={styles.author}>
                <Avatar
                  imageUri={profile.avatarUrl}
                  label={profile.displayName || profile.handle}
                  size={40}
                />
                <View style={styles.authorText}>
                  <Text numberOfLines={1} style={[styles.displayName, { color: theme.text }]}>
                    {profile.displayName}
                  </Text>
                  <Text numberOfLines={1} style={[styles.handle, { color: theme.textSecondary }]}>
                    @{profile.handle}
                  </Text>
                </View>
              </View>

              <View style={styles.bodyRegion}>
                <Text
                  accessible={false}
                  onLayout={handleBodyLayout}
                  style={[styles.bodyText, styles.bodyMeasure, { color: theme.text }]}
                  testID="post-media-viewer-body-measure"
                >
                  {bodyText}
                </Text>
                {expanded ? (
                  <ScrollView style={styles.bodyScroll} testID="post-media-viewer-body-scroll">
                    <Text style={[styles.bodyText, { color: theme.text }]}>{bodyText}</Text>
                  </ScrollView>
                ) : (
                  <Text
                    numberOfLines={3}
                    style={[styles.bodyText, { color: theme.text }]}
                    testID="post-media-viewer-body"
                  >
                    {bodyText}
                  </Text>
                )}
                {hasOverflow ? (
                  <Pressable
                    accessibilityLabel={expanded ? '원문 접기' : '원문 더 보기'}
                    accessibilityRole="button"
                    accessibilityState={{ expanded }}
                    onPress={() => setExpanded((value) => !value)}
                    style={styles.moreButton}
                  >
                    <Text style={[styles.moreText, { color: theme.textSecondary }]}>
                      {expanded ? '접기' : '더 보기'}
                    </Text>
                  </Pressable>
                ) : null}
              </View>

              <View
                style={[styles.actionBar, { borderColor: theme.border }]}
                testID="post-media-viewer-action-bar"
              >
                {actionBar}
              </View>
            </View>
          </View>
        </View>
      </View>
    </Modal>
  );
}

function NavigationButton({
  direction,
  disabled,
  onPress,
}: {
  direction: 'next' | 'previous';
  disabled: boolean;
  onPress: () => void;
}) {
  const label = direction === 'previous' ? '이전 이미지' : '다음 이미지';
  return (
    <Pressable
      accessibilityLabel={label}
      accessibilityRole="button"
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.navigationButton,
        direction === 'previous' ? styles.previousButton : styles.nextButton,
        { opacity: disabled ? 0.3 : pressed ? 0.7 : 1 },
      ]}
    >
      <Text aria-hidden style={styles.navigationIcon}>
        {direction === 'previous' ? '‹' : '›'}
      </Text>
    </Pressable>
  );
}

function boundedIndex(index: number, length: number): number {
  return Math.max(0, Math.min(index, Math.max(length - 1, 0)));
}

function isEditableTarget(target: EventTarget | null): boolean {
  const element = target as HTMLElement | null;
  return (
    Boolean(element?.isContentEditable) ||
    ['INPUT', 'SELECT', 'TEXTAREA'].includes(element?.tagName ?? '')
  );
}

function containsTarget(dialog: RefObject<NativeView | null>, target: EventTarget | null): boolean {
  const element = dialog.current as unknown as { contains?: (node: EventTarget | null) => boolean };
  return element.contains?.(target) ?? false;
}

const styles = StyleSheet.create({
  backdrop: {
    alignItems: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.92)',
    flex: 1,
    justifyContent: 'center',
  },
  compactWebBackdrop: { padding: spacing.xs },
  wideWebBackdrop: { padding: spacing.xl },
  backdropDismissTarget: {
    bottom: 0,
    left: 0,
    position: 'absolute',
    right: 0,
    top: 0,
  },
  dialog: {
    backgroundColor: '#000000',
    flex: 1,
    minHeight: 0,
    minWidth: 0,
    width: '100%',
    zIndex: 1,
  },
  webDialog: { borderRadius: radii.lg, maxWidth: 1280, overflow: 'hidden' },
  chrome: {
    alignItems: 'center',
    flexDirection: 'row',
    height: 56,
    justifyContent: 'space-between',
    paddingHorizontal: spacing.sm,
  },
  chromeSpacer: { height: 48, width: 48 },
  iconButton: {
    alignItems: 'center',
    borderRadius: radii.full,
    height: 48,
    justifyContent: 'center',
    width: 48,
  },
  closeIcon: { color: '#ffffff', fontFamily: 'SUIT', fontSize: 32, lineHeight: 34 },
  counter: { color: '#ffffff', fontFamily: 'SUIT', fontWeight: '700', ...typography.sm },
  layout: { flex: 1, minHeight: 0, minWidth: 0 },
  mobileLayout: { flexDirection: 'column' },
  wideLayout: { flexDirection: 'row' },
  imagePane: {
    alignItems: 'center',
    backgroundColor: '#000000',
    flex: 3,
    justifyContent: 'center',
    minHeight: 0,
    minWidth: 0,
    position: 'relative',
  },
  wideImagePane: { flex: 1 },
  image: { height: '100%', width: '100%' },
  imageFallback: { alignItems: 'center', gap: spacing.md, justifyContent: 'center' },
  imageFallbackText: { color: '#ffffff', fontFamily: 'SUIT', ...typography.sm },
  retryButton: {
    alignItems: 'center',
    borderColor: '#777777',
    borderRadius: radii.full,
    borderWidth: 1,
    justifyContent: 'center',
    minHeight: 48,
    minWidth: 112,
    paddingHorizontal: spacing.lg,
  },
  retryText: { color: '#ffffff', fontFamily: 'SUIT', fontWeight: '700', ...typography.sm },
  navigationButton: {
    alignItems: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.55)',
    borderRadius: radii.full,
    height: 48,
    justifyContent: 'center',
    marginTop: -24,
    position: 'absolute',
    top: '50%',
    width: 48,
  },
  previousButton: { left: spacing.sm },
  nextButton: { right: spacing.sm },
  navigationIcon: { color: '#ffffff', fontFamily: 'SUIT', fontSize: 36, lineHeight: 38 },
  screenReaderOnly: { height: 1, opacity: 0, position: 'absolute', width: 1 },
  detailPanel: {
    flex: 2,
    gap: spacing.sm,
    minHeight: 0,
    minWidth: 0,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
  },
  wideDetailPanel: { flex: 0, flexBasis: 360, maxWidth: 420, minWidth: 320 },
  author: { alignItems: 'center', flexDirection: 'row', gap: spacing.sm },
  authorText: { flex: 1, minWidth: 0 },
  displayName: { fontFamily: 'SUIT', fontWeight: '700', ...typography.md },
  handle: { fontFamily: 'SUIT', ...typography.sm },
  bodyRegion: { flex: 1, minHeight: 0, position: 'relative' },
  bodyMeasure: { left: 0, opacity: 0, position: 'absolute', right: 0, top: 0 },
  bodyText: { fontFamily: 'Pretendard', ...typography.md },
  bodyScroll: { flex: 1, minHeight: 0 },
  moreButton: { alignSelf: 'flex-start', minHeight: 44, justifyContent: 'center' },
  moreText: { fontFamily: 'SUIT', fontWeight: '700', ...typography.sm },
  actionBar: { borderTopWidth: 1, paddingBottom: spacing.sm, paddingTop: spacing.sm },
});
