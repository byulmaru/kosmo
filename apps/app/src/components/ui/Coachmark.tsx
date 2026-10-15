import { useEffect, useRef, useState } from 'react';
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
  onNext?: () => void;
  onPrevious?: () => void;
  title?: string;
  visible: boolean;
}>;

type Layout = Readonly<{ height: number; width: number }>;

const MAX_WIDTH = 256;
const ARROW_SIZE = iconSizes[16];
const ARROW_HALF = ARROW_SIZE / 2;

// Web Modal focus trapping can start before measured content mounts; focus the primary action on mount.
const focusCoachmarkAction = (node: NativeView | null) => {
  if (Platform.OS === 'web') {
    node?.focus();
  }
};

export function Coachmark({
  anchorRef,
  children,
  description,
  onClose,
  onComplete,
  onNext,
  onPrevious,
  title,
  visible,
}: CoachmarkProps) {
  const theme = useTheme();
  const elevation = useElevation();
  const { height, width } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const overlayMotion = useOverlayMotion(visible);
  const dialogRef = useRef<NativeView>(null);
  // Keep the platform return-focus handle stable while a tour switches anchor refs.
  const returnFocusRef = useRef<NativeView>(null);
  const [anchor, setAnchor] = useState<{
    height: number;
    width: number;
    x: number;
    y: number;
  } | null>(null);
  const [bubble, setBubble] = useState<Layout>({ height: 0, width: MAX_WIDTH });

  const close = () => {
    if (visible) {
      onClose();
    }
  };

  useOverlayLifecycle({
    focusScopeRef: dialogRef,
    open: overlayMotion.mounted,
    onRequestClose: close,
    preferredFocusRef: returnFocusRef,
  });

  // Anchor measurement is the unavoidable platform layout handle for an anchored overlay.
  useEffect(() => {
    if (!visible) {
      return;
    }

    const frame = requestAnimationFrame(() => {
      returnFocusRef.current = anchorRef.current;
      anchorRef.current?.measureInWindow((x, y, anchorWidth, anchorHeight) => {
        setAnchor({ height: anchorHeight, width: anchorWidth, x, y });
      });
    });

    return () => cancelAnimationFrame(frame);
  }, [anchorRef, height, insets.bottom, insets.left, insets.right, insets.top, visible, width]);

  const position = anchor
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
  const label = title?.trim() || description;
  const maxWidth = Math.min(
    MAX_WIDTH,
    Math.max(0, width - insets.left - insets.right - space[16] * 2),
  );

  return (
    <ModalSheetHost
      accessibilityLabel={label}
      animationType="none"
      closeRequestDisabled={!visible}
      interactionDisabled={!visible}
      navigationBarTranslucent
      onRequestClose={close}
      role="dialog"
      statusBarTranslucent
      transparent
      visible={overlayMotion.mounted}
    >
      <View
        accessibilityElementsHidden={!visible}
        importantForAccessibility={visible ? 'auto' : 'no-hide-descendants'}
        pointerEvents={visible ? 'auto' : 'none'}
        style={styles.backdrop}
      >
        <Animated.View
          pointerEvents="none"
          style={[
            StyleSheet.absoluteFill,
            { backgroundColor: theme.overlayScrim, opacity: overlayMotion.progress },
          ]}
        />
        {position ? (
          <Animated.View
            pointerEvents={visible ? 'auto' : 'none'}
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
              accessibilityElementsHidden={!visible}
              accessible={false}
              accessibilityLabel={label}
              accessibilityViewIsModal
              aria-hidden={!visible || undefined}
              importantForAccessibility={visible ? 'auto' : 'no-hide-descendants'}
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
                  {children ? <View style={styles.progress}>{children}</View> : null}
                  <View style={styles.actions}>
                    <Button
                      accessibilityLabel="건너뛰기"
                      disabled={!visible}
                      onPress={close}
                      size="compact"
                      tone="secondary"
                      style={styles.skip}
                    >
                      <Text style={styles.footerLabel}>건너뛰기</Text>
                    </Button>
                    <View style={[styles.navigation, { borderColor: theme.borderDefault }]}>
                      {onNext || onPrevious ? (
                        <Button
                          accessibilityLabel="이전"
                          disabled={!visible || !onPrevious}
                          onPress={onPrevious}
                          size="compact"
                          tone="secondary"
                          style={[styles.segment, styles.previous]}
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
                        disabled={!visible}
                        onPress={onNext ?? onComplete}
                        size="compact"
                        tone="primary"
                        style={[
                          styles.segment,
                          styles.next,
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
          disabled={!visible}
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
