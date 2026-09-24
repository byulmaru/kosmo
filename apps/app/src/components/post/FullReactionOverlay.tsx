import { useCallback, useEffect, useRef, useState } from 'react';
import { Modal, Platform, Pressable, StyleSheet, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { FullReactionPicker } from '@/components/reaction/FullReactionPicker';
import { useElevation, useTheme } from '@/theme/ThemeProvider';
import { spacing } from '@/theme/tokens';
import type React from 'react';
import type { LayoutChangeEvent, LayoutRectangle, View as ViewType } from 'react-native';
import type { FullReactionPickerOption } from '@/components/reaction/FullReactionPicker';
import type { TriggerRef } from './ReactionPopover';

export type FullReactionOverlayProps = Readonly<{
  options: ReadonlyArray<FullReactionPickerOption>;
  onClose: () => void;
  onQueryChange: (query: string) => void;
  onSelect: (option: FullReactionPickerOption) => void;
  open: boolean;
  query: string;
  pendingOptionIds?: ReadonlyArray<string>;
  errorOptionIds?: ReadonlyArray<string>;
  selectedValues: ReadonlyArray<string>;
  triggerRef: TriggerRef;
}>;

type Anchor = Pick<LayoutRectangle, 'height' | 'width' | 'x' | 'y'>;

export function FullReactionOverlay({
  onClose,
  onQueryChange,
  onSelect,
  open,
  options,
  pendingOptionIds = [],
  errorOptionIds = [],
  query,
  selectedValues,
  triggerRef,
}: FullReactionOverlayProps): React.ReactElement | null {
  const theme = useTheme();
  const elevation = useElevation();
  const insets = useSafeAreaInsets();
  const { height: viewportHeight, width: viewportWidth } = useWindowDimensions();
  const web = Platform.OS === 'web';
  const [anchor, setAnchor] = useState<Anchor | null>(null);
  const [content, setContent] = useState<Pick<LayoutRectangle, 'height' | 'width'> | null>(null);
  const contentRef = useRef<ViewType>(null);

  const measureAnchor = useCallback(
    () =>
      triggerRef.current?.measureInWindow((x, y, width, height) =>
        setAnchor({ height, width, x, y }),
      ),
    [triggerRef],
  );
  const close = useCallback(() => {
    onClose();
    triggerRef.current?.focus();
  }, [onClose, triggerRef]);
  const onContentLayout = useCallback((event: LayoutChangeEvent) => {
    const { height, width } = event.nativeEvent.layout;
    setContent((current) =>
      current?.height === height && current.width === width ? current : { height, width },
    );
  }, []);

  useEffect(() => {
    if (!open) {
      return;
    }
    measureAnchor();
  }, [measureAnchor, open]);

  useEffect(() => {
    if (!web || !open) {
      return;
    }
    const onPointerDown = (event: PointerEvent) => {
      const trigger = triggerRef.current as unknown as HTMLElement | null;
      const contentElement = contentRef.current as unknown as HTMLElement | null;
      const target = event.target as Node;
      if (trigger?.contains(target) || contentElement?.contains(target)) {
        return;
      }
      close();
    };
    window.addEventListener('scroll', measureAnchor, true);
    window.addEventListener('resize', measureAnchor);
    document.addEventListener('pointerdown', onPointerDown);
    return () => {
      window.removeEventListener('scroll', measureAnchor, true);
      window.removeEventListener('resize', measureAnchor);
      document.removeEventListener('pointerdown', onPointerDown);
    };
  }, [close, measureAnchor, open, triggerRef, web]);

  if (!open) {
    return null;
  }

  const below = anchor ? viewportHeight - insets.bottom - (anchor.y + anchor.height) : 0;
  const above = anchor ? anchor.y - insets.top : 0;
  const placement = below >= (content?.height ?? 0) || below >= above ? 'bottom' : 'top';
  const minLeft = insets.left + spacing.sm;
  const maxRight = viewportWidth - insets.right - spacing.sm;
  const availableWidth = Math.max(0, maxRight - minLeft);
  const shellWidth = Math.min(content?.width ?? 360, availableWidth);
  const left = anchor ? Math.min(Math.max(anchor.x, minLeft), maxRight - shellWidth) : minLeft;
  const top = anchor
    ? placement === 'bottom'
      ? anchor.y + anchor.height + spacing.xs
      : anchor.y - (content?.height ?? 0) - spacing.xs
    : insets.top + spacing.sm;
  const webPlacementProps: Record<string, unknown> = { dataSet: { placement } };
  const picker = (
    <View onLayout={onContentLayout} ref={contentRef}>
      <FullReactionPicker
        onBackdropPress={close}
        onClose={close}
        onQueryChange={onQueryChange}
        onSelect={onSelect}
        options={options}
        pendingOptionIds={pendingOptionIds}
        errorOptionIds={errorOptionIds}
        presentation={web ? 'web' : 'mobile'}
        query={query}
        selectedValues={selectedValues}
      />
    </View>
  );

  return (
    <Modal animationType="none" onRequestClose={close} transparent visible>
      {web ? (
        <View style={styles.webRoot}>
          <View
            {...webPlacementProps}
            style={[styles.webPosition, { left, top, width: shellWidth }, elevation.floating]}
          >
            {picker}
          </View>
        </View>
      ) : (
        <View style={[styles.nativeRoot, { backgroundColor: theme.overlayScrim }]}>
          <Pressable
            accessibilityElementsHidden
            aria-hidden
            onPress={close}
            style={StyleSheet.absoluteFill}
            testID="full-reaction-overlay-backdrop"
          />
          <View style={styles.nativePicker}>{picker}</View>
        </View>
      )}
    </Modal>
  );
}

const styles = StyleSheet.create({
  nativePicker: { flex: 1 },
  nativeRoot: { flex: 1 },
  webPosition: { position: 'absolute' },
  webRoot: { flex: 1 },
});
