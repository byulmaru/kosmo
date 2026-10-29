import { useRouter } from 'expo-router';
import { XIcon } from 'lucide-react-native';
import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useLayoutEffect,
  useRef,
  useState,
} from 'react';
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
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { graphql, useFragment, useRelayEnvironment } from 'react-relay';
import { getDataIDsFromFragment, getFragment } from 'relay-runtime';
import { ProfileNameBlock } from '@/components/profile/ProfileNameBlock';
import { useNavigationGuard } from '@/components/shell/NavigationGuardContext';
import { Avatar } from '@/components/ui/Avatar';
import { Button } from '@/components/ui/Button';
import { IconButton } from '@/components/ui/IconButton';
import { OverlayBackdrop, useOverlayLifecycle } from '@/components/ui/Overlay';
import { ToastProvider, useToast } from '@/components/ui/ToastProvider';
import { useSafeAreaPadding } from '@/components/ui/useSafeAreaPadding';
import { formatTimelineTimestamp } from '@/lib/date';
import { useRelayEnvironmentGeneration } from '@/relay/RelayEnvironmentBoundary';
import { useElevation, useTheme } from '@/theme/ThemeProvider';
import { fontFamilies, layoutRecipes, radii, spacing, typography } from '@/theme/tokens';
import { PostBody } from './PostBody';
import { PostComposerController } from './PostComposerController';
import { PostSourcePreview } from './PostSourcePresentationView';
import { PostThreadConnector } from './PostThreadConnector';
import { getReplySurfacePresentation } from './replySurface';
import type { Href } from 'expo-router';
import type { ForwardedRef, RefObject } from 'react';
import type { TextInput, View as NativeView } from 'react-native';
import type { OverlayCloseReason } from '@/components/ui/Overlay';
import type { ReplyComposerSurface_parent$key } from './__generated__/ReplyComposerSurface_parent.graphql';
import type { ReplyComposerSurface_profile$key } from './__generated__/ReplyComposerSurface_profile.graphql';
import type { PostComposerCreatedPost } from './PostComposerController';

const ReplyComposerSurfaceParentFragment = graphql`
  fragment ReplyComposerSurface_parent on Post {
    ...PostSourcePreview_source
    id
    visibility
    createdAt
    content {
      bodyText
      contentWarning
      mentionedProfiles {
        id
        relativeHandle
      }
    }
    profile {
      id
      displayName
      handle
      relativeHandle
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
    id
    relativeHandle
    ...PostComposer_profile @alias(as: "composer")
  }
`;

const ReplyComposerSurfaceParentFragmentNode = getFragment(ReplyComposerSurfaceParentFragment);
const ReplyComposerSurfaceProfileFragmentNode = getFragment(ReplyComposerSurfaceProfileFragment);

