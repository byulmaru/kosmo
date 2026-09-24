import { XIcon } from 'lucide-react-native';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { IconButton } from '@/components/ui/IconButton';
import { useSafeAreaPadding } from '@/components/ui/useSafeAreaPadding';
import { useElevation, useTheme } from '@/theme/ThemeProvider';
import { radii, spacing, textStyles } from '@/theme/tokens';
import { PostComposer } from './PostComposer';
import type { RefObject } from 'react';
import type { PostComposer_profile$key } from './__generated__/PostComposer_profile.graphql';
import type { PostComposerProfileRef } from './PostComposerProfileSwitcher';

export type PostComposerHostMode = 'mobile' | 'overlay' | 'rail';
export type PostComposerHostCloseReason = 'created' | 'dismiss';

type PostComposerHostProps = {
  fallbackFocusRef?: RefObject<HTMLElement | null>;
  onRequestClose: (reason: PostComposerHostCloseReason) => void;
  open: boolean;
  profile: PostComposer_profile$key;
  profiles?: readonly PostComposerProfileRef[];
  triggerFocusRef?: RefObject<HTMLElement | null>;
} & ({ mode: 'rail'; onExpand: () => void } | { mode: 'mobile' | 'overlay'; onExpand?: never });

function usePostComposerOverlayLifecycle({
  fallbackFocusRef,
  onRequestClose,
  open,
  submitting,
  triggerFocusRef,
}: Pick<PostComposerHostProps, 'fallbackFocusRef' | 'onRequestClose' | 'triggerFocusRef'> & {
  open: boolean;
  submitting: boolean;
}) {
  const dialogRef = useRef<View>(null);
  const expandControlRef = useRef<View>(null);
  const nativeBackHandlerRef = useRef<(() => void) | null>(null);
  const restoreFocusRef = useRef<HTMLElement | null>(null);
  const wasOpenRef = useRef(false);
  const hasWebDocument = Platform.OS === 'web' && typeof document !== 'undefined';

  const requestClose = useCallback(
    (reason: PostComposerHostCloseReason = 'dismiss') => {
      if (reason === 'dismiss' && submitting) {
        return;
      }
      onRequestClose(reason);
    },
    [onRequestClose, submitting],
  );
  const requestNativeBack = useCallback(() => {
    if (submitting) {
      return;
    }
    if (nativeBackHandlerRef.current) {
      nativeBackHandlerRef.current();
      return;
    }
    onRequestClose('dismiss');
  }, [onRequestClose, submitting]);
  const registerNativeBackHandler = useCallback((handler: (() => void) | null) => {
    nativeBackHandlerRef.current = handler;
  }, []);

  useEffect(() => {
    if (!hasWebDocument) {
      return;
    }

    if (open && !wasOpenRef.current) {
      restoreFocusRef.current = document.activeElement as HTMLElement | null;
    }
    if (!open && wasOpenRef.current) {
      requestAnimationFrame(() => {
        const railTrigger = expandControlRef.current as unknown as HTMLElement | null;
        const triggerFocus =
          railTrigger && document.contains(railTrigger) ? railTrigger : triggerFocusRef?.current;
        const restoredFocus = restoreFocusRef.current;
        const fallbackFocus = fallbackFocusRef?.current;
        const previousFocus =
          triggerFocus && document.contains(triggerFocus)
            ? triggerFocus
            : restoredFocus !== document.body &&
                restoredFocus !== null &&
                document.contains(restoredFocus)
              ? restoredFocus
              : fallbackFocus;
        if (previousFocus && document.contains(previousFocus)) {
          previousFocus.focus();
        }
      });
    }
    wasOpenRef.current = open;
  }, [fallbackFocusRef, hasWebDocument, open, triggerFocusRef]);

  useEffect(() => {
    if (!hasWebDocument || !open) {
      return;
    }

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [hasWebDocument, open]);

  useEffect(() => {
    if (!hasWebDocument || !open) {
      return;
    }

    const dialog = dialogRef.current as unknown as HTMLElement | null;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        if (
          dialog?.querySelector(
            '[role="menu"], [role="radiogroup"], [data-testid="post-composer-profile-picker"]',
          )
        ) {
          return;
        }
        event.preventDefault();
        requestClose();
        return;
      }
      if (event.key !== 'Tab') {
        return;
      }

      const focusable = Array.from(
        dialog?.querySelectorAll<HTMLElement>(
          'button:not([disabled]), textarea:not([disabled]), input:not([disabled]), [href], [tabindex]:not([tabindex="-1"])',
        ) ?? [],
      ).filter((element) => element.getClientRects().length > 0);
      if (focusable.length === 0) {
        return;
      }

      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (!dialog?.contains(document.activeElement)) {
        event.preventDefault();
        first?.focus();
      } else if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last?.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first?.focus();
      }
    };

    document.addEventListener('keydown', onKeyDown, true);
    return () => document.removeEventListener('keydown', onKeyDown, true);
  }, [hasWebDocument, open, requestClose]);

  return {
    dialogRef,
    expandControlRef,
    registerNativeBackHandler,
    requestClose,
    requestNativeBack,
  };
}

