import { ChevronLeftIcon, ChevronRightIcon, XIcon } from 'lucide-react-native';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
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
import { graphql, useFragment } from 'react-relay';
import { ProfileNameBlock } from '@/components/profile/ProfileNameBlock';
import { Avatar } from '@/components/ui/Avatar';
import { IconButton } from '@/components/ui/IconButton';
import { useSafeAreaPadding } from '@/components/ui/useSafeAreaPadding';
import { useTheme } from '@/theme/ThemeProvider';
import { breakpoints, iconSizes, radii, spacing, typography } from '@/theme/tokens';
import { PostContentPrivacyBoundary } from './PostContentPrivacyBoundary';
import { focusPostMediaViewerTarget } from './postMediaViewerSession';
import type { ReactNode, RefObject } from 'react';
import type { LayoutChangeEvent, View as NativeView } from 'react-native';
import type { PostMediaViewer_post$key } from './__generated__/PostMediaViewer_post.graphql';

const PostMediaViewerFragment = graphql`
  fragment PostMediaViewer_post on Post {
    id
    content {
      id
      bodyText
      media {
        id
        altText
        url
      }
    }
    profile {
      avatar {
        url
      }
      displayName
      relativeHandle
      ...ProfileNameBlock_profile
    }
  }
`;

type ImageState = Readonly<{
  generation: number;
  status: 'loading' | 'ready' | 'error';
}>;

type ContentProps = Readonly<{
  actionBar: ReactNode;
  post: PostMediaViewer_post$key;
  wideDetail: ReactNode;
}>;

type ViewerState = Readonly<{
  currentIndex: number;
  expanded: boolean;
  hasOverflow: boolean;
  imageStates: Record<string, ImageState>;
  lastContentId: string | null;
  moveByRef: RefObject<((delta: number) => void) | null>;
  selectedIndex: number;
  setCurrentIndex: React.Dispatch<React.SetStateAction<number>>;
  setExpanded: React.Dispatch<React.SetStateAction<boolean>>;
  setHasOverflow: React.Dispatch<React.SetStateAction<boolean>>;
  setImageStates: React.Dispatch<React.SetStateAction<Record<string, ImageState>>>;
  setPosition: React.Dispatch<
    React.SetStateAction<Readonly<{ current: number; total: number }> | null>
  >;
  syncContentId: (contentId: string | null) => void;
}>;

const PostMediaViewerStateContext = createContext<ViewerState | null>(null);

