import { ChevronLeftIcon, ChevronRightIcon, EyeIcon, XIcon } from 'lucide-react-native';
import { Image, StyleSheet, Text, View } from 'react-native';
import { IconButton } from '@/components/ui/IconButton';
import { spacing, typography } from '@/theme/tokens';
import type { ReactNode } from 'react';
import type { PostMediaItem } from './PostMediaImage';

export type PostMediaViewerPresentation = 'compact' | 'wide';

export type PostMediaViewerViewState = 'ready' | 'sensitive' | 'loading' | 'error' | 'unavailable';

export type PostMediaViewerSurfaceProps = Readonly<{
  actionTray?: ReactNode;
  contextRail?: ReactNode;
  currentIndex: number;
  media: readonly PostMediaItem[];
  onClose: () => void;
  onNext: () => void;
  onPrevious: () => void;
  onRevealSensitive: () => void;
  presentation: PostMediaViewerPresentation;
  viewState: PostMediaViewerViewState;
}>;

export function PostMediaViewerSurface({
  actionTray,
  contextRail,
  currentIndex,
  media,
  onClose,
  onNext,
  onPrevious,
  onRevealSensitive,
  presentation,
  viewState,
}: PostMediaViewerSurfaceProps) {
  const interactive = viewState === 'ready' || viewState === 'sensitive';
  const multiple = interactive && media.length > 1;
  const currentMedia = media[currentIndex];
  const imageName = currentMedia?.altText?.trim() || `${currentIndex + 1}번째 첨부 이미지`;
  const previousDisabled = currentIndex <= 0;
  const nextDisabled = currentIndex >= media.length - 1;

  return (
    <View style={styles.surface} testID="post-media-viewer-surface">
      <View style={[styles.content, presentation === 'wide' ? styles.wideContent : null]}>
        <View style={styles.mediaPane} testID="post-media-viewer-media-pane">
          <IconButton
            accessibilityLabel="이미지 뷰어 닫기"
            onPress={() => onClose()}
            style={styles.closeButton}
            targetSize={48}
            visualSize={48}
          >
            <XIcon color="#ffffff" size={30} strokeWidth={2.5} />
          </IconButton>

          {interactive ? (
            <>
              {viewState === 'ready' && currentMedia?.url ? (
                <Image
                  accessibilityLabel={imageName}
                  accessibilityState={{ busy: false }}
                  resizeMode="contain"
                  source={{ uri: currentMedia.url }}
                  style={styles.image}
                  testID="post-media-viewer-image"
                />
              ) : null}

              {viewState === 'sensitive' ? (
                <IconButton
                  accessibilityLabel="민감한 이미지 표시"
                  accessibilityState={{ disabled: false }}
                  onPress={() => onRevealSensitive()}
                  style={styles.revealButton}
                  targetSize={48}
                  visualSize={48}
                >
                  <EyeIcon color="#ffffff" size={30} strokeWidth={2.5} />
                </IconButton>
              ) : null}

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
                    style={({ pressed }) => [
                      styles.navigationButton,
                      styles.previousButton,
                      { opacity: previousDisabled ? 0.3 : pressed ? 0.7 : 1 },
                    ]}
                    targetSize={48}
                    visualSize={48}
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
                    style={({ pressed }) => [
                      styles.navigationButton,
                      styles.nextButton,
                      { opacity: nextDisabled ? 0.3 : pressed ? 0.7 : 1 },
                    ]}
                    targetSize={48}
                    visualSize={48}
                  >
                    <ChevronRightIcon color="#ffffff" size={30} strokeWidth={2.5} />
                  </IconButton>
                </>
              ) : null}

              <Text
                accessibilityLiveRegion="polite"
                role="status"
                style={styles.screenReaderOnly}
                testID="post-media-viewer-position"
              >
                {`${currentIndex + 1} / ${media.length}`}
              </Text>
              {multiple ? (
                <Text aria-hidden style={styles.counter} testID="post-media-viewer-counter">
                  {`${currentIndex + 1} / ${media.length}`}
                </Text>
              ) : null}
            </>
          ) : (
            <View accessibilityLiveRegion="polite" style={styles.status}>
              <Text style={styles.statusText}>
                {viewState === 'loading'
                  ? '이미지를 불러오는 중입니다.'
                  : viewState === 'error'
                    ? '이미지를 불러오지 못했습니다.'
                    : '이미지를 더 이상 표시할 수 없습니다.'}
              </Text>
            </View>
          )}
        </View>

        {interactive && presentation === 'wide' && contextRail != null ? (
          <View style={styles.contextRail} testID="post-media-viewer-context-rail">
            {contextRail}
          </View>
        ) : null}
      </View>

      {interactive && presentation === 'compact' && actionTray != null ? (
        <View style={styles.actionTray} testID="post-media-viewer-action-tray">
          {actionTray}
        </View>
      ) : null}
    </View>
  );
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
    backgroundColor: '#000000',
    flex: 1,
    justifyContent: 'center',
    minHeight: 0,
    minWidth: 0,
    position: 'relative',
  },
  image: { height: '100%', width: '100%' },
  closeButton: { left: spacing.sm, position: 'absolute', top: spacing.sm, zIndex: 1 },
  navigationButton: { marginTop: -24, position: 'absolute', top: '50%' },
  previousButton: { left: spacing.sm },
  nextButton: { right: spacing.sm },
  revealButton: { position: 'absolute' },
  counter: {
    bottom: spacing.sm,
    color: '#ffffff',
    fontFamily: 'SUIT',
    left: 0,
    position: 'absolute',
    right: 0,
    textAlign: 'center',
    ...typography.sm,
  },
  screenReaderOnly: { height: 1, opacity: 0, position: 'absolute', width: 1 },
  status: { alignItems: 'center', justifyContent: 'center', padding: spacing.lg },
  statusText: { color: '#ffffff', fontFamily: 'SUIT', ...typography.sm },
  actionTray: { backgroundColor: '#000000', height: 56 },
  contextRail: { alignSelf: 'stretch', minHeight: 0, minWidth: 0 },
});
