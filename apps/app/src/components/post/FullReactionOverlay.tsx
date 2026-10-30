import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Platform, StyleSheet, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { FullReactionPicker } from '@/components/reaction/FullReactionPicker';
import { ModalOverlay } from '@/components/ui/ModalOverlay';
import { getBottomTabBarContentHeight } from '@/components/ui/navigationChrome';
import { OverlayPortal } from '@/components/ui/OverlayPortal';
import { breakpoints, spacing } from '@/theme/tokens';
import type React from 'react';
import type { LayoutRectangle, View as ViewType, ViewStyle } from 'react-native';
import type { FullReactionPickerOption } from '@/components/reaction/FullReactionPicker';

export type FullReactionOverlayProps = Readonly<{
  options: ReadonlyArray<FullReactionPickerOption>;
  onClose: () => void;
  onQueryChange: (query: string) => void;
  onSelect: (option: FullReactionPickerOption) => void;
  open: boolean;
  query: string;
  recentValues?: ReadonlyArray<string>;
  pendingOptionIds?: ReadonlyArray<string>;
  errorOptionIds?: ReadonlyArray<string>;
  selectedValues: ReadonlyArray<string>;
  triggerRef: TriggerRef;
}>;

type Anchor = Pick<LayoutRectangle, 'height' | 'width' | 'x' | 'y'>;
type TriggerRef = { current: ViewType | null };

export function FullReactionOverlay({
  onClose,
  onQueryChange,
  onSelect,
  open,
  options,
  pendingOptionIds = [],
  errorOptionIds = [],
  query,
  recentValues = [],
  selectedValues,
  triggerRef,
}: FullReactionOverlayProps): React.ReactElement | null {
  const insets = useSafeAreaInsets();
  const { height: viewportHeight, width: viewportWidth } = useWindowDimensions();
  const web = Platform.OS === 'web';
  const compactWeb = web && viewportWidth < breakpoints.compact;
  const [anchor, setAnchor] = useState<Anchor | null>(null);
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
    if (web) {
      requestAnimationFrame(() => triggerRef.current?.focus());
    }
  }, [onClose, triggerRef, web]);
  const restoreNativeFocus = useCallback(() => triggerRef.current?.focus(), [triggerRef]);

  // Clear the previous position before paint while the trigger is measured again.
  useLayoutEffect(() => {
    if (!web) {
      return;
    }
    setAnchor(null);
    if (open) {
      measureAnchor();
    }
  }, [measureAnchor, open, web]);

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

  if (web && (!open || !anchor)) {
    return null;
  }

  const below = anchor
    ? viewportHeight -
      insets.bottom -
      (compactWeb ? getBottomTabBarContentHeight('web') : 0) -
      (anchor.y + anchor.height)
    : 0;
  const above = anchor ? anchor.y - insets.top : 0;
  const preferredHeight = Math.min(
    compactWeb ? 420 : 624,
    Math.max(0, viewportHeight - 2 * spacing.sm),
  );
  const placement = below >= preferredHeight + spacing.xs || below >= above ? 'bottom' : 'top';
  const webHeight = Math.min(
    preferredHeight,
    Math.max(0, (placement === 'bottom' ? below : above) - spacing.xs - spacing.sm),
  );
  const minLeft = insets.left + spacing.sm;
  const maxRight = viewportWidth - insets.right - spacing.sm;
  const availableWidth = Math.max(0, maxRight - minLeft);
  const shellWidth = Math.min(compactWeb ? 288 : 360, availableWidth);
  const left = anchor ? Math.min(Math.max(anchor.x, minLeft), maxRight - shellWidth) : minLeft;
  const requestedTop = anchor
    ? placement === 'bottom'
      ? anchor.y + anchor.height + spacing.xs
      : anchor.y - webHeight - spacing.xs
    : insets.top + spacing.sm;
  const minTop = insets.top + spacing.sm;
  const maxTop = Math.max(minTop, viewportHeight - insets.bottom - webHeight - spacing.sm);
  const top = Math.min(Math.max(requestedTop, minTop), maxTop);
  const webPlacementProps: Record<string, unknown> = {
    dataSet: { placement },
    ...(web
      ? {
          onKeyDown: (event: React.KeyboardEvent<HTMLElement>) => {
            if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
              event.stopPropagation();
            }
          },
        }
      : {}),
  };
  const picker = (
    <FullReactionPicker
      onClose={close}
      onQueryChange={onQueryChange}
      onSelect={onSelect}
      options={options}
      pendingOptionIds={pendingOptionIds}
      errorOptionIds={errorOptionIds}
      presentation={web ? 'web' : 'mobile'}
      query={query}
      recentValues={recentValues}
      selectedValues={selectedValues}
      webHeight={web ? webHeight : undefined}
    />
  );
  const webPicker = <View ref={contentRef}>{picker}</View>;

  if (web) {
    return (
      <OverlayPortal>
        <View style={[styles.webRoot, webFixedPositionStyle]}>
          <View
            {...webPlacementProps}
            style={[styles.webPosition, { left, top, width: shellWidth }]}
            testID="full-reaction-overlay-position"
          >
            {webPicker}
          </View>
        </View>
      </OverlayPortal>
    );
  }

  return (
    <ModalOverlay
      accessibilityLabel="반응 선택 창"
      backdropTestID="full-reaction-overlay-backdrop"
      onDismiss={restoreNativeFocus}
      onRequestClose={close}
      presentation="sheet"
      visible={open}
    >
      {picker}
    </ModalOverlay>
  );
}

const styles = StyleSheet.create({
  webPosition: { pointerEvents: 'auto', position: 'absolute' },
  webRoot: { bottom: 0, left: 0, pointerEvents: 'box-none', right: 0, top: 0, zIndex: 5 },
});

const webFixedPositionStyle = { position: 'fixed' } as unknown as ViewStyle;