export function PostMediaViewer({
  children,
  fallbackFocus,
  onClose,
  originControl,
  selectedIndex,
}: Readonly<{
  children?: ReactNode;
  fallbackFocus?: RefObject<NativeView | null>;
  onClose: () => void;
  originControl: RefObject<NativeView | null>;
  selectedIndex: number;
}>) {
  const { width } = useWindowDimensions();
  const closeRef = useRef<NativeView>(null);
  const dialogRef = useRef<NativeView>(null);
  const ignoreNextPlatformClose = useRef(false);
  const moveByRef = useRef<((delta: number) => void) | null>(null);
  const [currentIndex, setCurrentIndex] = useState(selectedIndex);
  const [expanded, setExpanded] = useState(false);
  const [hasOverflow, setHasOverflow] = useState(false);
  const [imageStates, setImageStates] = useState<Record<string, ImageState>>({});
  const [lastContentId, setLastContentId] = useState<string | null>(null);
  const [position, setPosition] = useState<Readonly<{ current: number; total: number }> | null>(
    null,
  );
  const wide = Platform.OS === 'web' && width >= breakpoints.compact;
  const safeAreaStyle = useSafeAreaPadding(wide ? spacing.xl : spacing.xs);

  useEffect(() => {
    setCurrentIndex(selectedIndex);
  }, [selectedIndex]);

  const syncContentId = useCallback(
    (contentId: string | null) => {
      if (contentId === null || contentId === lastContentId) {
        return;
      }
      if (lastContentId !== null) {
        setCurrentIndex(selectedIndex);
        setExpanded(false);
        setHasOverflow(false);
        setImageStates({});
      }
      setLastContentId(contentId);
    },
    [lastContentId, selectedIndex],
  );
  const viewerState = useMemo<ViewerState>(
    () => ({
      currentIndex,
      expanded,
      hasOverflow,
      imageStates,
      lastContentId,
      moveByRef,
      selectedIndex,
      setCurrentIndex,
      setExpanded,
      setHasOverflow,
      setImageStates,
      setPosition,
      syncContentId,
    }),
    [currentIndex, expanded, hasOverflow, imageStates, lastContentId, selectedIndex, syncContentId],
  );

  useEffect(() => {
    const focusFrame = requestAnimationFrame(() => focusPostMediaViewerTarget(closeRef));
    return () => globalThis.cancelAnimationFrame?.(focusFrame);
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
        moveByRef.current?.(-1);
      } else if (event.key === 'ArrowRight') {
        event.preventDefault();
        moveByRef.current?.(1);
      }
    };

    globalThis.addEventListener?.('keydown', handleKeyDown);
    return () => globalThis.removeEventListener?.('keydown', handleKeyDown);
  }, []);

  return (
    <Modal
      accessibilityLabel="이미지 뷰어"
      animationType="fade"
      navigationBarTranslucent
      onRequestClose={handlePlatformRequestClose}
      presentationStyle="overFullScreen"
      statusBarTranslucent
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
          safeAreaStyle,
        ]}
        testID="post-media-viewer-backdrop"
      >
        <Pressable
          accessible={false}
          focusable={false}
          onPress={requestClose}
          style={styles.backdropDismissTarget}
          tabIndex={-1}
          testID="post-media-viewer-backdrop-dismiss"
        />
        <View
          accessibilityViewIsModal
          ref={dialogRef}
          style={[styles.dialog, Platform.OS === 'web' ? styles.webDialog : null]}
          testID="post-media-viewer-dialog"
        >
          <View style={styles.chrome}>
            <IconButton
              accessibilityLabel="이미지 뷰어 닫기"
              onPress={requestClose}
              controlRef={closeRef}
              style={({ pressed }) => [styles.iconButton, { opacity: pressed ? 0.7 : 1 }]}
              targetSize={48}
              testID="post-media-viewer-close"
              visualSize={48}
            >
              <XIcon color="#ffffff" size={iconSizes[24]} strokeWidth={2} />
            </IconButton>
            {position && position.total > 1 ? (
              <Text aria-hidden style={styles.counter} testID="post-media-viewer-counter">
                {position.current} / {position.total}
              </Text>
            ) : (
              <View />
            )}
            <View style={styles.chromeSpacer} />
          </View>
          <PostMediaViewerStateContext.Provider value={viewerState}>
            {children}
          </PostMediaViewerStateContext.Provider>
        </View>
      </View>
    </Modal>
  );
}

