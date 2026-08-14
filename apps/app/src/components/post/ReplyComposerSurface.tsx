import { useRouter } from 'expo-router';
import { XIcon } from 'lucide-react-native';
import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState } from 'react';
import {
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { graphql, useFragment, useRelayEnvironment } from 'react-relay';
import { getDataIDsFromFragment, getFragment } from 'relay-runtime';
import { ProfileNameBlock } from '@/components/profile/ProfileNameBlock';
import { Avatar } from '@/components/ui/Avatar';
import { Button } from '@/components/ui/Button';
import { IconButton } from '@/components/ui/IconButton';
import { useToast } from '@/components/ui/ToastProvider';
import { formatTimelineTimestamp } from '@/lib/date';
import { useRelayEnvironmentGeneration } from '@/relay/RelayEnvironmentBoundary';
import { useElevation, useTheme } from '@/theme/ThemeProvider';
import { radii, spacing, typography } from '@/theme/tokens';
import { PostBody } from './PostBody';
import { PostComposer } from './PostComposer';
import { PostSourcePreview } from './PostSourcePresentationView';
import { PostThreadConnector } from './PostThreadConnector';
import { getReplySurfacePresentation } from './replySurface';
import type { Href } from 'expo-router';
import type { ForwardedRef, RefObject } from 'react';
import type { TextInput, View as NativeView } from 'react-native';
import type { ReplyComposerSurface_parent$key } from './__generated__/ReplyComposerSurface_parent.graphql';
import type { ReplyComposerSurface_profile$key } from './__generated__/ReplyComposerSurface_profile.graphql';
import type { PostComposerCreatedPost } from './PostComposer';

const ReplyComposerSurfaceParentFragment = graphql`
  fragment ReplyComposerSurface_parent on Post {
    id
    createdAt
    content {
      bodyText
      contentWarning
    }
    profile {
      displayName
      handle
      avatar {
        id
        url
      }
      ...ProfileNameBlock_profile
    }
    repostSource {
      ...PostSourcePreview_source
    }
    ...PostBody_post
  }
`;

const ReplyComposerSurfaceProfileFragment = graphql`
  fragment ReplyComposerSurface_profile on Profile {
    relativeHandle
    ...PostComposer_profile @alias(as: "composer")
  }
`;

const ReplyComposerSurfaceParentFragmentNode = getFragment(ReplyComposerSurfaceParentFragment);
const ReplyComposerSurfaceProfileFragmentNode = getFragment(ReplyComposerSurfaceProfileFragment);

type ReplyComposerSurfaceProps = {
  onPostCreated?: (post: PostComposerCreatedPost) => void;
  onRequestClose: () => void;
  open: boolean;
  owner: 'detail' | 'list';
  parent: ReplyComposerSurface_parent$key;
  profile: ReplyComposerSurface_profile$key;
  triggerRef?: RefObject<NativeView | null>;
};

export type ReplyComposerSurfaceHandle = {
  requestClose: (onClosed?: () => void) => void;
};

export const ReplyComposerSurface = forwardRef<
  ReplyComposerSurfaceHandle,
  ReplyComposerSurfaceProps
>(function ReplyComposerSurface(props, ref) {
  const environment = useRelayEnvironment();
  const environmentGenerationRef = useRelayEnvironmentGeneration();
  const environmentRef = useRef(environment);
  const identityRef = useRef(
    `${String(getDataIDsFromFragment(ReplyComposerSurfaceParentFragmentNode, props.parent))}:${String(
      getDataIDsFromFragment(ReplyComposerSurfaceProfileFragmentNode, props.profile),
    )}:${props.open ? 'open' : 'closed'}`,
  );
  const contextGuard = useRef(0);
  const identity = `${String(
    getDataIDsFromFragment(ReplyComposerSurfaceParentFragmentNode, props.parent),
  )}:${String(getDataIDsFromFragment(ReplyComposerSurfaceProfileFragmentNode, props.profile))}:${
    props.open ? 'open' : 'closed'
  }`;

  if (!environmentGenerationRef && environmentRef.current !== environment) {
    environmentRef.current = environment;
    contextGuard.current += 1;
  }
  if (identityRef.current !== identity) {
    identityRef.current = identity;
    contextGuard.current += 1;
  }

  return (
    <ReplyComposerSurfaceContents
      {...props}
      contextGuard={contextGuard}
      key={`${contextGuard.current}:${environmentGenerationRef?.current ?? 0}`}
      surfaceRef={ref}
    />
  );
});

type ReplyComposerSurfaceContentsProps = ReplyComposerSurfaceProps & {
  contextGuard: RefObject<number>;
  surfaceRef: ForwardedRef<ReplyComposerSurfaceHandle>;
};

function ReplyComposerSurfaceContents({
  contextGuard,
  onPostCreated,
  onRequestClose,
  open,
  owner,
  parent: parentKey,
  profile: profileKey,
  surfaceRef,
  triggerRef,
}: ReplyComposerSurfaceContentsProps) {
  const theme = useTheme();
  const elevation = useElevation();
  const router = useRouter();
  const { showToast } = useToast();
  const { width } = useWindowDimensions();
  const parent = useFragment(ReplyComposerSurfaceParentFragment, parentKey);
  const profile = useFragment(ReplyComposerSurfaceProfileFragment, profileKey);
  const [submitting, setSubmitting] = useState(false);
  const [discardConfirmOpen, setDiscardConfirmOpen] = useState(false);
  const dialogRef = useRef<NativeView>(null);
  const discardConfirmRef = useRef<NativeView>(null);
  const editorRef = useRef<TextInput>(null);
  const closeAfterDiscardRef = useRef<(() => void) | undefined>(undefined);
  const replyPlatform =
    Platform.OS === 'ios' || Platform.OS === 'android' ? Platform.OS : ('web' as const);
  const presentation = getReplySurfacePresentation(owner, replyPlatform, width);
  const webOverlayOpen = open && presentation !== 'inline' && Platform.OS === 'web';

  useEffect(() => {
    if (open) {
      setSubmitting(false);
      setDiscardConfirmOpen(false);
      closeAfterDiscardRef.current = undefined;
    }
  }, [open, parent.id]);

  const closeImmediately = useCallback(
    (onClosed?: () => void) => {
      setDiscardConfirmOpen(false);
      closeAfterDiscardRef.current = undefined;
      onRequestClose();
      onClosed?.();
    },
    [onRequestClose],
  );

  const requestClose = useCallback(
    (onClosed?: () => void) => {
      if (submitting || discardConfirmOpen) {
        return;
      }
      closeAfterDiscardRef.current = onClosed;
      setDiscardConfirmOpen(true);
    },
    [discardConfirmOpen, submitting],
  );
  const requestCloseRef = useRef(requestClose);
  requestCloseRef.current = requestClose;
  useImperativeHandle(surfaceRef, () => ({ requestClose }), [requestClose]);

  const continueEditing = useCallback(() => {
    closeAfterDiscardRef.current = undefined;
    setDiscardConfirmOpen(false);
    requestAnimationFrame(() => editorRef.current?.focus());
  }, []);

  const handlePostCreated = useCallback(
    (post: PostComposerCreatedPost) => {
      closeImmediately();
      showToast('답글을 게시했어요', {
        action: {
          label: '보기',
          onPress: () => router.push(`/${profile.relativeHandle}/${post.id}` as Href),
        },
      });
      requestAnimationFrame(() => onPostCreated?.(post));
    },
    [closeImmediately, onPostCreated, profile.relativeHandle, router, showToast],
  );

  useEffect(() => {
    if (!webOverlayOpen) {
      return;
    }

    const previousFocus = document.activeElement as HTMLElement | null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previousOverflow;
      requestAnimationFrame(() => {
        const trigger = triggerRef?.current as unknown as HTMLElement | null;
        (trigger ?? previousFocus)?.focus();
      });
    };
  }, [triggerRef, webOverlayOpen]);

  useEffect(() => {
    if (!open || Platform.OS !== 'web' || (presentation === 'inline' && !discardConfirmOpen)) {
      return;
    }

    const dialog = dialogRef.current as unknown as HTMLElement | null;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        if (!discardConfirmOpen && dialog?.querySelector('[role="menu"]')) {
          return;
        }
        event.preventDefault();
        if (discardConfirmOpen) {
          continueEditing();
          return;
        }
        requestCloseRef.current();
        return;
      }
      if (event.key !== 'Tab') {
        return;
      }

      const focusRoot = discardConfirmOpen
        ? (discardConfirmRef.current as unknown as HTMLElement | null)
        : dialog;
      const focusable = Array.from(
        focusRoot?.querySelectorAll<HTMLElement>(
          'button:not([disabled]), textarea:not([disabled]), input:not([disabled]), [href], [tabindex]:not([tabindex="-1"])',
        ) ?? [],
      ).filter((element) => element.getAttribute('aria-hidden') !== 'true');
      if (focusable.length === 0) {
        return;
      }

      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last?.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first?.focus();
      }
    };

    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [continueEditing, discardConfirmOpen, open, presentation]);

  useEffect(() => {
    if (!discardConfirmOpen || Platform.OS !== 'web') {
      return;
    }
    const frame = requestAnimationFrame(() => {
      const confirm = discardConfirmRef.current as unknown as HTMLElement | null;
      confirm?.querySelector<HTMLElement>('button:not([disabled])')?.focus();
    });
    return () => cancelAnimationFrame(frame);
  }, [discardConfirmOpen]);

  useEffect(() => {
    if (!open || presentation !== 'inline') {
      return;
    }
    return () => {
      requestAnimationFrame(() => {
        const trigger = triggerRef?.current as unknown as HTMLElement | null;
        trigger?.focus();
      });
    };
  }, [open, presentation, triggerRef]);

  if (!open) {
    return null;
  }

  const discardConfirm = discardConfirmOpen ? (
    <View style={[styles.confirmBackdrop, { backgroundColor: theme.overlayScrim }]}>
      <View
        accessibilityLabel="답글 작성을 취소할까요?"
        accessibilityViewIsModal
        ref={discardConfirmRef}
        role="alertdialog"
        style={[
          styles.confirm,
          elevation.overlay,
          { backgroundColor: theme.card, borderColor: theme.border },
        ]}
      >
        <Text accessibilityRole="header" style={[styles.confirmTitle, { color: theme.text }]}>
          답글 작성을 취소할까요?
        </Text>
        <Text style={[styles.confirmDescription, { color: theme.textSecondary }]}>
          작성 중인 내용은 저장되지 않습니다.
        </Text>
        <View style={styles.confirmActions}>
          <Button onPress={continueEditing} tone="secondary">
            계속 작성
          </Button>
          <Button onPress={() => closeImmediately(closeAfterDiscardRef.current)} tone="danger">
            작성 취소
          </Button>
        </View>
      </View>
    </View>
  ) : null;

  if (presentation === 'inline') {
    return (
      <View ref={dialogRef} style={styles.inline}>
        <View
          accessibilityElementsHidden={discardConfirmOpen}
          aria-hidden={discardConfirmOpen || undefined}
          importantForAccessibility={discardConfirmOpen ? 'no-hide-descendants' : 'auto'}
          style={discardConfirmOpen ? styles.mainBlocked : null}
        >
          <PostComposer
            contextGuard={contextGuard}
            editorRef={editorRef}
            focusOnMount
            initialContentWarning={parent.content?.contentWarning}
            onPostCreated={handlePostCreated}
            onSubmittingChange={setSubmitting}
            profile={profile.composer}
            replyParentId={parent.id}
          />
        </View>
        {discardConfirm}
      </View>
    );
  }

  const closeControlSize = Platform.OS === 'ios' ? 44 : Platform.OS === 'android' ? 48 : 36;

  return (
    <Modal
      accessibilityLabel="답글 쓰기"
      animationType={Platform.OS === 'web' ? 'none' : 'fade'}
      onRequestClose={() => {
        if (Platform.OS !== 'web') {
          requestClose();
        }
      }}
      role="dialog"
      transparent
      visible
    >
      <Pressable
        onPress={() => requestClose()}
        style={[
          styles.backdrop,
          presentation === 'fullscreen' ? styles.fullscreenBackdrop : null,
          { backgroundColor: theme.overlayScrim },
        ]}
      >
        <Pressable
          accessibilityViewIsModal
          onPress={(event) => event.stopPropagation()}
          ref={dialogRef}
          style={[
            styles.dialog,
            elevation.overlay,
            presentation === 'fullscreen' ? styles.fullscreen : styles.modal,
            {
              backgroundColor: theme.card,
              borderColor: theme.border,
            },
          ]}
          testID="reply-composer-dialog-surface"
        >
          <SafeAreaView style={styles.safeArea}>
            <View
              accessibilityElementsHidden={discardConfirmOpen}
              aria-hidden={discardConfirmOpen || undefined}
              importantForAccessibility={discardConfirmOpen ? 'no-hide-descendants' : 'auto'}
              style={[styles.main, discardConfirmOpen ? styles.mainBlocked : null]}
            >
              <View style={[styles.header, { borderColor: theme.border }]}>
                <Text accessibilityRole="header" style={[styles.title, { color: theme.text }]}>
                  답글 쓰기
                </Text>
                <IconButton
                  accessibilityLabel="닫기"
                  disabled={submitting}
                  hitSlop={4}
                  onPress={() => requestClose()}
                  style={{ height: closeControlSize, width: closeControlSize }}
                  targetSize={closeControlSize}
                  visualSize={closeControlSize}
                  visualStyle={({ pressed }) => [
                    styles.close,
                    {
                      backgroundColor: pressed ? theme.surface : 'transparent',
                      opacity: submitting ? 0.45 : 1,
                    },
                  ]}
                >
                  <XIcon color={theme.text} size={20} strokeWidth={2} />
                </IconButton>
              </View>
              <KeyboardAvoidingView
                behavior={Platform.OS === 'ios' ? 'padding' : undefined}
                style={styles.composerFrame}
              >
                <PostComposer
                  beforeEditor={
                    <View style={styles.parent} testID="reply-parent">
                      <View style={styles.parentAvatarColumn}>
                        <Avatar
                          imageUri={parent.profile.avatar?.url}
                          label={parent.profile.displayName || parent.profile.handle}
                          size={40}
                        />
                        <PostThreadConnector
                          style={styles.parentConnector}
                          testID="reply-parent-thread-connector"
                        />
                      </View>
                      <View style={styles.parentContent}>
                        <View style={styles.parentIdentity}>
                          <ProfileNameBlock profile={parent.profile} />
                          <Text style={[styles.timestamp, { color: theme.textSecondary }]}>
                            {formatTimelineTimestamp(parent.createdAt)}
                          </Text>
                        </View>
                        <PostBody interactive={false} post={parent} />
                        {parent.repostSource ? (
                          <PostSourcePreview
                            interactive={false}
                            source={parent.repostSource}
                            style={styles.source}
                          />
                        ) : null}
                      </View>
                    </View>
                  }
                  contextGuard={contextGuard}
                  editorRef={editorRef}
                  focusOnMount
                  initialContentWarning={parent.content?.contentWarning}
                  onPostCreated={handlePostCreated}
                  onSubmittingChange={setSubmitting}
                  profile={profile.composer}
                  replyParentId={parent.id}
                  scrollable
                  surface
                />
              </KeyboardAvoidingView>
            </View>
            {discardConfirm}
          </SafeAreaView>
        </Pressable>
      </Pressable>
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
  fullscreenBackdrop: { padding: 0 },
  dialog: {
    borderWidth: 1,
    maxHeight: '85dvh' as never,
    overflow: 'hidden',
  },
  modal: {
    borderRadius: radii.lg,
    height: 720,
    maxHeight: 'min(720px, 85dvh)' as never,
    width: 600,
  },
  fullscreen: {
    borderRadius: 0,
    borderWidth: 0,
    height: '100%',
    maxHeight: '100%',
    width: '100%',
  },
  safeArea: { flex: 1, minHeight: 0, width: '100%' },
  main: { flex: 1, minHeight: 0, width: '100%' },
  mainBlocked: { pointerEvents: 'none' },
  inline: { position: 'relative' },
  composerFrame: { flex: 1, minHeight: 0 },
  header: {
    alignItems: 'center',
    borderBottomWidth: 1,
    flexDirection: 'row',
    justifyContent: 'space-between',
    minHeight: 56,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    width: '100%',
  },
  title: { fontFamily: 'SUIT', fontWeight: '800', ...typography.lg },
  close: { alignItems: 'center', borderRadius: radii.full, justifyContent: 'center' },
  parent: {
    alignItems: 'stretch',
    flexDirection: 'row',
    gap: spacing.md,
    paddingBottom: spacing.lg,
  },
  parentAvatarColumn: { position: 'relative', width: 40 },
  parentConnector: {
    bottom: -spacing.md,
    left: '50%',
    top: 40 + spacing.xs,
    transform: [{ translateX: -1 }],
  },
  parentContent: { flex: 1, gap: spacing.md, minWidth: 0 },
  parentIdentity: { flex: 1, minWidth: 0 },
  timestamp: { fontFamily: 'SUIT', marginTop: spacing.xs, ...typography.xsm },
  source: { marginTop: spacing.sm },
  confirmBackdrop: {
    bottom: 0,
    left: 0,
    position: 'absolute',
    right: 0,
    top: 0,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.lg,
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
