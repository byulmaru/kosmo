import { Children, useCallback, useEffect, useRef, useState } from 'react';
import {
  Animated,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useElevation, useTheme } from '@/theme/ThemeProvider';
import { borderWidths, iconSizes, layoutRecipes, radius, space, textStyles } from '@/theme/tokens';
import { useOverlayMotion } from '@/theme/useOverlayMotion';
import { Button } from './Button';
import { getCoachmarkPosition } from './coachmarkPosition';
import { ModalSheetHost } from './ModalSheetHost';
import { useOverlayLifecycle } from './Overlay';
import type { PropsWithChildren, RefObject } from 'react';
import type { View as NativeView } from 'react-native';

export type CoachmarkProps = PropsWithChildren<{
  anchorRef: RefObject<NativeView | null>;
  description: string;
  onClose: () => void;
  onComplete: () => void;
  onExited?: () => void;
  onNext?: () => void;
  onPrevious?: () => void;
  onShown?: () => void;
  preferredFocusRef?: RefObject<NativeView | HTMLElement | null>;
  title?: string;
  visible: boolean;
}>;

type Layout = Readonly<{ height: number; width: number }>;

const MAX_WIDTH = 256;
const ARROW_SIZE = iconSizes[16];
const ARROW_HALF = ARROW_SIZE / 2;