export function PostComposerHost({
  fallbackFocusRef,
  mode,
  onExpand,
  onRequestClose,
  open,
  profile,
  profiles,
  triggerFocusRef,
}: PostComposerHostProps) {
  const theme = useTheme();
  const elevation = useElevation();
  const [submitting, setSubmitting] = useState(false);
  const web = Platform.OS === 'web';
  const nativeMobile = !web && mode === 'mobile';
  const overlayVisible = mode !== 'rail' && open;
  const safeAreaStyle = useSafeAreaPadding(mode === 'mobile' ? 0 : spacing.lg);
  const {
    dialogRef,
    expandControlRef,
    registerNativeBackHandler,
    requestClose,
    requestNativeBack,
  } = usePostComposerOverlayLifecycle({
    fallbackFocusRef,
    onRequestClose,
    open: overlayVisible,
    submitting,
    triggerFocusRef,
  });

  const composer = (
    <PostComposer
      expandControlRef={expandControlRef}
      focusOnMount={overlayVisible}
      onPostCreated={() => requestClose('created')}
      onSubmittingChange={setSubmitting}
      profile={profile}
      profiles={profiles}
      registerNativeBackHandler={registerNativeBackHandler}
      {...(mode === 'rail'
        ? { onExpand, onRequestClose: requestClose, presentation: mode }
        : { onRequestClose: requestClose, presentation: mode })}
    />
  );

  const header =
    mode === 'overlay' ? (
      <View style={[styles.header, { borderColor: theme.borderSubtle }]}>
        <Text accessibilityRole="header" style={[styles.title, { color: theme.text }]}>
          글쓰기
        </Text>
        <IconButton
          accessibilityLabel="글쓰기 닫기"
          disabled={submitting}
          feedback="opacity"
          onPress={() => requestClose()}
          style={styles.closeButton}
          targetSize={40}
        >
          <XIcon color={theme.text} size={20} strokeWidth={2} />
        </IconButton>
      </View>
    ) : null;

  const dialog = (
    <View
      accessibilityLabel={overlayVisible ? '글쓰기' : undefined}
      accessibilityViewIsModal={overlayVisible}
      aria-modal={overlayVisible || undefined}
      ref={dialogRef}
      role={overlayVisible ? 'dialog' : undefined}
      style={[
        styles.dialog,
        mode !== 'rail' && !nativeMobile && elevation.overlay,
        mode === 'rail'
          ? styles.railDialog
          : mode === 'mobile'
            ? styles.mobileDialog
            : styles.overlayDialog,
        { backgroundColor: theme.card },
      ]}
      testID={mode === 'rail' ? 'post-composer-rail' : 'post-composer-dialog'}
    >
      {header}
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={[styles.composerFrame, mode === 'mobile' ? styles.composerFrameFill : null]}
      >
        {composer}
      </KeyboardAvoidingView>
    </View>
  );

  if (!web) {
    return (
      <Modal
        accessibilityLabel="글쓰기"
        accessibilityViewIsModal
        animationType="fade"
        onRequestClose={requestNativeBack}
        navigationBarTranslucent
        presentationStyle={mode === 'mobile' ? 'fullScreen' : undefined}
        role="dialog"
        statusBarTranslucent
        transparent={mode !== 'mobile'}
        visible={overlayVisible}
      >
        {mode === 'mobile' ? (
          <View
            style={[styles.nativeMobileSurface, safeAreaStyle, { backgroundColor: theme.card }]}
          >
            {dialog}
          </View>
        ) : (
          <Pressable
            onPress={() => requestClose()}
            style={[styles.nativeBackdrop, safeAreaStyle, { backgroundColor: theme.overlayScrim }]}
            testID="post-composer-backdrop"
          >
            <Pressable onPress={(event) => event.stopPropagation()} style={styles.nativeDialogWrap}>
              {dialog}
            </Pressable>
          </Pressable>
        )}
      </Modal>
    );
  }

  const active = mode === 'rail' || overlayVisible;
  return (
    <View
      accessibilityElementsHidden={!active}
      aria-hidden={!active || undefined}
      pointerEvents={active ? 'auto' : 'none'}
      style={[
        mode === 'rail' ? styles.railHost : styles.webOverlayHost,
        mode === 'mobile' ? styles.webMobileHost : null,
        mode !== 'rail' ? safeAreaStyle : null,
        !active ? styles.hiddenHost : null,
        mode !== 'rail' ? { backgroundColor: theme.overlayScrim } : null,
      ]}
    >
      {mode !== 'rail' ? (
        <Pressable onPress={() => requestClose()} style={styles.webBackdrop} />
      ) : null}
      {dialog}
    </View>
  );
}

const styles = StyleSheet.create({
  railHost: { minWidth: 0, width: '100%' },
  webOverlayHost: {
    alignItems: 'center',
    bottom: 0,
    justifyContent: 'flex-start',
    left: 0,
    padding: spacing.lg,
    position: 'fixed' as never,
    right: 0,
    top: 0,
    zIndex: 100,
  },
  webMobileHost: { padding: 0 },
  webBackdrop: { bottom: 0, left: 0, position: 'absolute', right: 0, top: 0 },
  hiddenHost: { display: 'none' },
  nativeBackdrop: { flex: 1, justifyContent: 'center' },
  nativeDialogWrap: { flex: 1, justifyContent: 'center' },
  nativeMobileSurface: { flex: 1 },
  dialog: { minHeight: 0, overflow: 'hidden' },
  railDialog: { borderWidth: 0, width: '100%' },
  overlayDialog: {
    borderRadius: radii.lg,
    marginTop: spacing.xxl,
    maxWidth: 640,
    maxHeight: 'calc(100dvh - 96px)' as never,
    width: '100%',
  },
  mobileDialog: { borderRadius: 0, borderWidth: 0, height: '100%', width: '100%' },
  header: {
    alignItems: 'center',
    borderBottomWidth: 1,
    height: 64,
    justifyContent: 'center',
  },
  closeButton: { position: 'absolute', right: spacing.lg, top: spacing.md },
  title: textStyles.uiHeadingS,
  composerFrame: { flexShrink: 1, minHeight: 0 },
  composerFrameFill: { flex: 1 },
});
