import { useNavigation } from 'expo-router';
import { usePreventRemove } from 'expo-router/react-navigation';
import { XIcon } from 'lucide-react-native';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import { Button } from '@/components/ui/Button';
import { useTheme } from '@/theme/ThemeProvider';
import { breakpoints, radii, shadow, spacing, typography } from '@/theme/tokens';
import { FeedbackForm } from './FeedbackForm';
import { registerFeedbackHistoryGuard } from './feedbackHistoryGuard';
import type { RefObject } from 'react';
import type { View as NativeView } from 'react-native';
import type { FeedbackFormState } from './FeedbackForm';

type Props = {
  closeUsesHistoryTraversal?: boolean;
  fallbackFocusRef?: RefObject<NativeView | null>;
  originHistoryId?: string | null;
  onRequestClose: () => void;
  visible: boolean;
};

const initialFormState: FeedbackFormState = { dirty: false, submitting: false };

type CloseAction = () => void;

type BrowserHistoryEntry = {
  id: string | null;
  index: number | null;
};

export function FeedbackOverlay({
  closeUsesHistoryTraversal = false,
  fallbackFocusRef,
  originHistoryId = null,
  onRequestClose,
  visible,
}: Props) {
  const theme = useTheme();
  const navigation = useNavigation();
  const { width } = useWindowDimensions();
  const [formState, setFormState] = useState(initialFormState);
  const [discardConfirmOpen, setDiscardConfirmOpen] = useState(false);
  const [historyRestorePending, setHistoryRestorePending] = useState(false);
  const [navigationAllowed, setNavigationAllowed] = useState(false);
  const allowedActionRef = useRef<CloseAction | null>(null);
  const closeRef = useRef<NativeView>(null);
  const confirmRef = useRef<NativeView>(null);
  const bypassHistoryGuardRef = useRef(false);
  const bypassHistoryGuardTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const formStateRef = useRef(formState);
  const historyRestoringRef = useRef(false);
  const mainRef = useRef<NativeView>(null);
  const overlayHistoryEntryRef = useRef<BrowserHistoryEntry | null>(null);
  const pendingCloseActionRef = useRef<CloseAction | null>(null);
  const requestCloseRef = useRef<(action?: CloseAction) => void>(() => undefined);
  const restoreFocusRef = useRef<HTMLElement | null>(null);
  const surfaceRef = useRef<NativeView>(null);
  const mobile = width < breakpoints.compact;
  const overlayVisible = visible || historyRestorePending;
  formStateRef.current = formState;

  const handleFormStateChange = useCallback((nextState: FeedbackFormState) => {
    formStateRef.current = nextState;
    setFormState(nextState);
  }, []);

  const restoreFocus = useCallback(() => {
    requestAnimationFrame(() => {
      const previousFocus = restoreFocusRef.current;
      const fallback = fallbackFocusRef?.current as unknown as HTMLElement | null;
      const target = previousFocus && document.contains(previousFocus) ? previousFocus : fallback;
      target?.focus();
    });
  }, [fallbackFocusRef]);

  const allowClose = useCallback((action: CloseAction) => {
    allowedActionRef.current = action;
    pendingCloseActionRef.current = null;
    setDiscardConfirmOpen(false);
    setNavigationAllowed(true);
  }, []);

  const armHistoryGuardBypass = useCallback(() => {
    bypassHistoryGuardRef.current = true;
    if (bypassHistoryGuardTimeoutRef.current) {
      clearTimeout(bypassHistoryGuardTimeoutRef.current);
    }
    bypassHistoryGuardTimeoutRef.current = setTimeout(() => {
      bypassHistoryGuardRef.current = false;
      bypassHistoryGuardTimeoutRef.current = null;
    }, 250);
  }, []);

  const shellCloseAction = useCallback(() => {
    if (closeUsesHistoryTraversal) {
      armHistoryGuardBypass();
    }
    onRequestClose();
  }, [armHistoryGuardBypass, closeUsesHistoryTraversal, onRequestClose]);

  const requestClose = useCallback(
    (action: CloseAction = shellCloseAction) => {
      const currentFormState = formStateRef.current;
      if (navigationAllowed) {
        action();
        return;
      }
      if (currentFormState.submitting || discardConfirmOpen || pendingCloseActionRef.current) {
        return;
      }
      if (currentFormState.dirty) {
        pendingCloseActionRef.current = action;
        setDiscardConfirmOpen(true);
        return;
      }
      action();
    },
    [discardConfirmOpen, navigationAllowed, shellCloseAction],
  );
  requestCloseRef.current = requestClose;

  usePreventRemove(
    overlayVisible && (formState.dirty || formState.submitting) && !navigationAllowed,
    ({ data }) => {
      requestClose(() => navigation.dispatch({ ...data.action, target: undefined }));
    },
  );

  useEffect(() => {
    if (!navigationAllowed) {
      return;
    }

    const action = allowedActionRef.current;
    allowedActionRef.current = null;
    if (!action) {
      setNavigationAllowed(false);
      return;
    }
    action();
    setNavigationAllowed(false);
  }, [navigationAllowed]);

  useEffect(() => {
    if (!visible || Platform.OS !== 'web') {
      return;
    }

    overlayHistoryEntryRef.current = getBrowserHistoryEntry();
  }, [visible]);

  useEffect(() => {
    if (Platform.OS !== 'web' || !overlayVisible) {
      return;
    }

    const handlePopState = (event: PopStateEvent) => {
      if (bypassHistoryGuardRef.current) {
        bypassHistoryGuardRef.current = false;
        if (bypassHistoryGuardTimeoutRef.current) {
          clearTimeout(bypassHistoryGuardTimeoutRef.current);
          bypassHistoryGuardTimeoutRef.current = null;
        }
        return;
      }
      if (historyRestoringRef.current) {
        historyRestoringRef.current = false;
        setHistoryRestorePending(false);
        return;
      }
      if (!formStateRef.current.dirty && !formStateRef.current.submitting) {
        return;
      }

      event.stopImmediatePropagation();
      const overlayEntry = overlayHistoryEntryRef.current;
      const destinationEntry = getBrowserHistoryEntry();
      const attemptedDelta = getAttemptedHistoryDelta({
        destination: destinationEntry,
        originHistoryId,
        overlay: overlayEntry,
      });
      historyRestoringRef.current = true;
      setHistoryRestorePending(true);
      requestCloseRef.current(() => {
        armHistoryGuardBypass();
        window.history.go(attemptedDelta);
      });
      window.history.go(-attemptedDelta);
    };

    return registerFeedbackHistoryGuard(handlePopState);
  }, [armHistoryGuardBypass, originHistoryId, overlayVisible]);

  useEffect(
    () => () => {
      if (bypassHistoryGuardTimeoutRef.current) {
        clearTimeout(bypassHistoryGuardTimeoutRef.current);
      }
    },
    [],
  );

  const continueEditing = useCallback(() => {
    pendingCloseActionRef.current = null;
    setDiscardConfirmOpen(false);
    requestAnimationFrame(() => {
      const surface = surfaceRef.current as unknown as HTMLElement | null;
      surface?.querySelector<HTMLElement>('textarea')?.focus();
    });
  }, []);

  const discardAndClose = useCallback(() => {
    const action = pendingCloseActionRef.current;
    if (action) {
      allowClose(action);
    }
  }, [allowClose]);

  const trapConfirmationFocus = useCallback((event: KeyboardEvent) => {
    if (event.key !== 'Tab') {
      return;
    }

    const confirm = confirmRef.current as unknown as HTMLElement | null;
    const controls = confirm?.querySelectorAll<HTMLElement>('button:not([disabled])');
    const first = controls?.item(0);
    const last = controls?.item((controls?.length ?? 1) - 1);
    if (!first || !last) {
      return;
    }

    const activeElement = document.activeElement;
    const target = event.shiftKey
      ? activeElement === first || !confirm?.contains(activeElement)
        ? last
        : null
      : activeElement === last || !confirm?.contains(activeElement)
        ? first
        : null;
    if (!target) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    target.focus();
  }, []);

  useEffect(() => {
    if (!overlayVisible || Platform.OS !== 'web') {
      return;
    }

    restoreFocusRef.current = document.activeElement as HTMLElement | null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const frame = requestAnimationFrame(() => {
      (closeRef.current as unknown as HTMLElement | null)?.focus();
    });

    return () => {
      cancelAnimationFrame(frame);
      document.body.style.overflow = previousOverflow;
    };
  }, [fallbackFocusRef, overlayVisible]);

  useEffect(() => {
    if (!discardConfirmOpen || Platform.OS !== 'web') {
      return;
    }

    const main = mainRef.current as unknown as HTMLElement | null;
    if (main) {
      main.inert = true;
    }
    const frame = requestAnimationFrame(() => {
      const confirm = confirmRef.current as unknown as HTMLElement | null;
      confirm?.querySelector<HTMLElement>('button:not([disabled])')?.focus();
    });
    return () => {
      cancelAnimationFrame(frame);
      if (main) {
        main.inert = false;
      }
    };
  }, [discardConfirmOpen]);

  return (
    <Modal
      accessibilityLabel="피드백 보내기"
      accessibilityViewIsModal
      animationType="fade"
      onDismiss={restoreFocus}
      onRequestClose={discardConfirmOpen ? continueEditing : () => requestClose()}
      role="dialog"
      transparent
      visible={overlayVisible}
    >
      <View
        onResponderRelease={() => requestClose()}
        onStartShouldSetResponder={(event) => event.target === event.currentTarget}
        style={[styles.backdrop, mobile ? styles.mobileBackdrop : null]}
      >
        <View
          ref={surfaceRef}
          style={[
            styles.surface,
            mobile ? styles.mobileSurface : null,
            { backgroundColor: theme.card, borderColor: theme.border },
          ]}
          testID="feedback-overlay-surface"
        >
          <View
            accessibilityElementsHidden={discardConfirmOpen}
            aria-hidden={discardConfirmOpen || undefined}
            importantForAccessibility={discardConfirmOpen ? 'no-hide-descendants' : 'auto'}
            ref={mainRef}
            style={[
              styles.main,
              mobile ? styles.mobileMain : null,
              discardConfirmOpen ? styles.mainBlocked : null,
            ]}
          >
            <View style={[styles.header, { borderColor: theme.border }]}>
              <Text accessibilityRole="header" style={[styles.title, { color: theme.text }]}>
                피드백 보내기
              </Text>
              <Pressable
                accessibilityLabel="피드백 닫기"
                accessibilityRole="button"
                disabled={formState.submitting}
                onPress={() => requestClose()}
                ref={closeRef}
                style={({ pressed }) => [
                  styles.close,
                  {
                    backgroundColor: pressed ? theme.surface : 'transparent',
                    opacity: formState.submitting ? 0.45 : 1,
                  },
                ]}
              >
                <XIcon color={theme.text} size={20} strokeWidth={2} />
              </Pressable>
            </View>
            <ScrollView
              contentContainerStyle={styles.body}
              style={[styles.scroll, mobile ? styles.mobileScroll : null]}
              testID="feedback-overlay-body"
            >
              <FeedbackForm onStateChange={handleFormStateChange} />
            </ScrollView>
          </View>
          {discardConfirmOpen ? (
            <View
              onResponderRelease={continueEditing}
              onStartShouldSetResponder={(event) => event.target === event.currentTarget}
              style={styles.confirmBackdrop}
            >
              <View
                {...(Platform.OS === 'web' ? { onKeyDown: trapConfirmationFocus } : {})}
                accessibilityLabel="작성 중인 피드백을 버릴까요?"
                accessibilityViewIsModal
                onStartShouldSetResponder={() => true}
                ref={confirmRef}
                role="alertdialog"
                style={[styles.confirm, { backgroundColor: theme.card, borderColor: theme.border }]}
              >
                <Text
                  accessibilityRole="header"
                  style={[styles.confirmTitle, { color: theme.text }]}
                >
                  작성 중인 피드백을 버릴까요?
                </Text>
                <Text style={[styles.confirmDescription, { color: theme.textSecondary }]}>
                  작성 중인 내용은 저장되지 않습니다.
                </Text>
                <View style={styles.confirmActions}>
                  <Button onPress={continueEditing} tone="secondary">
                    계속 작성
                  </Button>
                  <Button onPress={discardAndClose} tone="danger">
                    피드백 버리기
                  </Button>
                </View>
              </View>
            </View>
          ) : null}
        </View>
      </View>
    </Modal>
  );
}