export function Coachmark({
  anchorRef,
  children,
  description,
  onClose,
  onComplete,
  onExited,
  onNext,
  onPrevious,
  onShown,
  preferredFocusRef,
  title,
  visible,
}: CoachmarkProps) {
  const theme = useTheme();
  const elevation = useElevation();
  const actionFocusStyle =
    Platform.OS === 'web'
      ? {
          outlineOffset: -borderWidths[1],
          outlineWidth: borderWidths[1],
        }
      : undefined;
  const { height, width } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const dialogRef = useRef<NativeView>(null);
  const [anchor, setAnchor] = useState<{
    height: number;
    width: number;
    x: number;
    y: number;
  } | null>(null);
  const [bubble, setBubble] = useState<Layout>({ height: 0, width: MAX_WIDTH });
  const [shown, setShown] = useState(false);
  const targetReady = Boolean(anchorRef.current && anchor && anchor.width > 0 && anchor.height > 0);
  const overlayMotion = useOverlayMotion(visible && targetReady);
  const modalVisible = overlayMotion.mounted && targetReady;
  const presentationReady = Boolean(modalVisible && overlayMotion.entered && bubble.height > 0);
  // Web Modal focus trapping can start before measured content mounts; refocus once actions are ready.
  const focusCoachmarkAction = useCallback(
    (node: NativeView | null) => {
      if (Platform.OS === 'web' && presentationReady) {
        node?.focus();
      }
    },
    [presentationReady],
  );

  const close = () => {
    if (visible) {
      onClose();
    }
  };

  useOverlayLifecycle({
    focusScopeRef: dialogRef,
    open: modalVisible,
    onRequestClose: close,
    preferredFocusRef,
  });

  // Persistence is tied to the measured, entered presentation rather than visibility alone.
  useEffect(() => {
    if (!visible) {
      setShown(false);
      return;
    }

    if (!shown && overlayMotion.entered && targetReady && anchor && bubble.height > 0) {
      setShown(true);
      onShown?.();
    }
  }, [anchor, bubble.height, onShown, overlayMotion.entered, shown, targetReady, visible]);

  useEffect(() => {
    if (!visible && !overlayMotion.mounted) {
      onExited?.();
    }
  }, [onExited, overlayMotion.mounted, visible]);

  // Measure the live platform target after each commit; a stable ref can point to a new step target.
  useEffect(() => {
    if (!visible) {
      return;
    }

    const frame = requestAnimationFrame(() => {
      anchorRef.current?.measureInWindow((x, y, anchorWidth, anchorHeight) => {
        setAnchor((current) =>
          current?.height === anchorHeight &&
          current.width === anchorWidth &&
          current.x === x &&
          current.y === y
            ? current
            : { height: anchorHeight, width: anchorWidth, x, y },
        );
      });
    });

    return () => cancelAnimationFrame(frame);
  });

  const position =
    targetReady && anchor
      ? getCoachmarkPosition({
          anchor,
          bubble,
          viewport: {
            bottomInset: insets.bottom,
            height,
            leftInset: insets.left,
            rightInset: insets.right,
            topInset: insets.top,
            width,
          },
        })
      : null;
  const progress = Children.map(children, (child) =>
    typeof child === 'string' || typeof child === 'number' ? (
      <Text style={styles.footerLabel}>{child}</Text>
    ) : (
      child
    ),
  );
  const label = title?.trim() || description;
  const maxWidth = Math.min(
    MAX_WIDTH,
    Math.max(0, width - insets.left - insets.right - space[16] * 2),
  );

  return (
    <ModalSheetHost
      aria-hidden={!presentationReady || undefined}
      accessibilityLabel={label}
      animationType="none"
      closeRequestDisabled={!visible}
      interactionDisabled={!visible}
      navigationBarTranslucent
      onRequestClose={close}
      role="dialog"
      statusBarTranslucent
      transparent
      visible={modalVisible}
    >
      <View
        accessibilityElementsHidden={!presentationReady}
        importantForAccessibility={presentationReady ? 'auto' : 'no-hide-descendants'}
        pointerEvents={presentationReady ? 'auto' : 'none'}
        style={styles.backdrop}
      >
        <Animated.View
          pointerEvents="none"
          style={[
            StyleSheet.absoluteFill,
            {
              backgroundColor: theme.overlayScrim,
              opacity: modalVisible ? overlayMotion.progress : 0,
            },
          ]}
        />
        {position ? (
          <Animated.View
            pointerEvents={presentationReady ? 'auto' : 'none'}
            style={[
              styles.bubble,
              {
                left: position.left,
                opacity: overlayMotion.progress,
                top: position.top,
                transform: [
                  {
                    translateY: overlayMotion.progress.interpolate({
                      inputRange: [0, 1],
                      outputRange: [space[8], 0],
                    }),
                  },
                ],
                maxWidth,
              },
            ]}
          >
            <View
              pointerEvents="none"
              style={[
                styles.arrow,
                {
                  backgroundColor: theme.backgroundElevated,
                  left: position.arrowLeft - ARROW_HALF,
                },
                position.placement === 'bottom' ? styles.arrowAbove : styles.arrowBelow,
              ]}
              testID="coachmark-arrow"
            />
            <View
              accessibilityElementsHidden={!presentationReady}
              accessible={false}
              accessibilityLabel={Platform.OS === 'web' ? undefined : label}
              accessibilityViewIsModal={Platform.OS === 'web' ? undefined : true}
              aria-hidden={!presentationReady || undefined}
              importantForAccessibility={presentationReady ? 'auto' : 'no-hide-descendants'}
              onAccessibilityEscape={close}
              onLayout={({ nativeEvent }) => {
                const nextWidth = nativeEvent.layout.width;
                setBubble((current) =>
                  current.width === nextWidth ? current : { ...current, width: nextWidth },
                );
              }}
              ref={dialogRef}
              role={Platform.OS === 'web' ? undefined : 'dialog'}
              style={[
                styles.surface,
                elevation.overlay,
                {
                  backgroundColor: theme.backgroundElevated,
                  borderColor: theme.borderDefault,
                  maxHeight: Math.max(1, position.maxHeight),
                },
              ]}
              testID="coachmark-surface"
            >
              <ScrollView
                contentContainerStyle={styles.bodyContent}
                keyboardShouldPersistTaps="handled"
                onContentSizeChange={(_, contentHeight) => {
                  const nextHeight = contentHeight + space[12] + space[8] + borderWidths[1] * 2;
                  setBubble((current) =>
                    current.height === nextHeight ? current : { ...current, height: nextHeight },
                  );
                }}
                style={styles.body}
                tabIndex={0}
                testID="coachmark-body"
              >
                <View style={styles.copy}>
                  {title?.trim() ? (
                    <Text
                      accessibilityRole="header"
                      style={[styles.title, { color: theme.foregroundPrimary }]}
                    >
                      {title}
                    </Text>
                  ) : null}
                  <Text style={[styles.description, { color: theme.foregroundPrimary }]}>
                    {description}
                  </Text>
                </View>
                <View style={styles.footer}>
                  {progress?.length ? <View style={styles.progress}>{progress}</View> : null}
                  <View style={styles.actions}>
                    <Button
                      accessibilityLabel="건너뛰기"
                      disabled={!presentationReady}
                      onPress={close}
                      size="compact"
                      tone="secondary"
                      style={[styles.skip, actionFocusStyle]}
                    >
                      <Text style={styles.footerLabel}>건너뛰기</Text>
                    </Button>
                    <View style={[styles.navigation, { borderColor: theme.borderDefault }]}>
                      {onNext || onPrevious ? (
                        <Button
                          accessibilityLabel="이전"
                          disabled={!presentationReady || !onPrevious}
                          onPress={onPrevious}
                          size="compact"
                          tone="secondary"
                          style={[styles.segment, styles.previous, actionFocusStyle]}
                        >
                          <Text style={styles.controlLabel}>이전</Text>
                        </Button>
                      ) : null}
                      {onNext || onPrevious ? (
                        <View
                          accessible={false}
                          style={[styles.divider, { backgroundColor: theme.borderDefault }]}
                        />
                      ) : null}
                      <Button
                        accessibilityLabel={onNext ? '다음' : '완료'}
                        controlRef={focusCoachmarkAction}
                        disabled={!presentationReady}
                        onPress={onNext ?? onComplete}
                        size="compact"
                        tone="primary"
                        style={[
                          styles.segment,
                          styles.next,
                          actionFocusStyle,
                          !onNext && !onPrevious && styles.single,
                        ]}
                      >
                        <Text style={styles.controlLabel}>{onNext ? '다음' : '완료'}</Text>
                      </Button>
                    </View>
                  </View>
                </View>
              </ScrollView>
            </View>
          </Animated.View>
        ) : null}
        <Pressable
          accessible={false}
          disabled={!presentationReady}
          aria-hidden
          focusable={false}
          importantForAccessibility="no"
          onPress={close}
          style={[StyleSheet.absoluteFill, styles.backdropDismiss]}
          tabIndex={-1}
          testID="coachmark-backdrop"
        />
      </View>
    </ModalSheetHost>
  );
}

