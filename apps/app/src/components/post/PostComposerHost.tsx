import { XIcon } from 'lucide-react-native';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Animated,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { IconButton } from '@/components/ui/IconButton';
import { OverlayBackdrop, useOverlayLifecycle } from '@/components/ui/Overlay';
import { ToastProvider } from '@/components/ui/ToastProvider';
import { useSafeAreaPadding } from '@/components/ui/useSafeAreaPadding';
import { useElevation, useTheme } from '@/theme/ThemeProvider';
import { radii, spacing, textStyles } from '@/theme/tokens';
import { useOverlayMotion } from '@/theme/useOverlayMotion';
import { PostComposerController } from './PostComposerController';
import type { RefObject } from 'react';
import type { OverlayCloseReason } from '@/components/ui/Overlay';
import type { PostComposer_profile$key } from './__generated__/PostComposer_profile.graphql';
import type { PostComposerProfileRef } from './PostComposerProfileSwitcher';

export type PostComposerHostMode = 'mobile' | 'overlay' | 'rail';
export type PostComposerHostCloseReason = 'created' | 'dismiss';

type PostComposerHostProps = {
  fallbackFocusRef?: RefObject<HTMLElement | null>;
  onDismiss?: () => void;
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
  onDismiss,
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
  const web = Platform.OS === 'web';
  const ComposerSurface = web ? View : Animated.View;
  const nativeMobile = !web && mode === 'mobile';
  const composerSurface =
    mode === 'rail'
      ? theme.backgroundSurface
      : mode === 'mobile'
        ? theme.backgroundCanvas
        : theme.backgroundElevated;
  const overlayVisible = mode !== 'rail' && open;
  const overlayMotion = useOverlayMotion(overlayVisible);
  const safeAreaStyle = useSafeAreaPadding(mode === 'mobile' ? 0 : spacing.lg);
  const expandControlRef = useRef<View>(null);
  const nativeBackHandlerRef = useRef<(() => void) | null>(null);
  const overlayExitStartedRef = useRef(false);
  const requestClose = useCallback(
    (reason: PostComposerRequestCloseReason = 'dismiss') => {
      if (reason !== 'created' && submitting) {
        return;
      }
      if (reason !== 'created' && !overlayVisible) {
        return;
      }
      onRequestClose(reason === 'created' ? 'created' : 'dismiss');
    },
    [onRequestClose, overlayVisible, submitting],
  );
  const requestNativeBack = useCallback(() => {
    if (!overlayVisible || submitting) {
      return;
    }
    if (nativeBackHandlerRef.current) {
      nativeBackHandlerRef.current();
      return;
    }
    requestClose('native-back');
  }, [overlayVisible, requestClose, submitting]);
  const registerNativeBackHandler = useCallback((handler: (() => void) | null) => {
    nativeBackHandlerRef.current = handler;
  }, []);
  useEffect(() => {
    if (mode === 'rail' || overlayVisible) {
      overlayExitStartedRef.current = false;
      return;
    }
    if (overlayMotion.mounted) {
      overlayExitStartedRef.current = true;
      return;
    }
    if (overlayExitStartedRef.current) {
      overlayExitStartedRef.current = false;
      onDismiss?.();
      if (web && typeof document !== 'undefined') {
        requestAnimationFrame(() => expandControlRef.current?.focus());
      }
    }
  }, [mode, onDismiss, overlayMotion.mounted, overlayVisible, web]);
  const { dialogRef } = useOverlayLifecycle({
    fallbackFocusRef,
    onRequestClose: requestClose,
    open: overlayVisible,
    preferredFocusRef: mode === 'rail' ? expandControlRef : undefined,
    triggerFocusRef,
  });

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
        onPostCreated={() => requestClose('created')}
        onSubmittingChange={setSubmitting}
        profile={profile}
        profiles={profiles}
        registerNativeBackHandler={registerNativeBackHandler}
        renderSurface={({ form, mediaEditorOpen }) => (
          <ComposerSurface
            accessibilityLabel={overlayVisible ? '글쓰기' : undefined}
            accessibilityViewIsModal={overlayVisible}
            aria-modal={overlayVisible || undefined}
            onAccessibilityEscape={requestNativeBack}
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
              mediaEditorOpen && web && mode === 'overlay' ? styles.mediaEditorDialog : null,
              mode !== 'rail' && !web
                ? {
                    opacity: overlayMotion.progress,
                    transform: [
                      {
                        translateY: overlayMotion.progress.interpolate({
                          inputRange: [0, 1],
                          outputRange: [spacing.sm, 0],
                        }),
                      },
                    ],
                  }
                : null,
              { backgroundColor: composerSurface, borderColor: theme.borderDefault },
            ]}
            testID={mode === 'rail' ? 'post-composer-rail' : 'post-composer-dialog'}
          >
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
          </ComposerSurface>
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
        animationType="none"
        onRequestClose={requestNativeBack}
        navigationBarTranslucent
        presentationStyle={mode === 'mobile' ? 'fullScreen' : undefined}
        role="dialog"
        statusBarTranslucent
        transparent={mode !== 'mobile'}
        visible={overlayMotion.mounted}
      >
        <Animated.View
          accessibilityElementsHidden={!overlayVisible}
          importantForAccessibility={overlayVisible ? 'auto' : 'no-hide-descendants'}
          pointerEvents={overlayVisible ? 'auto' : 'none'}
          style={{ flex: 1, opacity: overlayMotion.progress }}
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
              style={[
                styles.nativeBackdrop,
                safeAreaStyle,
                { backgroundColor: theme.overlayScrim },
              ]}
              testID="post-composer-backdrop"
            >
              <Pressable
                onPress={(event) => event.stopPropagation()}
                style={styles.nativeDialogWrap}
              >
                {composer}
              </Pressable>
            </OverlayBackdrop>
          )}
        </Animated.View>
      </Modal>
    );
  }

  const active = mode === 'rail' || overlayMotion.mounted;
  const webInteractionDisabled = !active || (mode !== 'rail' && !overlayVisible);
  return (
    <Animated.View
      accessibilityElementsHidden={!active}
      aria-hidden={webInteractionDisabled || undefined}
      pointerEvents={webInteractionDisabled ? 'none' : 'auto'}
      style={[
        mode === 'rail' ? styles.railHost : styles.webOverlayHost,
        mode === 'mobile' ? styles.webMobileHost : null,
        mode !== 'rail' ? safeAreaStyle : null,
        !active ? styles.hiddenHost : null,
        mode !== 'rail' ? { backgroundColor: theme.overlayScrim } : null,
        mode !== 'rail' ? { opacity: overlayMotion.progress } : null,
      ]}
    >
      <div inert={webInteractionDisabled} style={{ display: 'contents' }}>
        <View pointerEvents="box-none" style={styles.webBackdropLayer}>
          {mode !== 'rail' ? (
            <OverlayBackdrop onRequestClose={requestClose} style={styles.webBackdrop} />
          ) : null}
        </View>
        <Animated.View
          pointerEvents="box-none"
          style={[
            styles.webComposerLayer,
            mode !== 'rail' ? styles.webComposerLayerOverlay : null,
            mode !== 'rail'
              ? {
                  transform: [
                    {
                      translateY: overlayMotion.progress.interpolate({
                        inputRange: [0, 1],
                        outputRange: [spacing.sm, 0],
                      }),
                    },
                  ],
                }
              : null,
          ]}
        >
          {composer}
        </Animated.View>
      </div>
    </Animated.View>
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
  webBackdropLayer: { bottom: 0, left: 0, position: 'absolute', right: 0, top: 0 },
  webComposerLayer: { minWidth: 0, width: '100%' },
  webComposerLayerOverlay: { alignItems: 'center', flex: 1, minHeight: 0 },
  hiddenHost: { display: 'none' },
  nativeBackdrop: { flex: 1, justifyContent: 'center' },
  nativeDialogWrap: { flex: 1, justifyContent: 'center' },
  nativeMobileSurface: { flex: 1 },
  dialog: { minHeight: 0, overflow: 'hidden' },
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
});
