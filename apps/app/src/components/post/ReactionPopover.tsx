import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  useWindowDimensions,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '@/theme/ThemeProvider';
import { radii, shadow, spacing } from '@/theme/tokens';
import type { ReactNode, Ref } from 'react';
import type { LayoutChangeEvent, LayoutRectangle, View as ViewType } from 'react-native';

export type ReactionPopoverProps = Readonly<{
  accessibilityLabel: string;
  children: ReactNode;
  disabled?: boolean;
  onOpenChange: (open: boolean) => void;
  open: boolean;
  renderTrigger: (props: {
    expanded: boolean;
    onPress: () => void;
    ref: Ref<ViewType>;
  }) => ReactNode;
}>;

type Anchor = Pick<LayoutRectangle, 'height' | 'width' | 'x' | 'y'>;

export function ReactionPopover({
  accessibilityLabel,
  children,
  disabled = false,
  onOpenChange,
  open,
  renderTrigger,
}: ReactionPopoverProps): ReactNode {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const { height: viewportHeight, width: viewportWidth } = useWindowDimensions();
  const triggerRef = useRef<ViewType>(null);
  const contentRef = useRef<ViewType>(null);
  const [anchor, setAnchor] = useState<Anchor | null>(null);
  const [content, setContent] = useState<Pick<LayoutRectangle, 'height' | 'width'> | null>(null);
  const web = Platform.OS === 'web';
  const measureAnchor = useCallback(
    () =>
      triggerRef.current?.measureInWindow((x, y, width, height) =>
        setAnchor({ height, width, x, y }),
      ),
    [],
  );
  const dismiss = useCallback(
    (restoreFocus = true) => {
      onOpenChange(false);
      if (restoreFocus) {
        triggerRef.current?.focus();
      }
    },
    [onOpenChange],
  );
  const toggle = useCallback(() => {
    if (!disabled) {
      if (!open) {
        measureAnchor();
      }
      onOpenChange(!open);
    }
  }, [disabled, measureAnchor, onOpenChange, open]);
  const onContentLayout = useCallback((event: LayoutChangeEvent) => {
    const { height, width } = event.nativeEvent.layout;
    setContent((current) =>
      current?.height === height && current.width === width ? current : { height, width },
    );
  }, []);

  useEffect(() => {
    if (!web || !open) {
      return;
    }
    const focusFirstOption = () =>
      (contentRef.current as unknown as HTMLElement | null)
        ?.querySelector<HTMLElement>('[role="button"]')
        ?.focus();
    const onPointerDown = (event: PointerEvent) => {
      const trigger = triggerRef.current as unknown as HTMLElement | null;
      const contentElement = contentRef.current as unknown as HTMLElement | null;
      if (
        !trigger?.contains(event.target as Node) &&
        !contentElement?.contains(event.target as Node)
      ) {
        dismiss(false);
      }
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        dismiss();
      }
    };
    focusFirstOption();
    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    window.addEventListener('scroll', measureAnchor, true);
    window.addEventListener('resize', measureAnchor);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('scroll', measureAnchor, true);
      window.removeEventListener('resize', measureAnchor);
    };
  }, [dismiss, measureAnchor, open, web]);

  const below = anchor ? viewportHeight - insets.bottom - (anchor.y + anchor.height) : 0;
  const above = anchor ? anchor.y - insets.top : 0;
  const placement = below >= (content?.height ?? 0) || below >= above ? 'bottom' : 'top';
  const minLeft = insets.left + spacing.sm;
  const maxRight = viewportWidth - insets.right - spacing.sm;
  const availableWidth = Math.max(0, maxRight - minLeft);
  const shellWidth = Math.min(content?.width ?? availableWidth, availableWidth);
  const left = anchor ? Math.min(Math.max(anchor.x, minLeft), maxRight - shellWidth) : minLeft;
  const top = anchor
    ? placement === 'bottom'
      ? anchor.y + anchor.height + spacing.xs
      : anchor.y - (content?.height ?? 0) - spacing.xs
    : insets.top + spacing.sm;

  return (
    <>
      <>{renderTrigger({ expanded: open, onPress: toggle, ref: triggerRef })}</>
      {open ? (
        <Modal
          accessibilityLabel={accessibilityLabel}
          animationType={web ? 'none' : 'fade'}
          onRequestClose={() => dismiss()}
          role="dialog"
          transparent
          visible
        >
          <View style={styles.backdrop}>
            <Pressable
              accessible={false}
              aria-hidden
              importantForAccessibility="no"
              onPress={() => dismiss()}
              style={StyleSheet.absoluteFill}
              testID="reaction-popover-backdrop"
            />
            <View
              accessibilityViewIsModal
              data-placement={placement}
              onAccessibilityEscape={() => dismiss()}
              style={[styles.position, { left, pointerEvents: 'box-none', top, width: shellWidth }]}
            >
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                style={[styles.shell, { backgroundColor: theme.card, borderColor: theme.border }]}
              >
                <View onLayout={onContentLayout} ref={contentRef} style={styles.content}>
                  {children}
                </View>
              </ScrollView>
            </View>
          </View>
        </Modal>
      ) : null}
    </>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1 },
  content: { alignSelf: 'flex-start' },
  position: { position: 'absolute' },
  shell: { borderRadius: radii.lg, borderWidth: 1, ...shadow },
});
