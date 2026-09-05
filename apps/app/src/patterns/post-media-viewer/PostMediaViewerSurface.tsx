import { ChevronLeftIcon, ChevronRightIcon, XIcon } from 'lucide-react-native';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import { PostContentPrivacyBoundary } from '@/components/post/PostContentPrivacyBoundary';
import { IconButton } from '@/components/ui/IconButton';
import { useToast } from '@/components/ui/ToastProvider';
import { useReducedMotion, useTheme } from '@/theme/ThemeProvider';
import { borderWidths, radius, space, textStyles } from '@/theme/tokens';
import type { ReactElement } from 'react';
import type { PressableStateCallbackType, ViewStyle } from 'react-native';
import type { PostMediaItem } from '@/components/post/PostMediaImage';

export type PostMediaViewerPresentation = 'compact' | 'wide';

export type PostMediaViewerViewState = 'ready' | 'loading' | 'error' | 'unavailable';

export type PostMediaViewerSurfaceProps = Readonly<{
  currentIndex: number;
  media: readonly PostMediaItem[];
  onClose: () => void;
  onNext: () => void;
  onPrevious: () => void;
  onRetry: () => void;
}> &
  (
    | Readonly<{
        compactDetail?: never;
        contextRail: ReactElement;
        presentation: 'wide';
        viewState: PostMediaViewerViewState;
      }>
    | Readonly<{
        compactDetail: ReactElement;
        contextRail?: never;
        presentation: 'compact';
        viewState: PostMediaViewerViewState;
      }>
  );

const statusCopy = {
  error: {
    body: '네트워크 상태를 확인한 뒤 다시 시도해 주세요.',
    title: '미디어를 불러오지 못했어요',
  },
  loading: { body: '잠시만 기다려 주세요.', title: '미디어를 불러오는 중' },
  unavailable: {
    body: '삭제되었거나 접근할 수 없는 미디어입니다.',
    title: '이 미디어를 볼 수 없어요',
  },
} as const;

export function PostMediaViewerSurface({
  compactDetail,
  contextRail,
  currentIndex,
  media,
  onClose,
  onNext,
  onPrevious,
  onRetry,
  presentation,
  viewState,
}: PostMediaViewerSurfaceProps) {
  const theme = useTheme();
  const reducedMotion = useReducedMotion();
  const { height: viewportHeight } = useWindowDimensions();
  const navigable = viewState === 'ready';
  const multiple = navigable && media.length > 1;
  const currentMedia = media[currentIndex];
  const imageName = currentMedia?.altText?.trim() || `${currentIndex + 1}번째 첨부 이미지`;
  const previousDisabled = currentIndex <= 0;
  const nextDisabled = currentIndex >= media.length - 1;
  const status = viewState === 'ready' ? null : statusCopy[viewState];

  return (
    <View style={styles.surface} testID="post-media-viewer-surface">
      <View style={[styles.content, presentation === 'wide' ? styles.wideContent : undefined]}>
        <View style={styles.mediaPane} testID="post-media-viewer-media-pane">
          <View
            style={[
              styles.mediaViewport,
              presentation === 'compact' ? styles.compactMediaViewport : styles.wideMediaViewport,
            ]}
            testID="post-media-viewer-media-viewport"
          >
            {viewState === 'ready' && currentMedia?.url ? (
              <PostContentPrivacyBoundary
                style={styles.imagePrivacyBoundary}
                testID="post-media-viewer-image-privacy-boundary"
              >
                <ViewerImage
                  key={JSON.stringify([currentMedia.id, currentMedia.url])}
                  accessibilityLabel={imageName}
                  url={currentMedia.url}
                />
              </PostContentPrivacyBoundary>
            ) : null}
          </View>

          {status ? (
            <View
              accessibilityLiveRegion={viewState === 'error' ? 'assertive' : 'polite'}
              role="status"
              style={styles.status}
            >
              {viewState === 'loading' ? (
                reducedMotion ? (
                  <Text
                    accessible={false}
                    aria-hidden
                    style={styles.loadingFallback}
                    testID="post-media-viewer-loading-fallback"
                  >
                    ···
                  </Text>
                ) : (
                  <ActivityIndicator
                    accessible={false}
                    aria-hidden
                    color="#ffffff"
                    size={40}
                    testID="post-media-viewer-loading-indicator"
                  />
                )
              ) : null}
              <Text accessibilityRole="header" style={styles.statusTitle}>
                {status.title}
              </Text>
              <Text style={styles.statusBody}>{status.body}</Text>
              {viewState === 'error' ? (
                <StatusAction accessibleName="다시 시도" label="다시 시도" onActivate={onRetry} />
              ) : null}
            </View>
          ) : null}

          <IconButton
            accessibilityLabel="이미지 뷰어 닫기"
            onPress={() => onClose()}
            style={[
              styles.closeButton,
              presentation === 'compact' ? styles.compactCloseButton : styles.wideCloseButton,
            ]}
            targetSize={48}
            visualSize={48}
            visualStyle={controlVisualStyle(false)}
          >
            <XIcon color="#ffffff" size={30} strokeWidth={2.5} />
          </IconButton>

          {multiple ? (
            <>
              <IconButton
                accessibilityLabel="이전 이미지"
                accessibilityState={{ disabled: previousDisabled }}
                disabled={previousDisabled}
                onPress={() => {
                  if (!previousDisabled) {
                    onPrevious();
                  }
                }}
                style={[styles.navigationButton, styles.previousButton]}
                targetSize={48}
                visualSize={48}
                visualStyle={controlVisualStyle(previousDisabled)}
              >
                <ChevronLeftIcon color="#ffffff" size={30} strokeWidth={2.5} />
              </IconButton>
              <IconButton
                accessibilityLabel="다음 이미지"
                accessibilityState={{ disabled: nextDisabled }}
                disabled={nextDisabled}
                onPress={() => {
                  if (!nextDisabled) {
                    onNext();
                  }
                }}
                style={[styles.navigationButton, styles.nextButton]}
                targetSize={48}
                visualSize={48}
                visualStyle={controlVisualStyle(nextDisabled)}
              >
                <ChevronRightIcon color="#ffffff" size={30} strokeWidth={2.5} />
              </IconButton>
            </>
          ) : null}

          {navigable ? (
            <>
              <Text
                accessibilityLiveRegion="polite"
                role="status"
                style={styles.screenReaderOnly}
                testID="post-media-viewer-position"
              >
                {`${currentIndex + 1} / ${media.length}`}
              </Text>
              {multiple ? (
                <View
                  aria-hidden
                  style={styles.counterPosition}
                  testID="post-media-viewer-counter-position"
                >
                  <Text aria-hidden style={styles.counter} testID="post-media-viewer-counter">
                    {`${currentIndex + 1} / ${media.length}`}
                  </Text>
                </View>
              ) : null}
            </>
          ) : null}
        </View>

        {presentation === 'wide' && contextRail != null ? (
          <View style={styles.contextRail} testID="post-media-viewer-context-rail">
            {contextRail}
          </View>
        ) : null}
      </View>

      {presentation === 'compact' ? (
        <View
          style={[
            styles.compactDetail,
            {
              backgroundColor: theme.backgroundCanvas,
              maxHeight: Math.min(240, Math.max(192, viewportHeight * 0.32)),
            },
          ]}
          testID="post-media-viewer-compact-detail"
        >
          {compactDetail}
        </View>
      ) : null}
    </View>
  );
}

