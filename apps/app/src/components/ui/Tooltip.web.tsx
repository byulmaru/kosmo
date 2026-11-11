import { cloneElement, useId, useRef, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useElevation, useTheme } from '@/theme/ThemeProvider';
import { radius, space, textStyles } from '@/theme/tokens';
import { Dropdown } from './Dropdown';
import type { RefObject } from 'react';
import type { View as NativeView } from 'react-native';
import type { TooltipProps } from './Tooltip';

export function Tooltip({ children, label }: TooltipProps) {
  const theme = useTheme();
  const elevation = useElevation();
  const tooltipId = useId();
  // Dropdown.web measures this intrinsic DOM span as its anchor.
  const triggerRef = useRef<HTMLSpanElement>(null);
  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const open = (hovered || focused) && !dismissed;
  const describedBy = children.props['aria-describedby'];
  const activeDescription = open ? [describedBy, tooltipId].filter(Boolean).join(' ') : describedBy;

  return (
    <span
      onBlurCapture={() => setFocused(false)}
      onClick={() => setDismissed(true)}
      onFocusCapture={() => {
        setDismissed(false);
        setFocused(true);
      }}
      onPointerEnter={() => {
        setDismissed(false);
        setHovered(true);
      }}
      onPointerLeave={() => setHovered(false)}
      ref={triggerRef}
      style={{ display: 'inline-flex', height: 'max-content', width: 'max-content' }}
    >
      {cloneElement(children, { 'aria-describedby': activeDescription })}
      <Dropdown
        accessibilityLabel={label}
        minWidth={0}
        onRequestClose={() => setDismissed(true)}
        open={open}
        triggerRef={triggerRef as unknown as RefObject<NativeView | null>}
        verticalPlacement="auto"
      >
        {() => (
          <div
            id={tooltipId}
            onClick={(event) => event.stopPropagation()}
            onPointerDown={(event) => event.stopPropagation()}
            role="tooltip"
            style={{ maxWidth: `calc(100vw - ${space[8] * 2}px)` }}
          >
            <View
              style={[
                styles.surface,
                { backgroundColor: theme.backgroundInverse },
                elevation.floating,
              ]}
            >
              <View pointerEvents="auto" style={styles.topBridge} />
              <View pointerEvents="auto" style={styles.bottomBridge} />
              <Text style={[textStyles.uiCopyM, { color: theme.foregroundInverse }, styles.label]}>
                {label}
              </Text>
            </View>
          </div>
        )}
      </Dropdown>
    </span>
  );
}

const bridge = {
  height: space[8],
  left: 0,
  position: 'absolute' as const,
  right: 0,
};

const styles = StyleSheet.create({
  surface: {
    alignSelf: 'flex-start',
    borderRadius: radius[8],
    maxWidth: '100%',
    overflow: 'visible',
    padding: space[8],
  },
  label: { maxWidth: 320 },
  topBridge: { ...bridge, top: -space[8] },
  bottomBridge: { ...bridge, bottom: -space[8] },
});
