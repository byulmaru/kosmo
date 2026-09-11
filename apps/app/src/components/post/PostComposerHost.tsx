import { XIcon } from 'lucide-react-native';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { IconButton } from '@/components/ui/IconButton';
import { useSafeAreaPadding } from '@/components/ui/useSafeAreaPadding';
import { useElevation, useTheme } from '@/theme/ThemeProvider';
import { fontFamilies, radii, spacing, typography } from '@/theme/tokens';
import { PostComposer } from './PostComposer';
import type { RefObject } from 'react';
import type { PostComposer_profile$key } from './__generated__/PostComposer_profile.graphql';
import type { PostComposerCreatedPost } from './PostComposer';

export type PostComposerHostMode = 'mobile' | 'overlay' | 'rail';

type PostComposerHostProps = {
  mode: PostComposerHostMode;
  onExpand?: () => void;
  onPostCreated?: (post: PostComposerCreatedPost) => void;
  onRequestClose: () => void;
  open: boolean;
  profile: PostComposer_profile$key;
  triggerFocusRef?: RefObject<HTMLElement | null>;
};

export function PostComposerHost({
  mode,
  onExpand,
  onPostCreated,
  onRequestClose,
  open,
  profile,
  triggerFocusRef,
}: PostComposerHostProps) {
  const theme = useTheme();
  const elevation = useElevation();
  const dialogRef = useRef<View>(null);
  const expandControlRef = useRef<View>(null);
  const restoreFocusRef = useRef<HTMLElement | null>(null);
  const wasOverlayVisibleRef = useRef(false);
  const [editingMedia, setEditingMedia] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const web = Platform.OS === 'web';
  const hasWebDocument = web && typeof document !== 'undefined';
  const overlayVisible = mode !== 'rail' && open;
  const safeAreaStyle = useSafeAreaPadding(mode === 'mobile' ? 0 : spacing.lg);

  const requestClose = useCallback(() => {
    if (submitting) {
      return;
    }
    onRequestClose();
  }, [onRequestClose, submitting]);

  const handlePostCreated = useCallback(
    (post: PostComposerCreatedPost) => {
      onPostCreated?.(post);
      if (overlayVisible) {
        onRequestClose();
      }
    },
    [onPostCreated, onRequestClose, overlayVisible],
  );

  useEffect(() => {
    if (!hasWebDocument) {
      return;
    }

    if (overlayVisible && !wasOverlayVisibleRef.current) {
      restoreFocusRef.current = document.activeElement as HTMLElement | null;
    }
    if (!overlayVisible && wasOverlayVisibleRef.current) {
      requestAnimationFrame(() => {
        const railTrigger = expandControlRef.current as unknown as HTMLElement | null;
        const triggerFocus =
          railTrigger && document.contains(railTrigger) ? railTrigger : triggerFocusRef?.current;
        const previousFocus =
          triggerFocus && document.contains(triggerFocus) ? triggerFocus : restoreFocusRef.current;
        if (previousFocus && document.contains(previousFocus)) {
          previousFocus.focus();
        }
      });
    }
    wasOverlayVisibleRef.current = overlayVisible;
  }, [hasWebDocument, overlayVisible, triggerFocusRef]);

  useEffect(() => {
    if (!hasWebDocument || !overlayVisible) {
      return;
    }

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [hasWebDocument, overlayVisible]);

  useEffect(() => {
    if (!hasWebDocument || !overlayVisible) {
      return;
    }

    const dialog = dialogRef.current as unknown as HTMLElement | null;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        if (dialog?.querySelector('[role="menu"]')) {
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
      ).filter((element) => element.getAttribute('aria-hidden') !== 'true');
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

    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [hasWebDocument, overlayVisible, requestClose]);

  const composer = (
    <PostComposer
      expandControlRef={expandControlRef}
      focusOnMount={overlayVisible}
      onExpand={onExpand}
      onMediaEditorOpenChange={setEditingMedia}
      onPostCreated={handlePostCreated}
      onRequestClose={requestClose}
      onSubmittingChange={setSubmitting}
      presentation={mode}
      profile={profile}
    />
  );

  const header =
    mode === 'overlay' && !editingMedia ? (
      <View style={[styles.header, { borderColor: theme.border }]}>
        <Text accessibilityRole="header" style={[styles.title, { color: theme.text }]}>
          글쓰기
        </Text>
        <IconButton
          accessibilityLabel="글쓰기 닫기"
          disabled={submitting}
          feedback="opacity"
          onPress={requestClose}
          targetSize={Platform.OS === 'ios' ? 44 : Platform.OS === 'android' ? 48 : 36}
          visualSize={Platform.OS === 'web' ? 32 : undefined}
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
        elevation.overlay,
        mode === 'rail'
          ? styles.railDialog
          : mode === 'mobile'
            ? styles.mobileDialog
            : editingMedia
              ? styles.mediaEditorDialog
              : styles.overlayDialog,
        { backgroundColor: theme.card, borderColor: theme.border },
      ]}
      testID={mode === 'rail' ? 'post-composer-rail' : 'post-composer-dialog'}
    >
      {header}
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.composerFrame}
      >
        <ScrollView
          contentContainerStyle={styles.composerContent}
          keyboardShouldPersistTaps="handled"
          style={styles.composerScroll}
        >
          {composer}
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );

  if (!web) {
    return (
      <Modal
        accessibilityLabel="글쓰기"
        accessibilityViewIsModal
        animationType="fade"
        onRequestClose={requestClose}
        navigationBarTranslucent
        role="dialog"
        statusBarTranslucent
        transparent
        visible={overlayVisible}
      >
        <Pressable
          onPress={requestClose}
          style={[styles.nativeBackdrop, safeAreaStyle, { backgroundColor: theme.overlayScrim }]}
        >
          <Pressable onPress={(event) => event.stopPropagation()} style={styles.nativeDialogWrap}>
            {dialog}
          </Pressable>
        </Pressable>
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
      {mode !== 'rail' ? <Pressable onPress={requestClose} style={styles.webBackdrop} /> : null}
      {dialog}
    </View>
  );
}

const styles = StyleSheet.create({
  railHost: { minWidth: 0, width: '100%' },
  webOverlayHost: {
    alignItems: 'center',
    bottom: 0,
    justifyContent: 'center',
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
  dialog: { borderWidth: 1, minHeight: 0, overflow: 'hidden' },
  railDialog: { borderWidth: 0, width: '100%' },
  overlayDialog: {
    borderRadius: radii.lg,
    height: 720,
    maxHeight: 'min(720px, 85dvh)' as never,
    width: 600,
  },
  mobileDialog: { borderRadius: 0, borderWidth: 0, height: '100%', width: '100%' },
  mediaEditorDialog: {
    borderRadius: radii.lg,
    height: 678,
    maxHeight: 'min(678px, 85dvh)' as never,
    width: 'min(920px, calc(100vw - 48px))' as never,
  },
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
  composerFrame: { flex: 1, minHeight: 0 },
  composerScroll: { flex: 1, minHeight: 0 },
  composerContent: { flexGrow: 1 },
});