function getBrowserHistoryEntry(): BrowserHistoryEntry {
  const state = window.history.state as { id?: unknown } | null;
  const navigation = (
    window as typeof window & {
      navigation?: { currentEntry?: { index?: unknown } };
    }
  ).navigation;
  const index = navigation?.currentEntry?.index;
  return {
    id: typeof state?.id === 'string' ? state.id : null,
    index: typeof index === 'number' ? index : null,
  };
}

function getAttemptedHistoryDelta({
  destination,
  originHistoryId,
  overlay,
}: {
  destination: BrowserHistoryEntry;
  originHistoryId: string | null;
  overlay: BrowserHistoryEntry | null;
}) {
  if (destination.index !== null && overlay?.index != null) {
    const delta = destination.index - overlay.index;
    if (delta !== 0) {
      return delta;
    }
  }

  if (originHistoryId && destination.id !== originHistoryId) {
    return 1;
  }
  return -1;
}

const styles = StyleSheet.create({
  backdrop: {
    alignItems: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.48)',
    flex: 1,
    justifyContent: 'center',
    padding: spacing.lg,
  },
  surface: {
    borderRadius: radii.lg,
    borderWidth: 1,
    maxHeight: '85dvh' as never,
    overflow: 'hidden',
    position: 'relative',
    width: 600,
    ...shadow,
  },
  mobileBackdrop: {
    alignItems: 'stretch',
    justifyContent: 'flex-end',
    padding: 0,
  },
  mobileSurface: {
    borderBottomLeftRadius: 0,
    borderBottomRightRadius: 0,
    height: '85dvh' as never,
    width: '100%',
  },
  main: { minHeight: 0 },
  mobileMain: { flex: 1 },
  mainBlocked: { pointerEvents: 'none' },
  header: {
    alignItems: 'center',
    borderBottomWidth: 1,
    flexDirection: 'row',
    justifyContent: 'space-between',
    minHeight: 56,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
  },
  title: { fontFamily: 'SUIT', fontWeight: '800', ...typography.lg },
  close: {
    alignItems: 'center',
    borderRadius: radii.full,
    height: 36,
    justifyContent: 'center',
    width: 36,
  },
  scroll: { minHeight: 0 },
  mobileScroll: { flex: 1 },
  body: { padding: spacing.xl },
  confirmBackdrop: {
    alignItems: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.48)',
    bottom: 0,
    justifyContent: 'center',
    left: 0,
    padding: spacing.lg,
    position: 'absolute',
    right: 0,
    top: 0,
    zIndex: 100,
  },
  confirm: {
    borderRadius: radii.lg,
    borderWidth: 1,
    gap: spacing.md,
    maxWidth: 420,
    padding: spacing.xl,
    width: '100%',
    ...shadow,
  },
  confirmTitle: { fontFamily: 'SUIT', fontWeight: '800', ...typography.lg },
  confirmDescription: { fontFamily: 'SUIT', ...typography.sm },
  confirmActions: { flexDirection: 'row', gap: spacing.sm, justifyContent: 'flex-end' },
});
