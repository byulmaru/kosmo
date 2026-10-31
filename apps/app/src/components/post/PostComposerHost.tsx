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
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Button } from '@/components/ui/Button';
import { IconButton } from '@/components/ui/IconButton';
import { OverlayBackdrop, useOverlayLifecycle } from '@/components/ui/Overlay';
import { OverlayPortalProvider } from '@/components/ui/OverlayPortal';
import { ToastProvider } from '@/components/ui/ToastProvider';
import { useSafeAreaPadding } from '@/components/ui/useSafeAreaPadding';
import { useElevation, useTheme } from '@/theme/ThemeProvider';
import { radii, spacing, textStyles } from '@/theme/tokens';
import { PostComposerController } from './PostComposerController';
import type { RefObject } from 'react';
import type { OverlayCloseReason } from '@/components/ui/Overlay';
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

type PostComposerRequestCloseReason = PostComposerHostCloseReason | OverlayCloseReason;

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
  const insets = useSafeAreaInsets();
  const [submitting, setSubmitting] = useState(false);
  const [uncertainRequest, setUncertainRequest] = useState<{ retry?: () => void } | null>(null);
  const [uncertainCloseOpen, setUncertainCloseOpen] = useState(false);
  const uncertainCloseRef = useRef<View>(null);
  const web = Platform.OS === 'web';
  const nativeMobile = !web && mode === 'mobile';
  const composerSurface =
    mode === 'rail'
      ? theme.backgroundSurface
      : mode === 'mobile'
        ? theme.backgroundCanvas
        : theme.backgroundElevated;
  const overlayVisible = mode !== 'rail' && open;
  const safeAreaStyle = useSafeAreaPadding(mode === 'mobile' ? 0 : spacing.lg);
  const expandControlRef = useRef<View>(null);
  const nativeBackHandlerRef = useRef<(() => void) | null>(null);
  const requestClose = useCallback(
    (reason: PostComposerRequestCloseReason = 'dismiss') => {
      if (reason !== 'created' && submitting) {
        return;
      }
      if (reason !== 'created' && uncertainRequest !== null) {
        setUncertainCloseOpen(true);
        return;
      }
      setUncertainCloseOpen(false);
      onRequestClose(reason === 'created' ? 'created' : 'dismiss');
    },
    [onRequestClose, submitting, uncertainRequest],
  );
  const requestNativeBack = useCallback(() => {
    if (submitting) {
      return;
    }
    if (nativeBackHandlerRef.current) {
      nativeBackHandlerRef.current();
      return;
    }
    requestClose('native-back');
  }, [requestClose, submitting]);
  const registerNativeBackHandler = useCallback((handler: (() => void) | null) => {
    nativeBackHandlerRef.current = handler;
  }, []);
  const { dialogRef } = useOverlayLifecycle({
    fallbackFocusRef,
    focusScopeRef: uncertainCloseOpen ? uncertainCloseRef : undefined,
    onRequestClose: requestClose,
    open: overlayVisible || uncertainCloseOpen,
    preferredFocusRef: expandControlRef,
    triggerFocusRef,
  });

  useEffect(() => {
    if (!uncertainCloseOpen || !web || typeof document === 'undefined') {
      return;
    }
    const frame = requestAnimationFrame(() => {
      const confirmation = uncertainCloseRef.current as unknown as HTMLElement | null;
      confirmation?.querySelector<HTMLElement>('button:not([disabled])')?.focus();
    });
    return () => cancelAnimationFrame(frame);
  }, [uncertainCloseOpen, web]);

  const uncertainCloseConfirmation = uncertainCloseOpen ? (
    <View style={[styles.uncertainCloseBackdrop, { backgroundColor: theme.overlayScrim }]}>
      <View
        accessibilityLabel="접수 결과 확인"
        accessibilityViewIsModal
        ref={uncertainCloseRef}
        role="alertdialog"
        style={[
          styles.uncertainCloseDialog,
          elevation.overlay,
          { backgroundColor: theme.backgroundElevated, borderColor: theme.borderDefault },
        ]}
      >
        <Text style={[styles.uncertainCloseText, { color: theme.foregroundPrimary }]}>
          접수 결과를 확인하지 못했어요. 닫아도 게시될 수 있어요.
        </Text>
        <View style={styles.uncertainCloseActions}>
          <Button
            disabled={submitting || uncertainRequest?.retry === undefined}
            onPress={() => {
              const retry = uncertainRequest?.retry;
              setUncertainCloseOpen(false);
              retry?.();
              if (web && typeof document !== 'undefined') {
                requestAnimationFrame(() => {
                  const surface = dialogRef.current as unknown as HTMLElement | null;
                  if (
                    surface &&
                    document.contains(surface) &&
                    surface.getClientRects().length > 0
                  ) {
                    surface.focus();
                  }
                });
              }
            }}
            tone="secondary"
          >
            다시 확인
          </Button>
          <Button
            onPress={() => {
              setUncertainCloseOpen(false);
              onRequestClose('dismiss');
            }}
            tone="danger"
          >
            닫기
          </Button>
        </View>
      </View>
    </View>
  ) : null;

  const header =
    mode === 'overlay' ? (
      <View style={[styles.header, { borderColor: theme.borderSubtle }]}>
        <Text accessibilityRole="header" style={[styles.title, { color: theme.foregroundPrimary }]}>
          글쓰기
        </Text>
        <IconButton
          accessibilityLabel="글쓰기 닫기"
          disabled={submitting}
          onPress={() => requestClose()}
          style={styles.closeButton}
          targetSize={40}
        >
          <XIcon color={theme.foregroundPrimary} size={20} strokeWidth={2} />
        </IconButton>
      </View>
    ) : null;

  const composer = (
    <ToastProvider>
      <PostComposerController
        expandControlRef={expandControlRef}
        expanded={overlayVisible}
        focusOnMount={overlayVisible}
        onPostRequestAccepted={() => requestClose('created')}
        onPostRequestUncertainChange={(uncertain, retry) =>
          setUncertainRequest(uncertain ? { retry } : null)
        }
        onSubmittingChange={setSubmitting}
        profile={profile}
        profiles={profiles}
        registerNativeBackHandler={registerNativeBackHandler}
        renderSurface={({ form, mediaEditorOpen }) => (
          <View
            accessibilityLabel={overlayVisible ? '글쓰기' : undefined}
            accessibilityViewIsModal={overlayVisible}
            aria-modal={overlayVisible || undefined}
            onAccessibilityEscape={requestNativeBack}
            ref={dialogRef}
            role={overlayVisible ? 'dialog' : undefined}
            tabIndex={web ? -1 : undefined}
            style={[
              styles.dialog,
              mode !== 'rail' && !nativeMobile && elevation.overlay,
              mode === 'rail'
                ? styles.railDialog
                : mode === 'mobile'
                  ? styles.mobileDialog
                  : styles.overlayDialog,
              mediaEditorOpen && web && mode === 'overlay' ? styles.mediaEditorDialog : null,
              { backgroundColor: composerSurface, borderColor: theme.borderDefault },
            ]}
            testID={mode === 'rail' ? 'post-composer-rail' : 'post-composer-dialog'}
          >
            <View
              accessibilityElementsHidden={uncertainCloseOpen}
              aria-hidden={uncertainCloseOpen || undefined}
              importantForAccessibility={uncertainCloseOpen ? 'no-hide-descendants' : 'auto'}
              style={[
                styles.clippedSurface,
                mode === 'overlay' ? { borderRadius: radii.lg } : null,
                mode === 'mobile' || (mediaEditorOpen && web && mode === 'overlay')
                  ? styles.composerFrameFill
                  : null,
              ]}
            >
              <OverlayPortalProvider hostRef={dialogRef}>
                {header}
                <KeyboardAvoidingView
                  behavior="height"
                  keyboardVerticalOffset={insets.top}
                  style={[
                    styles.composerFrame,
                    mode === 'mobile' || (mediaEditorOpen && web && mode === 'overlay')
                      ? styles.composerFrameFill
                      : null,
                  ]}
                >
                  {form}
                </KeyboardAvoidingView>
              </OverlayPortalProvider>
            </View>
            {uncertainCloseConfirmation}
          </View>
        )}
        {...(mode === 'rail'
          ? { onExpand, onRequestClose: requestClose, presentation: mode }
          : { onRequestClose: requestClose, presentation: mode })}
      />
    </ToastProvider>
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
            style={[
              styles.nativeMobileSurface,
              safeAreaStyle,
              { backgroundColor: theme.backgroundCanvas },
            ]}
          >
            {composer}
          </View>
        ) : (
          <OverlayBackdrop
            onRequestClose={requestClose}
            style={[styles.nativeBackdrop, safeAreaStyle, { backgroundColor: theme.overlayScrim }]}
            testID="post-composer-backdrop"
          >
            <Pressable onPress={(event) => event.stopPropagation()} style={styles.nativeDialogWrap}>
              {composer}
            </Pressable>
          </OverlayBackdrop>
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
        <OverlayBackdrop onRequestClose={requestClose} style={styles.webBackdrop} />
      ) : null}
      {composer}
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
  webMobileHost: { height: '100dvh' as never, padding: 0 },
  webBackdrop: { bottom: 0, left: 0, position: 'absolute', right: 0, top: 0 },
  hiddenHost: { display: 'none' },
  nativeBackdrop: { flex: 1, justifyContent: 'center' },
  nativeDialogWrap: { flex: 1, justifyContent: 'center' },
  nativeMobileSurface: { flex: 1 },
  // Only the visual surface clips; dropdown portals stay in the existing dialog focus scope.
  dialog: { minHeight: 0, overflow: 'visible', position: 'relative' },
  clippedSurface: { minHeight: 0, flexShrink: 1, overflow: 'hidden' },
  railDialog: { borderWidth: 0, width: '100%' },
  overlayDialog: {
    borderRadius: radii.lg,
    borderWidth: 1,
    marginTop: spacing.xxl,
    maxWidth: 640,
    maxHeight: 'calc(100dvh - 96px)' as never,
    width: '100%',
  },
  mediaEditorDialog: {
    height: 678,
    maxWidth: 'min(920px, calc(100vw - 48px))' as never,
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
  uncertainCloseBackdrop: {
    alignItems: 'center',
    bottom: 0,
    justifyContent: 'center',
    left: 0,
    padding: spacing.lg,
    position: 'absolute',
    right: 0,
    top: 0,
    zIndex: 10,
  },
  uncertainCloseDialog: {
    borderRadius: radii.lg,
    borderWidth: 1,
    gap: spacing.lg,
    maxWidth: 420,
    padding: spacing.xl,
    width: '100%',
  },
  uncertainCloseText: textStyles.uiCopyM,
  uncertainCloseActions: { flexDirection: 'row', justifyContent: 'flex-end', gap: spacing.sm },
});
