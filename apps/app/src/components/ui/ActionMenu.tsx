import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import {
  Animated,
  Modal,
  PanResponder,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ActionMenuPortal } from '@/components/ui/ActionMenuPortal';
import { useElevation, useTheme } from '@/theme/ThemeProvider';
import { borderWidths, iconSizes, radius, space, textStyles } from '@/theme/tokens';
import { useOverlayMotion } from '@/theme/useOverlayMotion';
import type { ComponentType, ReactNode, Ref } from 'react';

type ActionMenuIcon = ComponentType<{
  color: string;
  size: number;
  strokeWidth?: number;
}>;

export type ActionMenuItem = Readonly<{
  accessibilityLabel?: string;
  icon?: ActionMenuIcon;
  key: string;
  label: string;
  onSelect: () => void;
  tone?: 'default' | 'danger';
}>;

export type ActionMenuTriggerRenderProps = Readonly<{
  disabled: boolean;
  expanded: boolean;
  focusTrigger: () => void;
  onPress: () => void;
  ref: Ref<View>;
}>;

type Props = {
  accessibilityLabel: string;
  disabled?: boolean;
  items: readonly ActionMenuItem[];
  renderTrigger: (props: ActionMenuTriggerRenderProps) => ReactNode;
  webHorizontalPlacement?: 'start' | 'end';
};

const webMenuInset = space[4] + borderWidths[1];
const webMenuItemHeight = 36;
const webMenuMinWidth = 128;