function ViewerImage({
  accessibilityLabel,
  url,
}: Readonly<{
  accessibilityLabel: string;
  url: string;
}>) {
  const { showToast } = useToast();
  const [generation, setGeneration] = useState(0);
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const request = useRef({ active: true, generation: 0 });

  useEffect(() => {
    request.current.active = true;
    return () => {
      request.current.active = false;
    };
  }, []);

  useEffect(() => {
    if (status !== 'error') {
      return;
    }
    return showToast('미디어를 불러오지 못했어요', {
      tone: 'danger',
      persistent: true,
      action: {
        label: '다시 시도',
        onPress: () => {
          if (!request.current.active) {
            return;
          }
          request.current.generation += 1;
          setGeneration(request.current.generation);
          setStatus('loading');
        },
      },
    });
  }, [showToast, status]);

  const settle = useCallback(
    (next: 'loading' | 'ready' | 'error') => {
      if (request.current.active && request.current.generation === generation) {
        setStatus(next);
      }
    },
    [generation],
  );
  const handleError = useCallback(() => settle('error'), [settle]);
  const handleLoad = useCallback(() => settle('ready'), [settle]);
  const handleLoadStart = useCallback(() => settle('loading'), [settle]);

  return (
    <Image
      key={generation}
      accessibilityLabel={accessibilityLabel}
      accessibilityRole="image"
      accessibilityState={{ busy: status === 'loading' }}
      onError={handleError}
      onLoad={handleLoad}
      onLoadStart={handleLoadStart}
      resizeMode="contain"
      source={{ uri: url }}
      style={styles.image}
      testID="post-media-viewer-image"
    />
  );
}