const styles = StyleSheet.create({
  arrow: {
    height: ARROW_SIZE,
    position: 'absolute',
    transform: [{ rotate: '45deg' }],
    width: ARROW_SIZE,
    zIndex: 1,
  },
  arrowAbove: { top: -ARROW_HALF },
  arrowBelow: { bottom: -ARROW_HALF },
  backdrop: { flex: 1, width: '100%' },
  backdropDismiss: { zIndex: 0 },
  body: { flexGrow: 0, flexShrink: 1, minHeight: 0 },
  bodyContent: { gap: space[8] },
  bubble: { position: 'absolute', zIndex: 1 },
  copy: { gap: space[8] },
  title: textStyles.uiLabelM,
  description: textStyles.uiCopyM,
  footer: {
    ...layoutRecipes.dialogActions,
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    flexWrap: 'wrap',
  },
  progress: { justifyContent: 'center', minWidth: 0 },
  actions: { ...layoutRecipes.dialogActions, alignItems: 'center', marginLeft: 'auto' },
  footerLabel: { ...textStyles.uiCopyS, lineHeight: textStyles.uiCopyM.lineHeight },
  divider: { alignSelf: 'stretch', width: borderWidths[1] },
  navigation: { flexDirection: 'row', borderWidth: borderWidths[1], borderRadius: radius[8] },
  segment: {
    borderWidth: borderWidths[0],
    borderRadius: radius[0],
    minWidth: Platform.OS === 'web' ? 36 : Platform.OS === 'android' ? 48 : 44,
    minHeight: Platform.OS === 'web' ? 24 : Platform.OS === 'android' ? 48 : 44,
    paddingHorizontal: space[4],
    paddingVertical: space[0],
  },
  previous: { borderTopLeftRadius: radius[8], borderBottomLeftRadius: radius[8] },
  next: { borderTopRightRadius: radius[8], borderBottomRightRadius: radius[8] },
  single: { borderRadius: radius[8] },
  skip: {
    backgroundColor: 'transparent',
    borderWidth: borderWidths[0],
    minWidth: 0,
    minHeight: Platform.OS === 'web' ? 24 : Platform.OS === 'android' ? 48 : 44,
    paddingHorizontal: space[4],
    paddingVertical: space[0],
  },
  surface: {
    borderRadius: radius[16],
    borderWidth: borderWidths[1],
    padding: space[12],
    paddingBottom: space[8],
    maxWidth: '100%',
  },
  controlLabel: { ...textStyles.uiLabelS, lineHeight: textStyles.uiCopyM.lineHeight },
});