export function ActionMenu({
  accessibilityLabel,
  disabled = false,
  items,
  renderTrigger,
  webHorizontalPlacement = 'start',
}: Props): ReactNode {
  const theme = useTheme();
  const elevation = useElevation();
  const insets = useSafeAreaInsets();
  const controlRef = useRef<View>(null);
  const menuRef = useRef<View>(null);
  const pendingSelectionRef = useRef<(() => void) | null>(null);
  const triggerRef = useRef<View>(null);
  const [hoveredWebItemKey, setHoveredWebItemKey] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [webPosition, setWebPosition] = useState({ left: 0, top: 0 });
  const web = Platform.OS === 'web';
  const overlayMotion = useOverlayMotion(open);

  const positionWebMenu = useCallback(() => {
    const trigger = triggerRef.current as unknown as HTMLElement | null;
    if (!web || !trigger) {
      return;
    }

    const ownerWindow = trigger.ownerDocument.defaultView;
    if (!ownerWindow) {
      return;
    }

    const triggerRect = trigger.getBoundingClientRect();
    const menu = menuRef.current as unknown as HTMLElement | null;
    const menuRect = menu?.getBoundingClientRect();
    const menuWidth = menuRect?.width ?? webMenuMinWidth;
    const menuHeight = menuRect?.height ?? items.length * webMenuItemHeight + webMenuInset * 2;
    const viewportWidth = trigger.ownerDocument.documentElement.clientWidth;
    const viewportHeight = trigger.ownerDocument.documentElement.clientHeight;
    const anchoredLeft =
      webHorizontalPlacement === 'end'
        ? triggerRect.right + webMenuInset - menuWidth
        : triggerRect.left - webMenuInset;
    const viewportLeft = Math.max(0, Math.min(anchoredLeft, viewportWidth - menuWidth));
    const viewportTop = Math.max(
      0,
      Math.min(triggerRect.top - webMenuInset, viewportHeight - menuHeight),
    );
    const nextPosition = {
      left: viewportLeft + ownerWindow.scrollX,
      top: viewportTop + ownerWindow.scrollY,
    };

    setWebPosition((current) =>
      current.left === nextPosition.left && current.top === nextPosition.top
        ? current
        : nextPosition,
    );
  }, [items.length, web, webHorizontalPlacement]);

  const focusTrigger = useCallback(() => {
    triggerRef.current?.focus();
  }, []);
  const dismiss = useCallback(
    (restoreFocus = true) => {
      setHoveredWebItemKey(null);
      setOpen(false);
      if (restoreFocus) {
        focusTrigger();
      }
    },
    [focusTrigger],
  );
  const toggle = useCallback(() => {
    if (!disabled) {
      setHoveredWebItemKey(null);
      setOpen((value) => {
        if (!value) {
          positionWebMenu();
        }
        return !value;
      });
    }
  }, [disabled, positionWebMenu]);
  const select = useCallback(
    (item: ActionMenuItem) => {
      if (web) {
        item.onSelect();
        dismiss();
        return;
      }

      if (pendingSelectionRef.current) {
        return;
      }

      pendingSelectionRef.current = item.onSelect;
      dismiss(false);
    },
    [dismiss, web],
  );

  useEffect(() => {
    if (web || open || overlayMotion.mounted) {
      return;
    }

    const onSelect = pendingSelectionRef.current;
    if (!onSelect) {
      return;
    }

    pendingSelectionRef.current = null;
    focusTrigger();
    onSelect();
  }, [focusTrigger, open, overlayMotion.mounted, web]);

  const sheetDismissResponder = useMemo(
    () =>
      PanResponder.create({
        onMoveShouldSetPanResponder: (_event, gesture) =>
          gesture.dy > 8 && Math.abs(gesture.dy) > Math.abs(gesture.dx),
        onPanResponderRelease: (_event, gesture) => {
          if (gesture.dy >= 56 || gesture.vy >= 0.5) {
            dismiss();
          }
        },
      }),
    [dismiss],
  );

  useLayoutEffect(() => {
    if (!web || !open || !overlayMotion.mounted) {
      return;
    }

    positionWebMenu();
    window.addEventListener('resize', positionWebMenu);
    document.addEventListener('scroll', positionWebMenu, true);
    return () => {
      window.removeEventListener('resize', positionWebMenu);
      document.removeEventListener('scroll', positionWebMenu, true);
    };
  }, [open, overlayMotion.mounted, positionWebMenu, web]);

  useEffect(() => {
    if (!web || !open || !overlayMotion.mounted) {
      return;
    }

    const menu = menuRef.current as unknown as HTMLElement | null;
    const focusItem = (index: number) => {
      const menuItems = Array.from(menu?.querySelectorAll<HTMLElement>('[role="menuitem"]') ?? []);
      menuItems[index]?.focus();
    };
    const focusNextToTrigger = (backward: boolean) => {
      const trigger = triggerRef.current as unknown as HTMLElement | null;
      const ownerDocument = trigger?.ownerDocument;
      if (!trigger || !ownerDocument) {
        dismiss(false);
        return;
      }

      const focusableElements = Array.from(
        ownerDocument.querySelectorAll<HTMLElement>(
          'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
        ),
      ).filter((element) => {
        const elementStyle = ownerDocument.defaultView?.getComputedStyle(element);
        return (
          !menu?.contains(element) &&
          element.getAttribute('aria-hidden') !== 'true' &&
          elementStyle?.display !== 'none' &&
          elementStyle?.visibility !== 'hidden'
        );
      });
      const triggerIndex = focusableElements.indexOf(trigger);
      const nextElement = focusableElements[triggerIndex + (backward ? -1 : 1)];

      dismiss(false);
      (nextElement ?? trigger).focus();
    };
    const onPointerDown = (event: PointerEvent) => {
      const control = controlRef.current as unknown as HTMLElement | null;
      if (!control?.contains(event.target as Node) && !menu?.contains(event.target as Node)) {
        dismiss(false);
      }
    };
    const onFocusIn = (event: FocusEvent) => {
      const control = controlRef.current as unknown as HTMLElement | null;
      if (!control?.contains(event.target as Node) && !menu?.contains(event.target as Node)) {
        dismiss(false);
      }
    };
    const onKeyDown = (event: KeyboardEvent) => {
      const menuItems = Array.from(menu?.querySelectorAll<HTMLElement>('[role="menuitem"]') ?? []);
      const activeIndex = menuItems.indexOf(document.activeElement as HTMLElement);
      if (event.key === 'Escape') {
        event.preventDefault();
        dismiss();
        return;
      }
      if (menuItems.length === 0) {
        return;
      }
      if (event.key === 'Tab' && activeIndex >= 0) {
        const staysInsideMenu = event.shiftKey
          ? activeIndex > 0
          : activeIndex < menuItems.length - 1;
        if (!staysInsideMenu) {
          event.preventDefault();
          focusNextToTrigger(event.shiftKey);
        }
      } else if (event.key === 'ArrowDown') {
        event.preventDefault();
        focusItem((activeIndex + 1 + menuItems.length) % menuItems.length);
      } else if (event.key === 'ArrowUp') {
        event.preventDefault();
        focusItem((activeIndex - 1 + menuItems.length) % menuItems.length);
      } else if (event.key === 'Home') {
        event.preventDefault();
        focusItem(0);
      } else if (event.key === 'End') {
        event.preventDefault();
        focusItem(menuItems.length - 1);
      }
    };

    focusItem(0);
    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('focusin', onFocusIn);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('focusin', onFocusIn);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [dismiss, open, overlayMotion.mounted, web]);

  if (web) {
    return (
      <View ref={controlRef} style={styles.control}>
        {renderTrigger({
          disabled,
          expanded: open,
          focusTrigger,
          onPress: toggle,
          ref: triggerRef,
        })}
        {overlayMotion.mounted ? (
          <ActionMenuPortal>
            <View style={[styles.webPosition, webPosition]}>
              <Animated.View
                accessibilityLabel={accessibilityLabel}
                accessibilityElementsHidden={!open}
                aria-hidden={!open || undefined}
                ref={menuRef}
                role="menu"
                pointerEvents={open ? 'auto' : 'none'}
                style={[
                  styles.webMenu,
                  elevation.floating,
                  {
                    backgroundColor: theme.backgroundElevated,
                    borderColor: theme.borderDefault,
                    opacity: overlayMotion.progress,
                    transform: [
                      {
                        translateY: overlayMotion.progress.interpolate({
                          inputRange: [0, 1],
                          outputRange: [8, 0],
                        }),
                      },
                    ],
                  },
                ]}
              >
                {items.map((item, index) => {
                  const Icon = item.icon;
                  const itemColor =
                    item.tone === 'danger' ? theme.feedbackDangerOnSubtle : theme.foregroundPrimary;
                  return (
                    <Pressable
                      accessibilityLabel={item.accessibilityLabel ?? item.label}
                      key={item.key}
                      onHoverIn={() => setHoveredWebItemKey(item.key)}
                      onHoverOut={() =>
                        setHoveredWebItemKey((current) => (current === item.key ? null : current))
                      }
                      onPress={() => select(item)}
                      role="menuitem"
                      style={({ pressed }) => [
                        styles.item,
                        styles.webItem,
                        index > 0
                          ? {
                              borderTopColor: theme.borderSubtle,
                              borderTopWidth: borderWidths[1],
                            }
                          : undefined,
                        pressed
                          ? { backgroundColor: theme.statePressed }
                          : hoveredWebItemKey === item.key
                            ? { backgroundColor: theme.stateHover }
                            : undefined,
                      ]}
                    >
                      {index === 0 ? (
                        <View accessible={false} aria-hidden style={styles.webFirstItemHitArea} />
                      ) : null}
                      {Icon ? (
                        <View accessible={false} aria-hidden style={styles.webIcon}>
                          <Icon color={itemColor} size={iconSizes[18]} strokeWidth={2} />
                        </View>
                      ) : null}
                      <Text style={[styles.label, styles.webLabel, { color: itemColor }]}>
                        {item.label}
                      </Text>
                    </Pressable>
                  );
                })}
              </Animated.View>
            </View>
          </ActionMenuPortal>
        ) : null}
      </View>
    );
  }

  return (
    <>
      {renderTrigger({
        disabled,
        expanded: open,
        focusTrigger,
        onPress: toggle,
        ref: triggerRef,
      })}
      <Modal
        accessibilityLabel={accessibilityLabel}
        animationType="none"
        onRequestClose={() => dismiss()}
        role="dialog"
        transparent
        visible={overlayMotion.mounted}
      >
        <View style={styles.backdrop}>
          <Animated.View
            pointerEvents="none"
            style={[
              StyleSheet.absoluteFill,
              { backgroundColor: theme.overlayScrim, opacity: overlayMotion.progress },
            ]}
          />
          <Pressable
            accessible={false}
            aria-hidden
            importantForAccessibility="no"
            onPress={() => dismiss()}
            style={StyleSheet.absoluteFill}
          />
          <Animated.View
            accessibilityLabel={accessibilityLabel}
            accessibilityRole="menu"
            accessibilityViewIsModal
            onAccessibilityEscape={() => dismiss()}
            style={[
              styles.sheet,
              elevation.overlay,
              {
                backgroundColor: theme.backgroundElevated,
                borderColor: theme.borderDefault,
                paddingBottom: insets.bottom + space[8],
                opacity: overlayMotion.progress,
                transform: [
                  {
                    translateY: overlayMotion.progress.interpolate({
                      inputRange: [0, 1],
                      outputRange: [16, 0],
                    }),
                  },
                ],
              },
            ]}
          >
            <View {...sheetDismissResponder.panHandlers} style={styles.dragHandleTarget}>
              <View style={[styles.dragHandle, { backgroundColor: theme.borderStrong }]} />
            </View>
            {items.map((item, index) => {
              const Icon = item.icon;
              const itemColor =
                item.tone === 'danger' ? theme.feedbackDangerOnSubtle : theme.foregroundPrimary;
              return (
                <View key={item.key}>
                  {index > 0 ? (
                    <View style={[styles.nativeDivider, { borderTopColor: theme.borderSubtle }]} />
                  ) : null}
                  <Pressable
                    accessibilityLabel={item.accessibilityLabel ?? item.label}
                    accessibilityRole="menuitem"
                    onPress={() => select(item)}
                    style={[styles.item, styles.nativeItem]}
                  >
                    {Icon ? <Icon color={itemColor} size={iconSizes[20]} strokeWidth={2} /> : null}
                    <Text
                      style={[
                        styles.label,
                        {
                          color: itemColor,
                        },
                      ]}
                    >
                      {item.label}
                    </Text>
                  </Pressable>
                </View>
              );
            })}
          </Animated.View>
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, justifyContent: 'flex-end' },
  control: { position: 'relative' },
  dragHandle: { borderRadius: radius.full, height: 4, width: 36 },
  dragHandleTarget: { alignItems: 'center', height: 44, justifyContent: 'center' },
  item: {
    justifyContent: 'center',
    minHeight: 44,
    paddingHorizontal: space[12],
    paddingVertical: space[8],
  },
  nativeDivider: { borderTopWidth: borderWidths[1], marginHorizontal: space[8] },
  nativeItem: { alignItems: 'center', flexDirection: 'row', gap: space[8] },
  label: textStyles.uiLabelL,
  sheet: {
    borderTopLeftRadius: radius[16],
    borderTopRightRadius: radius[16],
    borderWidth: borderWidths[1],
  },
  webIcon: { alignItems: 'center', height: 18, justifyContent: 'center', width: 18 },
  webFirstItemHitArea: {
    bottom: -webMenuInset,
    left: -webMenuInset,
    position: 'absolute',
    right: -webMenuInset,
    top: -webMenuInset,
  },
  webItem: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: space[8],
    height: webMenuItemHeight,
    justifyContent: 'flex-start',
    minHeight: webMenuItemHeight,
    paddingHorizontal: space[8],
    position: 'relative',
  },
  webLabel: { flex: 1, textAlign: 'left', ...textStyles.uiCopyM },
  webMenu: {
    borderRadius: radius[12],
    borderWidth: borderWidths[1],
    minWidth: webMenuMinWidth,
    padding: space[4],
  },
  webPosition: { position: 'absolute', zIndex: 100 },
});