function StatusAction({
  accessibleName,
  label,
  onActivate,
}: Readonly<{ accessibleName: string; label: string; onActivate: () => void }>) {
  const targetHeight = Platform.OS === 'ios' ? 44 : Platform.OS === 'android' ? 48 : 40;

  return (
    <Pressable
      accessibilityLabel={accessibleName}
      accessibilityRole="button"
      onPress={() => onActivate()}
      style={(state) => {
        const webState = state as PressableStateCallbackType & {
          focused?: boolean;
        };
        return [
          styles.statusActionTarget,
          { height: targetHeight },
          Platform.OS === 'web' && webState.focused
            ? ({
                outlineColor: '#000000',
                outlineOffset: -2,
                outlineStyle: 'solid',
                outlineWidth: borderWidths[2],
              } as unknown as ViewStyle)
            : undefined,
        ];
      }}
    >
      {(state) => {
        const webState = state as PressableStateCallbackType & { hovered?: boolean };
        return (
          <View
            style={[
              styles.statusActionVisual,
              {
                backgroundColor: state.pressed
                  ? '#e4e4e7'
                  : webState.hovered
                    ? '#f4f4f5'
                    : '#ffffff',
              },
            ]}
          >
            <Text style={styles.statusActionLabel}>{label}</Text>
          </View>
        );
      }}
    </Pressable>
  );
}

function controlVisualStyle(disabled: boolean) {
  return (state: PressableStateCallbackType): ViewStyle[] => {
    const webState = state as PressableStateCallbackType & {
      focused?: boolean;
      hovered?: boolean;
    };

    return [
      styles.controlVisual,
      {
        backgroundColor: state.pressed
          ? 'rgba(255, 255, 255, 0.24)'
          : webState.hovered
            ? 'rgba(255, 255, 255, 0.16)'
            : 'transparent',
        ...(Platform.OS === 'web'
          ? ({ filter: 'drop-shadow(0 1px 2px rgba(0, 0, 0, 0.9))' } as unknown as ViewStyle)
          : { boxShadow: '0 1px 2px rgba(0, 0, 0, 0.9)' }),
        opacity: disabled ? 0.35 : 1,
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
  };
}

const styles = StyleSheet.create({
  surface: {
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    flex: 1,
    minHeight: 0,
    minWidth: 0,
  },
  content: { flex: 1, minHeight: 0, minWidth: 0 },
  wideContent: { flexDirection: 'row' },
  mediaPane: {
    alignItems: 'center',
    flex: 1,
    justifyContent: 'center',
    minHeight: 0,
    minWidth: 0,
    position: 'relative',
  },
  mediaViewport: {
    alignItems: 'center',
    borderRadius: radius[8],
    justifyContent: 'center',
    overflow: 'hidden',
  },
  compactMediaViewport: {
    bottom: space[16],
    left: space[16],
    position: 'absolute',
    right: space[16],
    top: 80,
  },
  wideMediaViewport: {
    aspectRatio: 4 / 3,
    maxHeight: 420,
    maxWidth: 560,
    width: '100%',
  },
  image: {
    bottom: 0,
    height: '100%',
    left: 0,
    position: 'absolute',
    right: 0,
    top: 0,
    width: '100%',
  },
  imagePrivacyBoundary: { height: '100%', width: '100%' },
  closeButton: { position: 'absolute', top: space[16], zIndex: 2 },
  compactCloseButton: { right: space[16] },
  wideCloseButton: { left: space[16] },
  navigationButton: { marginTop: -24, position: 'absolute', top: '50%', zIndex: 2 },
  previousButton: { left: space[8] },
  nextButton: { right: space[8] },
  controlVisual: {
    borderRadius: radius.full,
  },
  counterPosition: {
    alignItems: 'center',
    left: 0,
    position: 'absolute',
    right: 0,
    top: space[16],
  },
  counter: {
    backgroundColor: '#000000',
    borderRadius: radius[16],
    color: '#ffffff',
    height: 30,
    minWidth: 54,
    paddingHorizontal: space[12],
    paddingVertical: 5,
    textAlign: 'center',
    ...textStyles.uiLabelM,
  },
  screenReaderOnly: { height: 1, opacity: 0, position: 'absolute', width: 1 },
  loadingFallback: { color: '#ffffff', ...textStyles.uiLabelL },
  status: {
    alignItems: 'center',
    bottom: 0,
    justifyContent: 'center',
    left: 0,
    padding: space[24],
    position: 'absolute',
    right: 0,
    top: 0,
  },
  statusTitle: {
    color: '#ffffff',
    marginTop: space[8],
    textAlign: 'center',
    ...textStyles.uiLabelL,
  },
  statusBody: {
    color: 'rgba(255, 255, 255, 0.72)',
    marginTop: space[4],
    textAlign: 'center',
    ...textStyles.uiCopyM,
  },
  statusActionTarget: {
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: space[16],
    width: 104,
  },
  statusActionVisual: {
    alignItems: 'center',
    borderRadius: radius[12],
    height: 40,
    justifyContent: 'center',
    width: 104,
  },
  statusActionLabel: { color: '#000000', ...textStyles.uiLabelM },
  compactDetail: {
    flexShrink: 0,
    minWidth: 0,
    paddingBottom: space[8],
    paddingHorizontal: space[16],
    paddingTop: space[12],
  },
  contextRail: { alignSelf: 'stretch', minHeight: 0, minWidth: 0, width: 346 },
});
