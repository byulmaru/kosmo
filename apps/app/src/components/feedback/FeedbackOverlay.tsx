import { XIcon } from 'lucide-react-native';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import { Button } from '@/components/ui/Button';
import { IconButton } from '@/components/ui/IconButton';
import { useWebSafeAreaPadding } from '@/components/ui/useWebSafeAreaPadding';
import { useElevation, useTheme } from '@/theme/ThemeProvider';
import { breakpoints, radii, spacing, typography } from '@/theme/tokens';
import { FeedbackForm } from './FeedbackForm';
import type { RefObject } from 'react';
import type { View as NativeView } from 'react-native';
import type { FeedbackFormState } from './FeedbackForm';

type Props = {
  fallbackFocusRef?: RefObject<NativeView | null>;
  onRequestClose: () => void;
  visible: boolean;
};

const initialFormState: FeedbackFormState = { dirty: false, submitting: false };

export function FeedbackOverlay({ fallbackFocusRef, onRequestClose, visible }: Props) {
  const theme = useTheme();
  const elevation = useElevation();
  const { width } = useWindowDimensions();
  const [formState, setFormState] = useState(initialFormState);
  const [discardConfirmOpen, setDiscardConfirmOpen] = useState(false);
  const [formRevision, setFormRevision] = useState(0);
  const closeRef = useRef<NativeView>(null);
  const confirmRef = useRef<NativeView>(null);
  const formStateRef = useRef(formState);
  const mainRef = useRef<NativeView>(null);
  const restoreFocusRef = useRef<HTMLElement | null>(null);
  const surfaceRef = useRef<NativeView>(null);
  const wasVisibleRef = useRef(visible);
  const mobile = width < breakpoints.compact;
  const webSafeAreaStyle = useWebSafeAreaPadding(mobile ? 0 : spacing.lg);
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

  const requestClose = useCallback(() => {
    const currentFormState = formStateRef.current;
    if (currentFormState.submitting || discardConfirmOpen) {
      return;
    }
    if (currentFormState.dirty) {
      setDiscardConfirmOpen(true);
      return;
    }
    onRequestClose();
  }, [discardConfirmOpen, onRequestClose]);

  const continueEditing = useCallback(() => {
    setDiscardConfirmOpen(false);
    requestAnimationFrame(() => {
      const surface = surfaceRef.current as unknown as HTMLElement | null;
      surface?.querySelector<HTMLElement>('textarea')?.focus();
    });
  }, []);

  const discardAndClose = useCallback(() => {
    formStateRef.current = initialFormState;
    setFormState(initialFormState);
    setFormRevision((current) => current + 1);
    setDiscardConfirmOpen(false);
    onRequestClose();
  }, [onRequestClose]);

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
    if (wasVisibleRef.current && !visible) {
      formStateRef.current = initialFormState;
      setFormState(initialFormState);
      setDiscardConfirmOpen(false);
      setFormRevision((current) => current + 1);
    }
    wasVisibleRef.current = visible;
  }, [visible]);

  useEffect(() => {
    if (!visible || Platform.OS !== 'web') {
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
  }, [fallbackFocusRef, visible]);

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
      visible={visible}
    >
      <View
        onResponderRelease={() => requestClose()}
        onStartShouldSetResponder={(event) => event.target === event.currentTarget}
        style={[
          styles.backdrop,
          Platform.OS === 'web' ? styles.webBackdrop : null,
          mobile ? styles.mobileBackdrop : null,
          webSafeAreaStyle,
          { backgroundColor: theme.overlayScrim },
        ]}
        testID="feedback-overlay-backdrop"
      >
        <View
          ref={surfaceRef}
          style={[
            styles.surface,
            elevation.overlay,
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
              <IconButton
                accessibilityLabel="피드백 닫기"
                controlRef={closeRef}
                disabled={formState.submitting}
                onPress={() => requestClose()}
                style={({ pressed }) => [
                  styles.close,
                  {
                    backgroundColor: pressed ? theme.surface : 'transparent',
                    opacity: formState.submitting ? 0.45 : 1,
                  },
                ]}
                targetSize={36}
              >
                <XIcon color={theme.text} size={20} strokeWidth={2} />
              </IconButton>
            </View>
            <ScrollView
              contentContainerStyle={styles.body}
              style={[styles.scroll, mobile ? styles.mobileScroll : null]}
              testID="feedback-overlay-body"
            >
              <FeedbackForm key={formRevision} onStateChange={handleFormStateChange} />
            </ScrollView>
          </View>
          {discardConfirmOpen ? (
            <View
              onResponderRelease={continueEditing}
              onStartShouldSetResponder={(event) => event.target === event.currentTarget}
              style={[styles.confirmBackdrop, { backgroundColor: theme.overlayScrim }]}
            >
              <View
                {...(Platform.OS === 'web' ? { onKeyDown: trapConfirmationFocus } : {})}
                accessibilityLabel="작성 중인 피드백을 버릴까요?"
                accessibilityViewIsModal
                onStartShouldSetResponder={() => true}
                ref={confirmRef}
                role="alertdialog"
                style={[
                  styles.confirm,
                  elevation.overlay,
                  { backgroundColor: theme.card, borderColor: theme.border },
                ]}
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

const styles = StyleSheet.create({
  backdrop: {
    alignItems: 'center',
    flex: 1,
    justifyContent: 'center',
    padding: spacing.lg,
  },
  webBackdrop: { width: '100vw' as never },
  surface: {
    borderRadius: radii.lg,
    borderWidth: 1,
    maxHeight: '85dvh' as never,
    overflow: 'hidden',
    position: 'relative',
    width: 600,
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
  },
  confirmTitle: { fontFamily: 'SUIT', fontWeight: '800', ...typography.lg },
  confirmDescription: { fontFamily: 'SUIT', ...typography.sm },
  confirmActions: { flexDirection: 'row', gap: spacing.sm, justifyContent: 'flex-end' },
});