type ReplyComposerSurfaceProps = {
  mode?: 'quote' | 'reply';
  onPostCreated?: (post: PostComposerCreatedPost) => void;
  onRequestClose: (willContinue?: boolean) => void;
  open: boolean;
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
    )}:${props.mode ?? 'reply'}:${props.open ? 'open' : 'closed'}`,
  );
  const contextGuard = useRef(0);
  const identity = `${String(
    getDataIDsFromFragment(ReplyComposerSurfaceParentFragmentNode, props.parent),
  )}:${String(getDataIDsFromFragment(ReplyComposerSurfaceProfileFragmentNode, props.profile))}:${
    props.mode ?? 'reply'
  }:${props.open ? 'open' : 'closed'}`;

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
  mode = 'reply',
  onPostCreated,
  onRequestClose,
  open,
  parent: parentKey,
  profile: profileKey,
  surfaceRef,
  triggerRef,
}: ReplyComposerSurfaceContentsProps) {
  const theme = useTheme();
  const elevation = useElevation();
  const router = useRouter();
  const { register: registerNavigationGuard } = useNavigationGuard();
  const { showToast } = useToast();
  const { width } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const parent = useFragment(ReplyComposerSurfaceParentFragment, parentKey);
  const profile = useFragment(ReplyComposerSurfaceProfileFragment, profileKey);
  const quoteMode = mode === 'quote';
  const initialBodyText = quoteMode
    ? undefined
    : [
        ...new Map(
          [parent.profile, ...(parent.content?.mentionedProfiles ?? [])]
            .filter(({ id }) => id !== profile.id)
            .map(({ id, relativeHandle }) => [id, relativeHandle] as const),
        ).values(),
      ]
        .map((relativeHandle) => `${relativeHandle} `)
        .join('');
  const composerName = quoteMode ? '인용 게시글' : '답글';
  const [submitting, setSubmitting] = useState(false);
  const [discardConfirmOpen, setDiscardConfirmOpen] = useState(false);
  const [fullscreenViewport, setFullscreenViewport] = useState<{
    height: number;
    offsetTop: number;
  } | null>(null);
  const [uncertainRequest, setUncertainRequest] = useState<{ retry?: () => void } | null>(null);
  const [uncertainCloseOpen, setUncertainCloseOpen] = useState(false);
  const discardConfirmRef = useRef<NativeView>(null);
  const editorRef = useRef<TextInput>(null);
  const nativeBackHandlerRef = useRef<(() => void) | null>(null);
  const closeAfterDiscardRef = useRef<(() => void) | undefined>(undefined);
  const restoreTriggerFocusRef = useRef(true);
  const replyPlatform =
    Platform.OS === 'ios' || Platform.OS === 'android' ? Platform.OS : ('web' as const);
  const presentation = getReplySurfacePresentation(replyPlatform, width);
  const webOverlayOpen = open && Platform.OS === 'web';
  const safeAreaStyle = useSafeAreaPadding(presentation === 'fullscreen' ? 0 : spacing.lg);
  const closeConfirmationOpen = discardConfirmOpen || uncertainCloseOpen;

  // Keep the web fullscreen surface inside the visible viewport when the software keyboard opens.
  useLayoutEffect(() => {
    if (!webOverlayOpen || presentation !== 'fullscreen') {
      return;
    }
    const viewport = typeof window === 'undefined' ? null : window.visualViewport;
    if (!viewport) {
      return;
    }
    const updateViewport = () => {
      const next = { height: viewport.height, offsetTop: viewport.offsetTop };
      setFullscreenViewport((current) =>
        current?.height === next.height && current.offsetTop === next.offsetTop ? current : next,
      );
    };
    updateViewport();
    viewport.addEventListener('resize', updateViewport);
    viewport.addEventListener('scroll', updateViewport);
    return () => {
      viewport.removeEventListener('resize', updateViewport);
      viewport.removeEventListener('scroll', updateViewport);
    };
  }, [presentation, webOverlayOpen]);

  useEffect(() => {
    if (open) {
      setSubmitting(false);
      setDiscardConfirmOpen(false);
      setUncertainCloseOpen(false);
      closeAfterDiscardRef.current = undefined;
    } else {
      setUncertainRequest(null);
    }
  }, [mode, open, parent.id]);

  const closeImmediately = useCallback(
    (onClosed?: () => void) => {
      setDiscardConfirmOpen(false);
      setUncertainCloseOpen(false);
      setUncertainRequest(null);
      closeAfterDiscardRef.current = undefined;
      restoreTriggerFocusRef.current = onClosed === undefined;
      onRequestClose(onClosed !== undefined);
      onClosed?.();
    },
    [onRequestClose],
  );

  const requestClose = useCallback(
    (onClosed?: () => void) => {
      if (submitting || closeConfirmationOpen) {
        return;
      }
      closeAfterDiscardRef.current = onClosed;
      if (uncertainRequest !== null) {
        setUncertainCloseOpen(true);
      } else {
        setDiscardConfirmOpen(true);
      }
    },
    [closeConfirmationOpen, submitting, uncertainRequest],
  );
  const continueEditing = useCallback(() => {
    closeAfterDiscardRef.current = undefined;
    setDiscardConfirmOpen(false);
    requestAnimationFrame(() => editorRef.current?.focus());
  }, []);
  const dismissCloseConfirmation = useCallback(() => {
    closeAfterDiscardRef.current = undefined;
    setDiscardConfirmOpen(false);
    setUncertainCloseOpen(false);
    if (!uncertainCloseOpen) {
      requestAnimationFrame(() => editorRef.current?.focus());
    }
  }, [uncertainCloseOpen]);
  const retryUncertainRequest = useCallback(() => {
    const retry = uncertainRequest?.retry;
    if (!retry) {
      return;
    }
    closeAfterDiscardRef.current = undefined;
    setUncertainCloseOpen(false);
    retry();
  }, [uncertainRequest]);
  const requestNavigation = useCallback(
    (action: () => void) => {
      if (submitting) {
        return true;
      }
      if (nativeBackHandlerRef.current) {
        nativeBackHandlerRef.current();
        return true;
      }
      if (closeConfirmationOpen) {
        return true;
      }
      requestClose(action);
      return true;
    },
    [closeConfirmationOpen, requestClose, submitting],
  );

  useEffect(() => {
    if (!open) {
      return;
    }
    return registerNavigationGuard(requestNavigation);
  }, [open, registerNavigationGuard, requestNavigation]);

  useImperativeHandle(surfaceRef, () => ({ requestClose }), [requestClose]);

  const requestNativeBack = useCallback(() => {
    if (submitting) {
      return;
    }
    if (closeConfirmationOpen) {
      dismissCloseConfirmation();
      return;
    }
    if (nativeBackHandlerRef.current) {
      nativeBackHandlerRef.current();
      return;
    }
    requestClose();
  }, [closeConfirmationOpen, dismissCloseConfirmation, requestClose, submitting]);
  const registerNativeBackHandler = useCallback((handler: (() => void) | null) => {
    nativeBackHandlerRef.current = handler;
  }, []);
  const handleOverlayRequestClose = useCallback(
    (reason: OverlayCloseReason) => {
      if (reason === 'escape' && closeConfirmationOpen) {
        dismissCloseConfirmation();
        return;
      }
      requestClose();
    },
    [closeConfirmationOpen, dismissCloseConfirmation, requestClose],
  );
  const { dialogRef } = useOverlayLifecycle({
    focusScopeRef: closeConfirmationOpen ? discardConfirmRef : undefined,
    onRequestClose: handleOverlayRequestClose,
    open: webOverlayOpen,
    shouldRestoreFocus: () => restoreTriggerFocusRef.current,
    triggerFocusRef: triggerRef as unknown as RefObject<HTMLElement | null> | undefined,
  });

  const handlePostCreated = useCallback(
    (post: PostComposerCreatedPost) => {
      closeImmediately();
      showToast(`${composerName}을 게시했어요`, {
        action: {
          label: '보기',
          onPress: () => router.push(`/${profile.relativeHandle}/${post.id}` as Href),
        },
        tone: 'success',
      });
      requestAnimationFrame(() => onPostCreated?.(post));
    },
    [closeImmediately, composerName, onPostCreated, profile.relativeHandle, router, showToast],
  );

  const handlePostRequestAccepted = useCallback(() => closeImmediately(), [closeImmediately]);

  useEffect(() => {
    if (!closeConfirmationOpen || uncertainCloseOpen || Platform.OS !== 'web') {
      return;
    }
    const frame = requestAnimationFrame(() => {
      const confirm = discardConfirmRef.current as unknown as HTMLElement | null;
      confirm?.querySelector<HTMLElement>('button:not([disabled])')?.focus();
    });
    return () => cancelAnimationFrame(frame);
  }, [closeConfirmationOpen, uncertainCloseOpen]);

  if (!open) {
    return null;
  }

  const closeConfirmation = closeConfirmationOpen ? (
    <View style={[styles.confirmBackdrop, { backgroundColor: theme.overlayScrim }]}>
      <View
        accessibilityLabel={
          uncertainCloseOpen ? '게시 요청 결과' : `${composerName} 작성을 취소할까요?`
        }
        accessibilityViewIsModal
        onAccessibilityEscape={dismissCloseConfirmation}
        ref={discardConfirmRef}
        role="alertdialog"
        style={[
          styles.confirm,
          elevation.overlay,
          { backgroundColor: theme.backgroundElevated, borderColor: theme.borderDefault },
        ]}
      >
        {uncertainCloseOpen ? null : (
          <Text
            accessibilityRole="header"
            style={[styles.confirmTitle, { color: theme.foregroundPrimary }]}
          >
            {composerName} 작성을 취소할까요?
          </Text>
        )}
        <Text style={[styles.confirmDescription, { color: theme.foregroundSecondary }]}>
          {uncertainCloseOpen
            ? '접수 결과를 확인하지 못했어요. 닫아도 게시될 수 있어요.'
            : '작성 중인 내용은 저장되지 않습니다.'}
        </Text>
        <View style={styles.confirmActions}>
          <Button
            disabled={uncertainCloseOpen && uncertainRequest?.retry === undefined}
            onPress={uncertainCloseOpen ? retryUncertainRequest : continueEditing}
            tone="secondary"
          >
            {uncertainCloseOpen ? '다시 확인' : '계속 작성'}
          </Button>
          <Button onPress={() => closeImmediately(closeAfterDiscardRef.current)} tone="danger">
            {uncertainCloseOpen ? '닫기' : '작성 취소'}
          </Button>
        </View>
      </View>
    </View>
  ) : null;

  const closeControlSize = Platform.OS === 'ios' ? 44 : Platform.OS === 'android' ? 48 : 36;

  return (
    <Modal
      accessibilityLabel={`${composerName} 쓰기`}
      animationType={Platform.OS === 'web' ? 'none' : 'fade'}
      navigationBarTranslucent
      onRequestClose={() => {
        if (Platform.OS !== 'web') {
          requestNativeBack();
        }
      }}
      onShow={() => requestAnimationFrame(() => editorRef.current?.focus())}
      role="dialog"
      statusBarTranslucent
      transparent
      visible
    >
      <ToastProvider>
        <OverlayBackdrop
          accessible={false}
          onRequestClose={handleOverlayRequestClose}
          style={[
            styles.backdrop,
            presentation === 'fullscreen' ? styles.fullscreenBackdrop : null,
            Platform.OS === 'web' && presentation === 'modal' ? styles.webModalBackdrop : null,
            safeAreaStyle,
            Platform.OS === 'web' && presentation === 'fullscreen' && fullscreenViewport
              ? [
                  styles.webFullscreenBackdrop,
                  {
                    height: fullscreenViewport.height,
                    top: fullscreenViewport.offsetTop,
                  },
                ]
              : null,
            { backgroundColor: theme.overlayScrim },
          ]}
          testID="reply-composer-backdrop"
        >
          <PostComposerController
            beforeEditor={
              quoteMode ? undefined : (
                <View
                  style={[styles.parent, presentation === 'modal' ? styles.modalParent : null]}
                  testID="reply-parent"
                >
                  <View style={styles.parentAvatarColumn}>
                    <Avatar
                      imageUri={parent.profile.avatar?.url}
                      label={parent.profile.displayName || parent.profile.handle}
                      size={40}
                    />
                    <PostThreadConnector
                      style={[
                        styles.parentConnector,
                        presentation === 'modal' ? styles.modalParentConnector : null,
                        presentation === 'fullscreen' ? styles.fullscreenParentConnector : null,
                      ]}
                      testID="reply-parent-thread-connector"
                    />
                  </View>
                  <View style={styles.parentContent}>
                    <View style={styles.parentIdentity}>
                      <ProfileNameBlock profile={parent.profile} />
                      <Text style={[styles.timestamp, { color: theme.foregroundSecondary }]}>
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
              )
            }
            replyContext={
              quoteMode ? undefined : (
                <Text style={[styles.replyContext, { color: theme.textSecondary }]}>
                  {parent.profile.relativeHandle}님에게 답글
                </Text>
              )
            }
            contextGuard={contextGuard}
            editorRef={editorRef}
            focusOnMount
            onRequestClose={() => requestClose()}
            initialBodyText={initialBodyText}
            initialContentWarning={quoteMode ? undefined : parent.content?.contentWarning}
            presentation={presentation === 'fullscreen' ? 'mobile' : 'overlay'}
            onPostCreated={handlePostCreated}
            onPostRequestAccepted={handlePostRequestAccepted}
            onPostRequestUncertainChange={(uncertain, retry) =>
              setUncertainRequest(uncertain ? { retry } : null)
            }
            onSubmittingChange={setSubmitting}
            profile={profile.composer}
            registerNativeBackHandler={registerNativeBackHandler}
            renderSurface={({ form, mediaEditorOpen }) => (
              <Pressable
                accessible={false}
                accessibilityViewIsModal
                onAccessibilityEscape={requestNativeBack}
                onPress={(event) => event.stopPropagation()}
                ref={dialogRef}
                style={[
                  styles.dialog,
                  elevation.overlay,
                  presentation === 'fullscreen' ? styles.fullscreen : styles.modal,
                  Platform.OS === 'web' && presentation === 'modal' ? styles.webModal : null,
                  mediaEditorOpen && Platform.OS === 'web' && presentation === 'modal'
                    ? styles.webMediaEditorDialog
                    : null,
                  {
                    backgroundColor: theme.backgroundElevated,
                    borderColor: theme.borderDefault,
                  },
                ]}
                testID={`${quoteMode ? 'quote' : 'reply'}-composer-dialog-surface`}
              >
                <View style={styles.contentFrame}>
                  <View
                    accessibilityElementsHidden={closeConfirmationOpen}
                    aria-hidden={closeConfirmationOpen || undefined}
                    importantForAccessibility={
                      closeConfirmationOpen ? 'no-hide-descendants' : 'auto'
                    }
                    style={[styles.main, closeConfirmationOpen ? styles.mainBlocked : null]}
                  >
                    {presentation === 'modal' ? (
                      <View style={[styles.header, { borderColor: theme.borderDefault }]}>
                        <Text
                          accessibilityRole="header"
                          style={[styles.title, { color: theme.foregroundPrimary }]}
                        >
                          글쓰기
                        </Text>
                        <IconButton
                          accessibilityLabel="닫기"
                          disabled={submitting}
                          hitSlop={4}
                          onPress={() => requestClose()}
                          style={[
                            styles.closeButton,
                            {
                              height: closeControlSize,
                              transform: [{ translateY: -closeControlSize / 2 }],
                              width: closeControlSize,
                            },
                          ]}
                          targetSize={closeControlSize}
                          visualSize={closeControlSize}
                          visualStyle={styles.close}
                        >
                          <XIcon color={theme.foregroundPrimary} size={20} strokeWidth={2} />
                        </IconButton>
                      </View>
                    ) : null}
                    <KeyboardAvoidingView
                      behavior={Platform.OS === 'ios' ? 'height' : undefined}
                      keyboardVerticalOffset={insets.top}
                      style={styles.composerFrame}
                    >
                      {form}
                    </KeyboardAvoidingView>
                  </View>
                  {closeConfirmation}
                </View>
              </Pressable>
            )}
            {...(quoteMode
              ? { repostSourceId: parent.id }
              : { replyParentId: parent.id, replyParentVisibility: parent.visibility })}
          >
            {quoteMode ? (
              <PostSourcePreview interactive={false} source={parent} style={styles.quoteSource} />
            ) : null}
          </PostComposerController>
        </OverlayBackdrop>
      </ToastProvider>
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
  webModalBackdrop: { justifyContent: 'flex-start' },
  fullscreenBackdrop: { padding: 0 },
  webFullscreenBackdrop: { left: 0, position: 'fixed' as never, right: 0 },
  dialog: {
    borderWidth: 1,
    maxHeight: '85dvh' as never,
    overflow: 'hidden',
  },
  modal: {
    borderRadius: radii.lg,
    maxHeight: 'min(720px, 85dvh)' as never,
    width: 600,
  },
  webModal: {
    marginTop: spacing.xxl,
    maxHeight: 'calc(100dvh - 96px)' as never,
    overflow: 'clip' as never,
  },
  webMediaEditorDialog: {
    height: 678,
    maxWidth: 'min(920px, calc(100vw - 48px))' as never,
    width: '100%',
  },
  fullscreen: {
    borderRadius: 0,
    borderWidth: 0,
    height: '100%',
    maxHeight: '100%',
    width: '100%',
  },
  contentFrame: { flex: 1, minHeight: 0, width: '100%' },
  main: { flex: 1, minHeight: 0, width: '100%' },
  mainBlocked: { pointerEvents: 'none' },
  composerFrame: { flex: 1, minHeight: 0 },
  header: {
    alignItems: 'center',
    borderBottomWidth: 1,
    flexDirection: 'row',
    justifyContent: 'center',
    minHeight: 56,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    position: 'relative',
    width: '100%',
  },
  title: { fontFamily: fontFamilies.ui, fontWeight: '800', ...typography.lg },
  closeButton: { position: 'absolute', right: spacing.lg, top: '50%' },
  close: { alignItems: 'center', borderRadius: radii.full, justifyContent: 'center' },
  parent: {
    alignItems: 'stretch',
    flexDirection: 'row',
    gap: spacing.md,
    paddingBottom: spacing.lg,
  },
  modalParent: { zIndex: 1 },
  parentAvatarColumn: { position: 'relative', width: 40 },
  parentConnector: {
    bottom: -spacing.md,
    left: '50%',
    top: 40 + spacing.xs,
    transform: [{ translateX: -1 }],
  },
  modalParentConnector: { bottom: -(spacing.md + spacing.xxl - spacing.xs) },
  fullscreenParentConnector: { bottom: -spacing.lg },
  parentContent: { flex: 1, gap: spacing.md, minWidth: 0 },
  parentIdentity: { flex: 1, minWidth: 0 },
  timestamp: { fontFamily: fontFamilies.ui, marginTop: spacing.xs, ...typography.xsm },
  quoteSource: { marginBottom: spacing.sm },
  replyContext: { fontFamily: fontFamilies.ui, ...typography.sm },
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
  confirmTitle: { fontFamily: fontFamilies.ui, fontWeight: '800', ...typography.lg },
  confirmDescription: { fontFamily: fontFamilies.ui, ...typography.sm },
  confirmActions: { ...layoutRecipes.dialogActions },
});
