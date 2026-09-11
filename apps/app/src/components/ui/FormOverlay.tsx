import { XIcon } from 'lucide-react-native';
import { Fragment, useCallback, useEffect, useRef, useState } from 'react';
import {
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import { useElevation, useTheme } from '@/theme/ThemeProvider';
import { breakpoints, fontFamilies, radii, spacing, typography } from '@/theme/tokens';
import { ConfirmationContent } from './ConfirmationContent';
import { IconButton } from './IconButton';
import { useSafeAreaPadding } from './useSafeAreaPadding';
import type { ReactNode, RefObject } from 'react';
import type { View as NativeView } from 'react-native';

export type FormOverlayState = {
  dirty: boolean;
  submitting: boolean;
};

type RenderFormProps = {
  close: () => void;
  onStateChange: (state: FormOverlayState) => void;
};

type Props = {
  bodyPadding?: number;
  closeAccessibilityLabel?: string;
  continueEditingFocusSelector?: string;
  discardConfirmLabel: string;
  discardTitle: string;
  fallbackFocusRef?: RefObject<NativeView | null>;
  fallbackFocusSelector?: string;
  limitNativeHeight?: boolean;
  onRequestClose: () => void;
  renderForm: (props: RenderFormProps) => ReactNode;
  testIDPrefix: string;
  title: string;
  visible: boolean;
};

const initialFormState: FormOverlayState = { dirty: false, submitting: false };

export function FormOverlay({
  bodyPadding = spacing.xl,
  closeAccessibilityLabel,
  continueEditingFocusSelector = 'textarea',
  discardConfirmLabel,
  discardTitle,
  fallbackFocusRef,
  fallbackFocusSelector,
  limitNativeHeight = false,
  onRequestClose,
  renderForm,
  testIDPrefix,
  title,
  visible,
}: Props) {
  const theme = useTheme();
  const elevation = useElevation();
  const { height, width } = useWindowDimensions();
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
  const nativeMaxHeight = Platform.OS === 'web' || !limitNativeHeight ? null : height * 0.85;
  const safeAreaStyle = useSafeAreaPadding(mobile ? 0 : spacing.lg);
  const resolvedCloseAccessibilityLabel = closeAccessibilityLabel ?? `${title} 닫기`;
  formStateRef.current = formState;

  const handleFormStateChange = useCallback((nextState: FormOverlayState) => {
    formStateRef.current = nextState;
    setFormState(nextState);
  }, []);

  const restoreFocus = useCallback(() => {
    if (Platform.OS !== 'web') {
      return;
    }

    const previousFocus = restoreFocusRef.current;
    const fallbackFromRef = fallbackFocusRef?.current as unknown as HTMLElement | null;
    const fallbackFromSelector = fallbackFocusSelector
      ? document.querySelector<HTMLElement>(fallbackFocusSelector)
      : null;
    const fallback =
      fallbackFromRef ??
      fallbackFromSelector ??
      document.querySelector<HTMLElement>('[data-testid="universal-shell-root"]');
    const focusTarget =
      previousFocus &&
      previousFocus !== document.body &&
      previousFocus !== document.documentElement &&
      document.contains(previousFocus)
        ? previousFocus
        : fallback;
    focusTarget?.focus();
  }, [fallbackFocusRef, fallbackFocusSelector]);

  const closeAndRestoreFocus = useCallback(() => {
    onRequestClose();
    if (Platform.OS === 'web') {
      requestAnimationFrame(restoreFocus);
    }
  }, [onRequestClose, restoreFocus]);

  const requestClose = useCallback(() => {
    const currentFormState = formStateRef.current;
    if (currentFormState.submitting || discardConfirmOpen) {
      return;
    }
    if (currentFormState.dirty) {
      setDiscardConfirmOpen(true);
      return;
    }
    closeAndRestoreFocus();
  }, [closeAndRestoreFocus, discardConfirmOpen]);

  const continueEditing = useCallback(() => {
    setDiscardConfirmOpen(false);
    if (Platform.OS !== 'web') {
      return;
    }

    requestAnimationFrame(() => {
      const surface = surfaceRef.current as unknown as HTMLElement | null;
      surface?.querySelector<HTMLElement>(continueEditingFocusSelector)?.focus();
    });
  }, [continueEditingFocusSelector]);

  const discardAndClose = useCallback(() => {
    formStateRef.current = initialFormState;
    setFormState(initialFormState);
    setFormRevision((current) => current + 1);
    setDiscardConfirmOpen(false);
    closeAndRestoreFocus();
  }, [closeAndRestoreFocus]);

  const trapFocus = useCallback(
    (event: KeyboardEvent) => {
      if (event.key !== 'Tab' || discardConfirmOpen) {
        return;
      }

      const surface = surfaceRef.current as unknown as HTMLElement | null;
      const controls = Array.from(
        surface?.querySelectorAll<HTMLElement>(
          'button:not([disabled]), textarea:not([disabled]), [role="radio"][tabindex="0"], [tabindex]:not([tabindex="-1"])',
        ) ?? [],
      );
      const first = controls[0];
      const last = controls.at(-1);
      if (!first || !last) {
        return;
      }

      const activeElement = document.activeElement;
      const targetElement = event.shiftKey
        ? activeElement === first || !surface?.contains(activeElement)
          ? last
          : null
        : activeElement === last || !surface?.contains(activeElement)
          ? first
          : null;
      if (!targetElement) {
        return;
      }

      event.preventDefault();
      event.stopPropagation();
      targetElement.focus();
    },
    [discardConfirmOpen],
  );

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
    const targetElement = event.shiftKey
      ? activeElement === first || !confirm?.contains(activeElement)
        ? last
        : null
      : activeElement === last || !confirm?.contains(activeElement)
        ? first
        : null;
    if (!targetElement) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    targetElement.focus();
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
  }, [visible]);

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
      accessibilityLabel={title}
      accessibilityViewIsModal
      animationType="fade"
      onDismiss={restoreFocus}
      onRequestClose={discardConfirmOpen ? continueEditing : requestClose}
      navigationBarTranslucent
      role="dialog"
      statusBarTranslucent
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
          safeAreaStyle,
          { backgroundColor: theme.overlayScrim },
        ]}
      >
        <View
          {...(Platform.OS === 'web' ? { onKeyDown: trapFocus } : {})}
          ref={surfaceRef}
          style={[
            styles.surface,
            elevation.overlay,
            nativeMaxHeight === null ? null : { maxHeight: nativeMaxHeight },
            mobile ? styles.mobileSurface : null,
            mobile && nativeMaxHeight !== null ? { height: nativeMaxHeight } : null,
            { backgroundColor: theme.card, borderColor: theme.border },
          ]}
          testID={`${testIDPrefix}-overlay-surface`}
        >
          <View
            accessibilityElementsHidden={discardConfirmOpen}
            aria-hidden={discardConfirmOpen || undefined}
            importantForAccessibility={discardConfirmOpen ? 'no-hide-descendants' : 'auto'}
            ref={mainRef}
            style={styles.main}
          >
            <View style={[styles.header, { borderColor: theme.border }]}>
              <Text accessibilityRole="header" style={[styles.title, { color: theme.text }]}>
                {title}
              </Text>
              <IconButton
                accessibilityLabel={resolvedCloseAccessibilityLabel}
                controlRef={closeRef}
                disabled={formState.submitting}
                onPress={requestClose}
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
              contentContainerStyle={{ padding: bodyPadding }}
              style={styles.scroll}
              testID={`${testIDPrefix}-overlay-body`}
            >
              <Fragment key={formRevision}>
                {renderForm({ close: closeAndRestoreFocus, onStateChange: handleFormStateChange })}
              </Fragment>
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
                accessibilityLabel={discardTitle}
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
                  {discardTitle}
                </Text>
                <ConfirmationContent
                  cancelLabel="계속 작성"
                  confirmLabel={discardConfirmLabel}
                  message="작성 중인 내용은 저장되지 않습니다."
                  onCancel={continueEditing}
                  onConfirm={discardAndClose}
                  tone="danger"
                />
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
  main: { flex: 1, minHeight: 0 },
  header: {
    alignItems: 'center',
    borderBottomWidth: 1,
    flexDirection: 'row',
    justifyContent: 'space-between',
    minHeight: 56,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
  },
  title: { fontFamily: fontFamilies.ui, fontWeight: '800', ...typography.lg },
  close: {
    alignItems: 'center',
    borderRadius: radii.full,
    height: 36,
    justifyContent: 'center',
    width: 36,
  },
  scroll: { flex: 1, minHeight: 0 },
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
  confirmTitle: { fontFamily: fontFamilies.ui, fontWeight: '800', ...typography.lg },
});
