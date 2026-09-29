import { XIcon } from 'lucide-react-native';
import {
  createContext,
  isValidElement,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { graphql, useFragment } from 'react-relay';
import { PostMediaViewerSurface } from '@/components/post/PostMediaViewerSurface';
import { ProfileNameBlock } from '@/components/profile/ProfileNameBlock';
import { Avatar } from '@/components/ui/Avatar';
import { IconButton } from '@/components/ui/IconButton';
import { useSafeAreaPadding } from '@/components/ui/useSafeAreaPadding';
import { useTheme } from '@/theme/ThemeProvider';
import {
  borderWidths,
  breakpoints,
  fontFamilies,
  radii,
  spacing,
  typography,
} from '@/theme/tokens';
import { PostContentPrivacyBoundary } from './PostContentPrivacyBoundary';
import { focusPostMediaViewerTarget } from './postMediaViewerSession';
import type { ReactNode, RefObject } from 'react';
import type {
  LayoutChangeEvent,
  PressableStateCallbackType,
  View as NativeView,
  ViewStyle,
} from 'react-native';
import type { PostMediaViewerViewState } from '@/components/post/PostMediaViewerSurface';
import type { PostMediaViewer_post$key } from './__generated__/PostMediaViewer_post.graphql';
import type { PostMediaItem } from './PostMediaImage';

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

type ContentProps = Readonly<{
  actionBar: ReactNode;
  post: PostMediaViewer_post$key;
  wideDetail: ReactNode;
}>;

type ViewerState = Readonly<{
  currentIndex: number;
  expanded: boolean;
  lastContentId: string | null;
  moveByRef: RefObject<((delta: number) => void) | null>;
  requestClose: () => void;
  selectedIndex: number;
  setCurrentIndex: React.Dispatch<React.SetStateAction<number>>;
  setExpanded: React.Dispatch<React.SetStateAction<boolean>>;
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
  const insets = useSafeAreaInsets();
  const closeRef = useRef<NativeView>(null);
  const dialogRef = useRef<NativeView>(null);
  const ignoreNextPlatformClose = useRef(false);
  const moveByRef = useRef<((delta: number) => void) | null>(null);
  const [currentIndex, setCurrentIndex] = useState(selectedIndex);
  const [expanded, setExpanded] = useState(false);
  const [lastContentId, setLastContentId] = useState<string | null>(null);
  const wide = Platform.OS === 'web' && width >= breakpoints.compact;
  const safeAreaStyle = useSafeAreaPadding();
  const closeTop = spacing.lg + (Platform.OS === 'web' ? 0 : insets.top);
  const closeHorizontal =
    spacing.lg + (Platform.OS === 'web' ? 0 : wide ? insets.left : insets.right);

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
      }
      setLastContentId(contentId);
    },
    [lastContentId, selectedIndex],
  );
  const requestClose = useCallback(() => {
    onClose();
    requestAnimationFrame(() => focusPostMediaViewerTarget(originControl, fallbackFocus));
  }, [fallbackFocus, onClose, originControl]);
  const viewerState = useMemo<ViewerState>(
    () => ({
      currentIndex,
      expanded,
      lastContentId,
      moveByRef,
      requestClose,
      selectedIndex,
      setCurrentIndex,
      setExpanded,
      syncContentId,
    }),
    [currentIndex, expanded, lastContentId, requestClose, selectedIndex, syncContentId],
  );

  useEffect(() => {
    const focusFrame = requestAnimationFrame(() => focusPostMediaViewerTarget(closeRef));
    return () => globalThis.cancelAnimationFrame?.(focusFrame);
  }, []);

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
      <View style={styles.backdrop} testID="post-media-viewer-backdrop">
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
          style={[styles.dialog, Platform.OS === 'web' ? null : safeAreaStyle]}
          testID="post-media-viewer-dialog"
        >
          <IconButton
            accessibilityLabel="이미지 뷰어 닫기"
            controlRef={closeRef}
            feedbackTone="inverse"
            onPress={requestClose}
            style={[
              styles.stableClose,
              wide ? styles.stableCloseWide : styles.stableCloseCompact,
              { top: closeTop, ...(wide ? { left: closeHorizontal } : { right: closeHorizontal }) },
            ]}
            targetSize={48}
            testID="post-media-viewer-close"
            visualSize={48}
            visualStyle={stableCloseVisualStyle}
          >
            <XIcon color="#ffffff" size={30} strokeWidth={2.5} />
          </IconButton>
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
  const media = useMemo<readonly PostMediaItem[]>(
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
  const currentMedia = media[currentIndex];
  const bodyText = content?.bodyText ?? '';
  const bodyMeasurementKey = JSON.stringify([content?.id ?? null, bodyText]);
  const currentBodyMeasurementKey = useRef(bodyMeasurementKey);
  currentBodyMeasurementKey.current = bodyMeasurementKey;
  const [bodyMeasurement, setBodyMeasurement] = useState({ key: '', overflow: false });
  const hasOverflow =
    !revisionChanged && bodyMeasurement.key === bodyMeasurementKey && bodyMeasurement.overflow;
  const theme = useTheme();
  const { width } = useWindowDimensions();
  const wide = Platform.OS === 'web' && width >= breakpoints.compact;
  const contextRailWidth = boundedContextRailWidth(width);
  const viewState: PostMediaViewerViewState =
    content === null || currentMedia === undefined || currentMedia.url === null
      ? 'unavailable'
      : 'ready';

  useEffect(
    () => viewerState.syncContentId(content?.id ?? null),
    [content?.id, viewerState.syncContentId],
  );

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

  const handleBodyLayout = useCallback(
    (event: LayoutChangeEvent) => {
      if (currentBodyMeasurementKey.current !== bodyMeasurementKey) {
        return;
      }
      setBodyMeasurement({
        key: bodyMeasurementKey,
        overflow: event.nativeEvent.layout.height > typography.md.lineHeight * 3 + 0.5,
      });
    },
    [bodyMeasurementKey],
  );
  const compactDetail = (
    <View testID="post-media-viewer-detail" style={styles.detailPanel}>
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
          <View
            style={styles.bodyMeasureBoundary}
            testID="post-media-viewer-body-measure-container"
          >
            <Text
              key={bodyMeasurementKey}
              accessible={false}
              onLayout={handleBodyLayout}
              style={[styles.bodyText, styles.bodyMeasure, { color: theme.text }]}
              testID="post-media-viewer-body-measure"
            >
              {bodyText}
            </Text>
          </View>
          {expanded ? (
            <ScrollView
              accessibilityLabel="펼친 원문"
              showsVerticalScrollIndicator={false}
              style={styles.bodyScroll}
              tabIndex={0}
              testID="post-media-viewer-body-scroll"
            >
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
  );
  const contextRail = isValidElement(wideDetail) ? (
    wideDetail
  ) : (
    <View style={styles.wideDetailFallback} testID="post-media-viewer-wide-detail-fallback" />
  );

  const surface = wide ? (
    <PostMediaViewerSurface
      contextRail={contextRail}
      contextRailWidth={contextRailWidth}
      contentRevisionId={content?.id ?? null}
      currentIndex={currentIndex}
      media={media}
      onClose={viewerState.requestClose}
      onIndexChange={(index) => viewerState.setCurrentIndex(boundedIndex(index, media.length))}
      onNext={() => moveBy(1)}
      onPrevious={() => moveBy(-1)}
      onRetry={() => undefined}
      presentation="wide"
      showCloseControl={false}
      style={styles.transparentSurface}
      viewState={viewState}
    />
  ) : (
    <PostMediaViewerSurface
      compactDetail={compactDetail}
      contentRevisionId={content?.id ?? null}
      currentIndex={currentIndex}
      media={media}
      onClose={viewerState.requestClose}
      onIndexChange={(index) => viewerState.setCurrentIndex(boundedIndex(index, media.length))}
      onNext={() => moveBy(1)}
      onPrevious={() => moveBy(-1)}
      onRetry={() => undefined}
      presentation="compact"
      showCloseControl={false}
      style={styles.transparentSurface}
      viewState={viewState}
    />
  );

  return (
    <View
      style={[styles.layout, wide ? styles.wideLayout : styles.mobileLayout]}
      testID="post-media-viewer-layout"
    >
      {surface}
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
  const contextRailWidth = boundedContextRailWidth(width);
  const viewerState = usePostMediaViewerState();
  const viewState: PostMediaViewerViewState = loading
    ? 'loading'
    : unavailable
      ? 'unavailable'
      : 'error';
  const secondarySurface = (
    <View style={styles.querySecondarySurface} testID="post-media-viewer-query-secondary-surface" />
  );

  const surface = wide ? (
    <PostMediaViewerSurface
      contextRail={secondarySurface}
      contextRailWidth={contextRailWidth}
      contentRevisionId={null}
      currentIndex={0}
      media={[]}
      onClose={viewerState.requestClose}
      onIndexChange={() => undefined}
      onNext={() => undefined}
      onPrevious={() => undefined}
      onRetry={onRetry ?? (() => undefined)}
      presentation="wide"
      showCloseControl={false}
      style={styles.transparentSurface}
      viewState={viewState}
    />
  ) : (
    <PostMediaViewerSurface
      compactDetail={secondarySurface}
      contentRevisionId={null}
      currentIndex={0}
      media={[]}
      onClose={viewerState.requestClose}
      onIndexChange={() => undefined}
      onNext={() => undefined}
      onPrevious={() => undefined}
      onRetry={onRetry ?? (() => undefined)}
      presentation="compact"
      showCloseControl={false}
      style={styles.transparentSurface}
      viewState={viewState}
    />
  );

  return (
    <View
      style={[styles.layout, wide ? styles.wideLayout : styles.mobileLayout]}
      testID="post-media-viewer-layout"
    >
      {surface}
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

function boundedIndex(index: number, length: number): number {
  return Math.max(0, Math.min(index, Math.max(length - 1, 0)));
}

function boundedContextRailWidth(viewportWidth: number): number {
  return Math.min(350, Math.max(320, viewportWidth * 0.25));
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

function stableCloseVisualStyle(state: PressableStateCallbackType): ViewStyle[] {
  const webState = state as PressableStateCallbackType & {
    focused?: boolean;
  };

  return [
    styles.stableCloseVisual,
    {
      ...(Platform.OS === 'web'
        ? ({ filter: 'drop-shadow(0 1px 2px rgba(0, 0, 0, 0.9))' } as unknown as ViewStyle)
        : { boxShadow: '0 1px 2px rgba(0, 0, 0, 0.9)' }),
      ...(Platform.OS === 'web' && webState.focused
        ? ({
            outlineColor: '#ffffff',
            outlineOffset: -2,
            outlineStyle: 'solid',
            outlineWidth: borderWidths[2],
          } as unknown as ViewStyle)
        : undefined),
    },
  ];
}

const styles = StyleSheet.create({
  backdrop: {
    alignItems: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    flex: 1,
    justifyContent: 'center',
  },
  backdropDismissTarget: {
    bottom: 0,
    left: 0,
    position: 'absolute',
    right: 0,
    top: 0,
  },
  dialog: {
    flex: 1,
    minHeight: 0,
    minWidth: 0,
    position: 'relative',
    width: '100%',
    zIndex: 1,
  },
  stableClose: { position: 'absolute', top: spacing.lg, zIndex: 4 },
  stableCloseCompact: { right: spacing.lg },
  stableCloseWide: { left: spacing.lg },
  stableCloseVisual: { borderRadius: radii.full },
  layout: { flex: 1, minHeight: 0, minWidth: 0 },
  transparentSurface: { backgroundColor: 'transparent' },
  mobileLayout: { flexDirection: 'column' },
  wideLayout: { flexDirection: 'row' },
  detailPanel: {
    flexShrink: 1,
    gap: spacing.sm,
    minHeight: 0,
    minWidth: 0,
  },
  wideDetailFallback: { flex: 1, minHeight: 0, minWidth: 0 },
  querySecondarySurface: { flex: 1, minHeight: 64, minWidth: 0 },
  author: { alignItems: 'center', flexDirection: 'row', gap: spacing.sm },
  bodyRegion: { flexShrink: 1, minHeight: 0, position: 'relative' },
  bodyPrivacyBoundary: { flexShrink: 1, minHeight: 0, position: 'relative' },
  bodyMeasureBoundary: {
    height: 0,
    left: 0,
    overflow: 'hidden',
    position: 'absolute',
    right: 0,
    top: 0,
  },
  bodyMeasure: { opacity: 0 },
  bodyText: { fontFamily: fontFamilies.content, ...typography.md },
  collapsedBody: { flexShrink: 1, minHeight: 0, overflow: 'hidden' },
  bodyScroll: { flexShrink: 1, minHeight: 0 },
  moreButton: {
    alignSelf: 'flex-start',
    flexShrink: 0,
    justifyContent: 'center',
    minHeight: 44,
  },
  moreText: { fontFamily: fontFamilies.ui, fontWeight: '700', ...typography.sm },
  actionBar: { borderTopWidth: 1, paddingBottom: spacing.sm, paddingTop: spacing.sm },
});
