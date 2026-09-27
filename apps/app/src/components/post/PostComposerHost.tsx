import { XIcon } from 'lucide-react-native';
import { useCallback, useRef, useState } from 'react';
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
import { OverlayBackdrop, useOverlayLifecycle } from '@/components/ui/Overlay';
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
  const [submitting, setSubmitting] = useState(false);
  const web = Platform.OS === 'web';
  const nativeMobile = !web && mode === 'mobile';
  const overlayVisible = mode !== 'rail' && open;
  const safeAreaStyle = useSafeAreaPadding(mode === 'mobile' ? 0 : spacing.lg);
  const expandControlRef = useRef<View>(null);
  const nativeBackHandlerRef = useRef<(() => void) | null>(null);
  const requestClose = useCallback(
    (reason: PostComposerRequestCloseReason = 'dismiss') => {
      if (reason !== 'created' && submitting) {
        return;
      }
      onRequestClose(reason === 'created' ? 'created' : 'dismiss');
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
    requestClose('native-back');
  }, [requestClose, submitting]);
  const registerNativeBackHandler = useCallback((handler: (() => void) | null) => {
    nativeBackHandlerRef.current = handler;
  }, []);
  const { dialogRef } = useOverlayLifecycle({
    fallbackFocusRef,
    onRequestClose: requestClose,
    open: overlayVisible,
    preferredFocusRef: expandControlRef,
    triggerFocusRef,
  });

  const composer = (
    <PostComposerController
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
    <ToastProvider>
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
            style={[styles.nativeMobileSurface, safeAreaStyle, { backgroundColor: theme.card }]}
          >
            {dialog}
          </View>
        ) : (
          <OverlayBackdrop
            onRequestClose={requestClose}
            style={[styles.nativeBackdrop, safeAreaStyle, { backgroundColor: theme.overlayScrim }]}
            testID="post-composer-backdrop"
          >
            <Pressable onPress={(event) => event.stopPropagation()} style={styles.nativeDialogWrap}>
              {dialog}
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
