import { useCallback } from 'react';
import { Platform, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { FullReactionPicker } from '@/components/reaction/FullReactionPicker';
import { Dropdown } from '@/components/ui/Dropdown';
import { ModalOverlay } from '@/components/ui/ModalOverlay';
import { getBottomTabBarContentHeight } from '@/components/ui/navigationChrome';
import { breakpoints, spacing } from '@/theme/tokens';
import type React from 'react';
import type { View as ViewType } from 'react-native';
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
  const { width: viewportWidth } = useWindowDimensions();
  const web = Platform.OS === 'web';
  const compactWeb = web && viewportWidth < breakpoints.compact;
  const close = useCallback(() => {
    onClose();
    if (web) {
      requestAnimationFrame(() => triggerRef.current?.focus());
    }
  }, [onClose, triggerRef, web]);
  const restoreNativeFocus = useCallback(() => triggerRef.current?.focus(), [triggerRef]);

  if (web && !open) {
    return null;
  }

  if (web) {
    const arrowKeyProps: Record<string, unknown> = {
      onKeyDown: (event: React.KeyboardEvent<HTMLElement>) => {
        if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
          event.stopPropagation();
        }
      },
    };
    return (
      <Dropdown
        accessibilityLabel="반응 선택"
        gap={spacing.xs}
        maxHeight={compactWeb ? 420 : 624}
        maxWidth={compactWeb ? 288 : 360}
        onRequestClose={close}
        open={open}
        testID="full-reaction-overlay-position"
        triggerRef={triggerRef}
        viewportInset={{
          bottom:
            insets.bottom + (compactWeb ? getBottomTabBarContentHeight('web') : 0) + spacing.sm,
          left: insets.left + spacing.sm,
          right: insets.right + spacing.sm,
          top: insets.top + spacing.sm,
        }}
        verticalPlacement="auto"
        zIndex={5}
      >
        {(maxHeight) => (
          <View {...arrowKeyProps}>
            <FullReactionPicker
              onClose={close}
              onQueryChange={onQueryChange}
              onSelect={onSelect}
              options={options}
              pendingOptionIds={pendingOptionIds}
              errorOptionIds={errorOptionIds}
              presentation="web"
              query={query}
              recentValues={recentValues}
              selectedValues={selectedValues}
              webHeight={maxHeight}
            />
          </View>
        )}
      </Dropdown>
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
      <FullReactionPicker
        onClose={close}
        onQueryChange={onQueryChange}
        onSelect={onSelect}
        options={options}
        pendingOptionIds={pendingOptionIds}
        errorOptionIds={errorOptionIds}
        presentation="mobile"
        query={query}
        recentValues={recentValues}
        selectedValues={selectedValues}
      />
    </ModalOverlay>
  );
}
