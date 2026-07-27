import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Modal, PanResponder, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '@/theme/ThemeProvider';
import { radii, shadow, spacing, typography } from '@/theme/tokens';
import type { ReactNode, Ref } from 'react';

export type ActionMenuItem = Readonly<{
  key: string;
  label: string;
  onSelect: () => void;
}>;

export type ActionMenuTriggerRenderProps = Readonly<{
  expanded: boolean;
  onPress: () => void;
  ref: Ref<View>;
}>;

type Props = {
  accessibilityLabel: string;
  disabled?: boolean;
  items: readonly ActionMenuItem[];
  renderTrigger: (props: ActionMenuTriggerRenderProps) => ReactNode;
};

export function ActionMenu({
  accessibilityLabel,
  disabled = false,
  items,
  renderTrigger,
}: Props): ReactNode {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const controlRef = useRef<View>(null);
  const menuRef = useRef<View>(null);
  const triggerRef = useRef<View>(null);
  const [open, setOpen] = useState(false);
  const web = Platform.OS === 'web';

  const focusTrigger = useCallback(() => {
    triggerRef.current?.focus();
  }, []);
  const dismiss = useCallback(
    (restoreFocus = true) => {
      setOpen(false);
      if (restoreFocus) {
        focusTrigger();
      }
    },
    [focusTrigger],
  );
  const toggle = useCallback(() => {
    if (!disabled) {
      setOpen((value) => !value);
    }
  }, [disabled]);
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

  useEffect(() => {
    if (!web || !open) {
      return;
    }

    const menu = menuRef.current as unknown as HTMLElement | null;
    const focusItem = (index: number) => {
      const menuItems = Array.from(menu?.querySelectorAll<HTMLElement>('[role="menuitem"]') ?? []);
      menuItems[index]?.focus();
    };
    const onPointerDown = (event: PointerEvent) => {
      const control = controlRef.current as unknown as HTMLElement | null;
      if (!control?.contains(event.target as Node)) {
        dismiss(false);
      }
    };
    const onFocusIn = (event: FocusEvent) => {
      const control = controlRef.current as unknown as HTMLElement | null;
      if (!control?.contains(event.target as Node)) {
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
      if (event.key === 'ArrowDown') {
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
      <View ref={controlRef} style={[styles.control, { zIndex: open ? 50 : 0 }]}>
        {renderTrigger({ expanded: open, onPress: toggle, ref: triggerRef })}
        {open ? (
          <View style={styles.webPosition}>
            <View
              accessibilityLabel={accessibilityLabel}
              ref={menuRef}
              role="menu"
              style={[styles.webMenu, { backgroundColor: theme.card, borderColor: theme.border }]}
            >
              {items.map((item) => (
                <Pressable
                  key={item.key}
                  onPress={() => select(item)}
                  role="menuitem"
                  style={styles.item}
                >
                  <Text style={[styles.label, { color: theme.text }]}>{item.label}</Text>
                </Pressable>
              ))}
            </View>
          </View>
        ) : null}
      </View>
    );
  }

  return (
    <>
      {renderTrigger({ expanded: open, onPress: toggle, ref: triggerRef })}
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
            {items.map((item) => (
              <Pressable
                accessibilityLabel={item.label}
                accessibilityRole="button"
                key={item.key}
                onPress={() => select(item)}
                style={styles.item}
              >
                <Text style={[styles.label, { color: theme.text }]}>{item.label}</Text>
              </Pressable>
            ))}
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
  label: { fontFamily: 'SUIT', fontWeight: '700', ...typography.md },
  sheet: {
    borderTopLeftRadius: radii.lg,
    borderTopRightRadius: radii.lg,
    borderWidth: 1,
    ...shadow,
  },
  webMenu: { borderRadius: radii.md, borderWidth: 1, minWidth: 160, overflow: 'hidden', ...shadow },
  webPosition: { left: 0, position: 'absolute', top: '100%' },
});