export function PostMediaViewerContent({ actionBar, post: postKey, wideDetail }: ContentProps) {
  const viewerState = usePostMediaViewerState();
  const post = useFragment(PostMediaViewerFragment, postKey);
  const content = post.content;
  const media = useMemo(
    () =>
      content?.media?.map(({ altText, id, url }) => ({
        altText: altText ?? null,
        id,
        url: url ?? null,
      })) ?? [],
    [content?.media],
  );
  const revisionChanged =
    content?.id != null &&
    viewerState.lastContentId != null &&
    content.id !== viewerState.lastContentId;
  const currentIndex = revisionChanged ? viewerState.selectedIndex : viewerState.currentIndex;
  const expanded = revisionChanged ? false : viewerState.expanded;
  const hasOverflow = revisionChanged ? false : viewerState.hasOverflow;
  const currentMedia = media[currentIndex];
  const currentMediaUrl = currentMedia?.url;
  const currentMediaStateKey = currentMedia
    ? `${currentMedia.id}:${currentMedia.url ?? ''}`
    : undefined;
  const bodyText = content?.bodyText ?? '';
  const theme = useTheme();
  const { height, width } = useWindowDimensions();
  const wide = Platform.OS === 'web' && width >= breakpoints.compact;
  const wideDetailWidth = Math.min(350, Math.max(320, width / 4));
  const compactDetailMaxHeight = Math.min(240, Math.max(192, height * 0.32));

  useEffect(
    () => viewerState.syncContentId(content?.id ?? null),
    [content?.id, viewerState.syncContentId],
  );

  useEffect(() => {
    viewerState.setPosition(
      currentMedia ? { current: currentIndex + 1, total: media.length } : null,
    );
    return () => viewerState.setPosition(null);
  }, [currentIndex, currentMedia, media.length, viewerState.setPosition]);

  useEffect(() => {
    if (media.length === 0 || revisionChanged) {
      return;
    }
    const currentMediaStateKeys = new Set(media.map((item) => `${item.id}:${item.url ?? ''}`));
    viewerState.setImageStates((states) => {
      const retainedStates: Record<string, ImageState> = {};
      let removed = false;
      for (const [key, state] of Object.entries(states)) {
        if (currentMediaStateKeys.has(key)) {
          retainedStates[key] = state;
        } else {
          removed = true;
        }
      }
      return removed ? retainedStates : states;
    });
  }, [media, revisionChanged, viewerState.setImageStates]);

  const moveBy = useCallback(
    (delta: number) => {
      if (!currentMedia) {
        return;
      }
      viewerState.setCurrentIndex((index) => boundedIndex(index + delta, media.length));
    },
    [currentMedia, media.length, viewerState.setCurrentIndex],
  );

  useEffect(() => {
    viewerState.moveByRef.current = moveBy;
    return () => {
      viewerState.moveByRef.current = null;
    };
  }, [moveBy, viewerState.moveByRef]);

  const swipeResponder = useMemo(
    () =>
      PanResponder.create({
        onMoveShouldSetPanResponder: (_event, gesture) =>
          Boolean(currentMedia) &&
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
    [currentMedia, moveBy],
  );

  const setCurrentImageState = useCallback(
    (update: (state: ImageState) => ImageState) => {
      if (!currentMediaStateKey) {
        return;
      }
      viewerState.setImageStates((states) => ({
        ...states,
        [currentMediaStateKey]: update(
          states[currentMediaStateKey] ?? {
            generation: 0,
            status: currentMediaUrl ? 'loading' : 'error',
          },
        ),
      }));
    },
    [currentMediaStateKey, currentMediaUrl, viewerState.setImageStates],
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
  const handleBodyLayout = useCallback(
    (event: LayoutChangeEvent) => {
      viewerState.setHasOverflow(
        event.nativeEvent.layout.height > typography.md.lineHeight * 3 + 0.5,
      );
    },
    [viewerState.setHasOverflow],
  );

  const imageName =
    currentMedia?.altText?.trim() ||
    (currentMedia ? `${currentIndex + 1}번째 첨부 이미지` : '이미지');
  const currentState = currentMediaStateKey
    ? (viewerState.imageStates[currentMediaStateKey] ?? {
        generation: 0,
        status: currentMedia.url ? 'loading' : 'error',
      })
    : null;
  const unavailable = !currentMedia || !currentMediaUrl;
  const multiple = media.length > 1 && currentMedia != null;
  const previousDisabled = currentIndex <= 0;
  const nextDisabled = currentIndex >= media.length - 1;

  return (
    <View
      style={[styles.layout, wide ? styles.wideLayout : styles.mobileLayout]}
      testID="post-media-viewer-layout"
    >
      <View
        {...swipeResponder.panHandlers}
        style={[styles.imagePane, wide ? styles.wideImagePane : null]}
        testID="post-media-viewer-image-pane"
      >
        {unavailable ? (
          <View
            accessibilityLiveRegion="polite"
            style={styles.imageFallback}
            testID="post-media-viewer-unavailable"
          >
            <Text style={styles.imageFallbackText}>이미지를 더 이상 표시할 수 없습니다.</Text>
          </View>
        ) : currentState?.status === 'error' ? (
          <View
            accessibilityLiveRegion="polite"
            style={styles.imageFallback}
            testID={`post-media-viewer-error-${currentMedia!.id}`}
          >
            <Text style={styles.imageFallbackText}>이미지를 불러오지 못했습니다.</Text>
            {currentMedia!.url ? (
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
          <PostContentPrivacyBoundary
            style={styles.imagePrivacyBoundary}
            testID="post-media-viewer-image-privacy-boundary"
          >
            <Image
              accessibilityLabel={imageName}
              accessibilityState={{ busy: currentState?.status === 'loading' }}
              key={`${currentMediaStateKey}:${currentState!.generation}`}
              onError={handleImageError}
              onLoad={handleImageLoad}
              onLoadStart={handleImageLoadStart}
              resizeMode="contain"
              source={{ uri: currentMedia!.url! }}
              style={styles.image}
              testID="post-media-viewer-image"
            />
          </PostContentPrivacyBoundary>
        )}

        {multiple ? (
          <>
            <NavigationButton
              disabled={previousDisabled}
              direction="previous"
              onPress={() => moveBy(-1)}
            />
            <NavigationButton disabled={nextDisabled} direction="next" onPress={() => moveBy(1)} />
          </>
        ) : null}
        {currentMedia ? (
          <Text
            accessibilityLiveRegion="polite"
            role="status"
            style={styles.screenReaderOnly}
            testID="post-media-viewer-position"
          >
            {`${currentIndex + 1} / ${media.length}`}
          </Text>
        ) : null}
      </View>

      {wide ? (
        wideDetail != null ? (
          <View
            style={[
              styles.wideDetail,
              {
                backgroundColor: theme.background,
                flexBasis: wideDetailWidth,
                maxWidth: wideDetailWidth,
                minWidth: wideDetailWidth,
              },
            ]}
            testID="post-media-viewer-wide-detail"
          >
            {wideDetail}
          </View>
        ) : null
      ) : (
        <View
          style={[
            styles.detailPanel,
            { backgroundColor: theme.card, maxHeight: compactDetailMaxHeight },
          ]}
          testID="post-media-viewer-detail"
        >
          <View style={styles.author}>
            <Avatar
              imageUri={post.profile.avatar?.url}
              label={post.profile.displayName || post.profile.relativeHandle}
              size={40}
            />
            <ProfileNameBlock profile={post.profile} />
          </View>

          <View style={styles.bodyRegion} testID="post-media-viewer-body-region">
            <PostContentPrivacyBoundary
              style={styles.bodyPrivacyBoundary}
              testID="post-media-viewer-body-privacy-boundary"
            >
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
                <View style={styles.collapsedBody} testID="post-media-viewer-collapsed-body">
                  <Text
                    numberOfLines={3}
                    style={[styles.bodyText, { color: theme.text }]}
                    testID="post-media-viewer-body"
                  >
                    {bodyText}
                  </Text>
                </View>
              )}
            </PostContentPrivacyBoundary>
            {hasOverflow ? (
              <Pressable
                accessibilityLabel={expanded ? '원문 접기' : '원문 더 보기'}
                accessibilityRole="button"
                accessibilityState={{ expanded }}
                onPress={() => viewerState.setExpanded((value) => !value)}
                style={styles.moreButton}
              >
                <Text style={[styles.moreText, { color: theme.textSecondary }]}>
                  {expanded ? '접기' : '더 보기'}
                </Text>
              </Pressable>
            ) : null}
          </View>

          {actionBar != null ? (
            <View
              style={[styles.actionBar, { borderColor: theme.border }]}
              testID="post-media-viewer-action-bar"
            >
              {actionBar}
            </View>
          ) : null}
        </View>
      )}
    </View>
  );
}

export function PostMediaViewerQueryState({
  loading = false,
  onRetry,
  unavailable = false,
}: Readonly<{ loading?: boolean; onRetry?: () => void; unavailable?: boolean }>) {
  const { width } = useWindowDimensions();
  const wide = Platform.OS === 'web' && width >= breakpoints.compact;
  const viewerState = usePostMediaViewerState();

  useEffect(() => {
    viewerState.setPosition(null);
  }, [viewerState.setPosition]);

  return (
    <View
      style={[styles.layout, wide ? styles.wideLayout : styles.mobileLayout]}
      testID="post-media-viewer-layout"
    >
      <View
        accessibilityLiveRegion="polite"
        style={[styles.imagePane, wide ? styles.wideImagePane : null]}
        testID={
          unavailable
            ? 'post-media-viewer-unavailable'
            : loading
              ? 'post-media-viewer-query-loading'
              : 'post-media-viewer-query-error'
        }
      >
        <View style={styles.imageFallback}>
          <Text style={styles.imageFallbackText}>
            {unavailable
              ? '이미지를 더 이상 표시할 수 없습니다.'
              : loading
                ? '게시글을 불러오는 중입니다.'
                : '게시글을 불러오지 못했습니다.'}
          </Text>
          {onRetry ? (
            <Pressable
              accessibilityLabel="게시글 다시 불러오기"
              accessibilityRole="button"
              onPress={onRetry}
              style={styles.retryButton}
            >
              <Text style={styles.retryText}>다시 시도</Text>
            </Pressable>
          ) : null}
        </View>
      </View>
    </View>
  );
}

function usePostMediaViewerState(): ViewerState {
  const value = useContext(PostMediaViewerStateContext);
  if (!value) {
    throw new Error('PostMediaViewerContent에는 PostMediaViewer가 필요합니다.');
  }
  return value;
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
  const NavigationIcon = direction === 'previous' ? ChevronLeftIcon : ChevronRightIcon;
  return (
    <IconButton
      accessibilityLabel={label}
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.navigationButton,
        direction === 'previous' ? styles.previousButton : styles.nextButton,
        { opacity: disabled ? 0.3 : pressed ? 0.7 : 1 },
      ]}
      targetSize={48}
      visualSize={48}
    >
      <NavigationIcon color="#ffffff" size={iconSizes[24]} strokeWidth={2} />
    </IconButton>
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
  webDialog: { borderRadius: radii.lg, overflow: 'hidden' },
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
  imagePrivacyBoundary: { height: '100%', width: '100%' },
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
  screenReaderOnly: { height: 1, opacity: 0, position: 'absolute', width: 1 },
  detailPanel: {
    flexShrink: 1,
    gap: spacing.sm,
    minHeight: 0,
    minWidth: 0,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
  },
  wideDetail: { flex: 0, minHeight: 0 },
  author: { alignItems: 'center', flexDirection: 'row', gap: spacing.sm },
  bodyRegion: { flexShrink: 1, minHeight: 0, position: 'relative' },
  bodyPrivacyBoundary: { flexShrink: 1, minHeight: 0, position: 'relative' },
  bodyMeasure: { left: 0, opacity: 0, position: 'absolute', right: 0, top: 0 },
  bodyText: { fontFamily: 'Pretendard', ...typography.md },
  collapsedBody: { flexShrink: 1, minHeight: 0, overflow: 'hidden' },
  bodyScroll: { flexShrink: 1, minHeight: 0 },
  moreButton: {
    alignSelf: 'flex-start',
    flexShrink: 0,
    justifyContent: 'center',
    minHeight: 44,
  },
  moreText: { fontFamily: 'SUIT', fontWeight: '700', ...typography.sm },
  actionBar: { borderTopWidth: 1, paddingBottom: spacing.sm, paddingTop: spacing.sm },
});
