import { useWindowDimensions, View } from 'react-native';
import { spacing } from '@/theme/tokens';
import type { ReactNode, RefObject } from 'react';
import type { View as NativeView } from 'react-native';

export type DropdownProps = {
  accessibilityLabel: string;
  children: (maxHeight: number) => ReactNode;
  onRequestClose: (reason: 'escape' | 'outside') => void;
  open: boolean;
  active?: boolean;
  triggerRef: RefObject<NativeView | null>;
  testID?: string;
  minWidth?: number;
  zIndex?: number;
  anchorInset?: number;
  viewportInset?: number;
  maxHeight?: number;
  placement?: 'overlap-end';
  horizontalPlacement?: 'after' | 'end' | 'start';
  verticalPlacement?: 'after' | 'end' | 'start';
};

export function Dropdown({
  accessibilityLabel,
  children,
  onRequestClose,
  open,
  testID,
  maxHeight = 430,
}: DropdownProps) {
  const viewport = useWindowDimensions();
  if (!open) {
    return null;
  }
  return (
    <View
      accessibilityLabel={accessibilityLabel}
      onAccessibilityEscape={() => onRequestClose('escape')}
      style={{ paddingTop: spacing.sm }}
      testID={testID}
    >
      {children(Math.min(maxHeight, viewport.height / 3))}
    </View>
  );
}
