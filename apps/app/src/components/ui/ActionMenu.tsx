import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Modal, PanResponder, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ActionMenuPortal } from '@/components/ui/ActionMenuPortal';
import { useTheme } from '@/theme/ThemeProvider';
import { radii, shadow, spacing, typography } from '@/theme/tokens';
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

const webMenuInset = spacing.xs + 1;
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
  const insets = useSafeAreaInsets();
  const controlRef = useRef<View>(null);
  const menuRef = useRef<View>(null);
  const triggerRef = useRef<View>(null);
  const [hoveredWebItemKey, setHoveredWebItemKey] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [webPosition, setWebPosition] = useState({ left: 0, top: 0 });
  const web = Platform.OS === 'web';

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
      item.onSelect();
      dismiss();
    },
    [dismiss],
  );

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
    if (!web || !open) {
      return;
    }

    positionWebMenu();
    window.addEventListener('resize', positionWebMenu);
    document.addEventListener('scroll', positionWebMenu, true);
    return () => {
      window.removeEventListener('resize', positionWebMenu);
      document.removeEventListener('scroll', positionWebMenu, true);
    };
  }, [open, positionWebMenu, web]);

  useEffect(() => {
    if (!web || !open) {
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
  }, [dismiss, open, web]);

  if (web) {
    return (
      <View ref={controlRef} style={styles.control}>
        {renderTrigger({
          expanded: open,
          focusTrigger,
          onPress: toggle,
          ref: triggerRef,
        })}
        {open ? (
          <ActionMenuPortal>
            <View style={[styles.webPosition, webPosition]}>
              <View
                accessibilityLabel={accessibilityLabel}
                ref={menuRef}
                role="menu"
                style={[styles.webMenu, { backgroundColor: theme.card, borderColor: theme.border }]}
              >
                {items.map((item, index) => {
                  const Icon = item.icon;
                  const itemColor = item.tone === 'danger' ? theme.danger : theme.text;
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
                          ? { borderTopColor: theme.divider, borderTopWidth: 1 }
                          : undefined,
                        pressed || hoveredWebItemKey === item.key
                          ? { backgroundColor: theme.surface }
                          : undefined,
                      ]}
                    >
                      {index === 0 ? (
                        <View accessible={false} aria-hidden style={styles.webFirstItemHitArea} />
                      ) : null}
                      {Icon ? (
                        <View accessible={false} aria-hidden style={styles.webIcon}>
                          <Icon color={itemColor} size={18} strokeWidth={2.4} />
                        </View>
                      ) : null}
                      <Text style={[styles.label, styles.webLabel, { color: itemColor }]}>
                        {item.label}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            </View>
          </ActionMenuPortal>
        ) : null}
      </View>
    );
  }

  return (
    <>
      {renderTrigger({
        expanded: open,
        focusTrigger,
        onPress: toggle,
        ref: triggerRef,
      })}
      <Modal
        accessibilityLabel={accessibilityLabel}
        animationType="fade"
        onRequestClose={() => dismiss()}
        role="dialog"
        transparent
        visible={open}
      >
        <View style={styles.backdrop}>
          <Pressable
            accessible={false}
            aria-hidden
            importantForAccessibility="no"
            onPress={() => dismiss()}
            style={StyleSheet.absoluteFill}
          />
          <View
            accessibilityLabel={accessibilityLabel}
            accessibilityRole="menu"
            accessibilityViewIsModal
            onAccessibilityEscape={() => dismiss()}
            style={[
              styles.sheet,
              {
                backgroundColor: theme.card,
                borderColor: theme.border,
                paddingBottom: insets.bottom + spacing.sm,
              },
            ]}
          >
            <View {...sheetDismissResponder.panHandlers} style={styles.dragHandleTarget}>
              <View style={[styles.dragHandle, { backgroundColor: theme.border }]} />
            </View>
            {items.map((item) => {
              const Icon = item.icon;
              return (
                <Pressable
                  accessibilityLabel={item.accessibilityLabel ?? item.label}
                  accessibilityRole="menuitem"
                  key={item.key}
                  onPress={() => select(item)}
                  style={[styles.item, styles.nativeItem]}
                >
                  {Icon ? (
                    <Icon
                      color={item.tone === 'danger' ? theme.danger : theme.text}
                      size={20}
                      strokeWidth={2.4}
                    />
                  ) : null}
                  <Text
                    style={[
                      styles.label,
                      { color: item.tone === 'danger' ? theme.danger : theme.text },
                    ]}
                  >
                    {item.label}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  backdrop: { backgroundColor: 'rgba(0,0,0,0.4)', flex: 1, justifyContent: 'flex-end' },
  control: { position: 'relative' },
  dragHandle: { borderRadius: radii.full, height: 4, width: 36 },
  dragHandleTarget: { alignItems: 'center', height: 44, justifyContent: 'center' },
  item: {
    justifyContent: 'center',
    minHeight: 44,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  nativeItem: { alignItems: 'center', flexDirection: 'row', gap: spacing.sm },
  label: { fontFamily: 'SUIT', fontWeight: '700', ...typography.md },
  sheet: {
    borderTopLeftRadius: radii.lg,
    borderTopRightRadius: radii.lg,
    borderWidth: 1,
    ...shadow,
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
    gap: spacing.sm,
    height: webMenuItemHeight,
    justifyContent: 'flex-start',
    minHeight: webMenuItemHeight,
    paddingHorizontal: spacing.sm,
    position: 'relative',
  },
  webLabel: { flex: 1, fontWeight: '500', textAlign: 'left', ...typography.sm },
  webMenu: {
    borderRadius: radii.md,
    borderWidth: 1,
    boxShadow: '0 2px 4px rgba(0, 0, 0, 0.12)',
    minWidth: webMenuMinWidth,
    padding: spacing.xs,
  },
  webPosition: { position: 'absolute', zIndex: 100 },
});
