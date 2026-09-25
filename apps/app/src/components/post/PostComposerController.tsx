import { normalizePostContentPlainText } from '@kosmo/core/post-content';
import { postBodyMaxLength } from '@kosmo/core/validation/post-policy';
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Platform, StyleSheet, View } from 'react-native';
import { graphql, useFragment, useMutation, useRelayEnvironment } from 'react-relay';
import { ConnectionHandler, ROOT_ID } from 'relay-runtime';
import { trackAnalytics } from '@/analytics/client';
import { ProfileNameBlock } from '@/components/profile/ProfileNameBlock';
import { Avatar } from '@/components/ui/Avatar';
import { Form } from '@/components/ui/Form';
import { useToast } from '@/components/ui/ToastProvider';
import { useRelayEnvironmentGeneration } from '@/relay/RelayEnvironmentBoundary';
import { spacing } from '@/theme/tokens';
import { ComposerMediaEditor } from './ComposerMediaEditor';
import { MobileFullscreenComposerShellCandidate, PostComposer } from './PostComposer';
import {
  emptyPostComposerMediaValue,
  PostComposerMediaControls,
} from './PostComposerMediaControls';
import { PostComposerProfileSwitcher } from './PostComposerProfileSwitcher';
import {
  createPostComposerContextKey,
  createPostComposerMutationInput,
  defaultPostComposerQuotePolicy,
  resolvePostComposerVisibility,
} from './postComposerState';
import type { ReactNode, RefObject } from 'react';
import type { TextInput } from 'react-native';
import type { PostComposer_profile$key } from './__generated__/PostComposer_profile.graphql';
import type { PostComposerCreatePostMutation } from './__generated__/PostComposerCreatePostMutation.graphql';
import type { PostComposerMode, PostComposerVisibility } from './PostComposer';
import type { PostComposerMediaValue } from './PostComposerMediaControls';
import type { PostComposerProfileRef } from './PostComposerProfileSwitcher';
import type { PostComposerQuotePolicy } from './postComposerState';

type Visibility = PostComposerVisibility;
export type PostComposerCreatedPost = Readonly<{ id: string }>;

const submitFailureMessage = '게시글을 작성하지 못했습니다. 잠시 후 다시 시도해 주세요.';

const PostComposerFragment = graphql`
  fragment PostComposer_profile on Profile {
    id
    private {
      defaultPostVisibility
    }
    displayName
    handle
    avatar {
      id
      url
    }
    ...ProfileNameBlock_profile
  }
`;

const CreatePostMutation = graphql`
  mutation PostComposerCreatePostMutation(
    $input: CreatePostInput!
    $connections: [ID!]!
    $prependToHome: Boolean!
  ) {
    createPost(input: $input) {
      post @prependNode(connections: $connections, edgeTypeName: "PostConnectionEdge") {
        id
        ...PostListItem_post @include(if: $prependToHome) @alias(as: "postListItem")
      }
    }
  }
`;

type PostComposerBaseProps = {
  beforeEditor?: ReactNode;
  children?: ReactNode;
  contextGuard?: RefObject<number>;
  editorRef?: RefObject<TextInput | null>;
  expandControlRef?: RefObject<View | null>;
  focusOnMount?: boolean;
  initialContentWarning?: string | null;
  onPostCreated?: (post: PostComposerCreatedPost) => void;
  onSubmittingChange?: (submitting: boolean) => void;
  profile: PostComposer_profile$key;
  profiles?: readonly PostComposerProfileRef[];
  registerNativeBackHandler?: (handler: (() => void) | null) => void;
};

type PostComposerPresentationProps =
  | {
      onExpand?: never;
      onRequestClose?: () => void;
      presentation?: undefined;
    }
  | {
      onExpand: () => void;
      onRequestClose: () => void;
      presentation: 'rail';
    }
  | {
      onExpand?: never;
      onRequestClose: () => void;
      presentation: 'mobile' | 'overlay';
    };

type PostComposerRelationshipProps =
  | { replyParentId: string; repostSourceId?: never }
  | { replyParentId?: never; repostSourceId: string }
  | { replyParentId?: never; repostSourceId?: never };

export type PostComposerControllerProps = PostComposerBaseProps &
  PostComposerPresentationProps &
  PostComposerRelationshipProps;

export function PostComposerController({
  profile: profileKey,
  profiles = [],
  replyParentId,
  repostSourceId,
  ...props
}: PostComposerControllerProps) {
  const environment = useRelayEnvironment();
  const environmentGenerationRef = useRelayEnvironmentGeneration();
  const environmentRef = useRef(environment);
  const contextGenerationRef = useRef(0);
  if (!environmentGenerationRef && environmentRef.current !== environment) {
    environmentRef.current = environment;
    contextGenerationRef.current += 1;
  }

  const profile = useFragment(PostComposerFragment, profileKey);
  const contextKey = createPostComposerContextKey(profile.id, replyParentId, repostSourceId);
  const contextKeyRef = useRef(contextKey);
  if (contextKeyRef.current !== contextKey) {
    contextKeyRef.current = contextKey;
    contextGenerationRef.current += 1;
  }
  const relationshipProps: PostComposerRelationshipProps = replyParentId
    ? { replyParentId }
    : repostSourceId
      ? { repostSourceId }
      : {};

  return (
    <PostComposerContents
      {...props}
      {...relationshipProps}
      contextGenerationRef={contextGenerationRef}
      environmentGenerationRef={environmentGenerationRef}
      key={`${contextGenerationRef.current}:${environmentGenerationRef?.current ?? 0}`}
      globalProfileId={profile.id}
      profileKey={profileKey}
      profiles={profiles}
    />
  );
}

type PostComposerContentsProps = Omit<PostComposerBaseProps, 'profile'> &
  PostComposerRelationshipProps & {
    contextGenerationRef: RefObject<number>;
    environmentGenerationRef: RefObject<number> | null;
    onExpand?: () => void;
    onRequestClose?: () => void;
    presentation?: 'mobile' | 'overlay' | 'rail';
    globalProfileId: string;
    profileKey: PostComposer_profile$key;
    profiles: readonly PostComposerProfileRef[];
  };

function PostComposerContents({
  beforeEditor,
  children,
  contextGuard,
  contextGenerationRef,
  editorRef,
  expandControlRef,
  environmentGenerationRef,
  focusOnMount = false,
  initialContentWarning,
  onPostCreated,
  onRequestClose,
  onSubmittingChange,
  onExpand,
  presentation,
  globalProfileId,
  profileKey,
  profiles,
  registerNativeBackHandler,
  replyParentId,
  repostSourceId,
}: PostComposerContentsProps) {
  const [selectedProfileKey, setSelectedProfileKey] = useState<PostComposerProfileRef | null>(null);
  const profile = useFragment(PostComposerFragment, selectedProfileKey ?? profileKey);
  const onSelectProfile = useCallback((_id: string, profileRef: PostComposerProfileRef) => {
    setSelectedProfileKey(profileRef);
  }, []);
  const resolvedPresentation = presentation ?? 'overlay';
  const internalEditorRef = useRef<TextInput>(null);
  const editor = editorRef ?? internalEditorRef;
  const [body, setBody] = useState('');
  const [contentWarning, setContentWarning] = useState(() =>
    normalizePostContentPlainText(initialContentWarning ?? ''),
  );
  const [contentWarningExpanded, setContentWarningExpanded] = useState(
    () => initialContentWarning !== null && initialContentWarning !== undefined,
  );
  const defaultVisibility = resolvePostComposerVisibility(profile.private?.defaultPostVisibility);
  const [visibility, setVisibility] = useState<Visibility>(() => defaultVisibility);
  const [quotePolicy, setQuotePolicy] = useState<PostComposerQuotePolicy>(
    defaultPostComposerQuotePolicy,
  );
  const defaultVisibilityRef = useRef(defaultVisibility);
  const visibilityProfileIdRef = useRef(profile.id);
  const [media, setMedia] = useState<PostComposerMediaValue>(emptyPostComposerMediaValue);
  const [mediaEditor, setMediaEditor] = useState<{
    key: string;
    tool: 'alt' | 'sensitive';
  } | null>(null);
  const profilePickerDismissRef = useRef<(() => void) | null>(null);
  const [profilePickerOpen, setProfilePickerOpen] = useState(false);
  const onProfilePickerDismissChange = useCallback((dismiss: (() => void) | null) => {
    profilePickerDismissRef.current = dismiss;
    setProfilePickerOpen(dismiss !== null);
  }, []);
  const [mediaGeneration, setMediaGeneration] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [commit] = useMutation<PostComposerCreatePostMutation>(CreatePostMutation);
  const { showToast } = useToast();
  const replyMode = Boolean(replyParentId);
  const quoteMode = Boolean(repostSourceId);
  const mountedRef = useRef(true);
  const bodyText = normalizePostContentPlainText(body);
  const contentWarningText = normalizePostContentPlainText(contentWarning);
  const hasDraftContent =
    bodyText.length > 0 ||
    contentWarningText.length > 0 ||
    media.items.length > 0 ||
    media.hasPendingMedia;
  const hasUnsavedDraft =
    hasDraftContent ||
    visibility !== defaultVisibility ||
    quotePolicy !== defaultPostComposerQuotePolicy;
  const remaining = postBodyMaxLength - bodyText.length - contentWarningText.length;
  const disabled =
    submitting ||
    (bodyText.length === 0 && media.items.length === 0) ||
    media.hasPendingMedia ||
    remaining < 0;

  useEffect(() => {
    if (visibilityProfileIdRef.current !== profile.id) {
      visibilityProfileIdRef.current = profile.id;
      defaultVisibilityRef.current = defaultVisibility;
      return;
    }
    if (hasDraftContent) {
      return;
    }
    const previousDefault = defaultVisibilityRef.current;
    defaultVisibilityRef.current = defaultVisibility;
    setVisibility((current) => (current === previousDefault ? defaultVisibility : current));
  }, [defaultVisibility, hasDraftContent, profile.id]);

  useEffect(() => {
    if (
      Platform.OS !== 'web' ||
      presentation === undefined ||
      !hasUnsavedDraft ||
      typeof window === 'undefined'
    ) {
      return;
    }

    const preventDraftLoss = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = true;
    };
    window.addEventListener('beforeunload', preventDraftLoss);
    return () => window.removeEventListener('beforeunload', preventDraftLoss);
  }, [hasUnsavedDraft, presentation]);

  const closeMediaEditor = useCallback(() => {
    setMediaEditor(null);
    requestAnimationFrame(() => editor.current?.focus());
  }, [editor]);

  useLayoutEffect(() => {
    registerNativeBackHandler?.(
      mediaEditor
        ? closeMediaEditor
        : profilePickerOpen
          ? () => profilePickerDismissRef.current?.()
          : null,
    );
    return () => {
      registerNativeBackHandler?.(null);
    };
  }, [closeMediaEditor, mediaEditor, profilePickerOpen, registerNativeBackHandler]);

  const submit = () => {
    if (disabled) {
      return;
    }
    setSubmitting(true);
    const submissionGeneration = contextGenerationRef.current;
    const submissionEnvironmentGeneration = environmentGenerationRef?.current;
    const submissionGuardGeneration = contextGuard?.current;
    const submittedCallback = onPostCreated;
    const submissionReplyMode = replyMode;
    commit({
      variables: {
        prependToHome: profile.id === globalProfileId,
        connections:
          profile.id === globalProfileId
            ? [ConnectionHandler.getConnectionID(ROOT_ID, 'PostList_homeTimeline')]
            : [],
        input: {
          ...createPostComposerMutationInput(
            bodyText,
            visibility,
            replyParentId,
            contentWarningText,
            repostSourceId,
            quotePolicy,
          ),
          media: media.items,
          ...(profile.id !== globalProfileId ? { actorProfileId: profile.id } : {}),
          sensitiveMedia: media.sensitiveMedia,
        },
      },
      onCompleted: (response) => {
        if (
          !mountedRef.current ||
          contextGenerationRef.current !== submissionGeneration ||
          environmentGenerationRef?.current !== submissionEnvironmentGeneration ||
          contextGuard?.current !== submissionGuardGeneration
        ) {
          return;
        }
        setSubmitting(false);
        const createdPost = response.createPost?.post;
        if (!createdPost) {
          showToast(submitFailureMessage, { tone: 'danger' });
          return;
        }

        trackAnalytics('post_created', {
          selected_profile_id: profile.id,
          visibility,
        });
        setBody('');
        if (!submissionReplyMode) {
          setContentWarning('');
          setContentWarningExpanded(false);
        }
        setMedia(emptyPostComposerMediaValue);
        setMediaGeneration((generation) => generation + 1);
        setVisibility(resolvePostComposerVisibility(profile.private?.defaultPostVisibility));
        setQuotePolicy(defaultPostComposerQuotePolicy);
        editor.current?.focus();
        submittedCallback?.(createdPost);
      },
      onError: () => {
        if (
          !mountedRef.current ||
          contextGenerationRef.current !== submissionGeneration ||
          environmentGenerationRef?.current !== submissionEnvironmentGeneration ||
          contextGuard?.current !== submissionGuardGeneration
        ) {
          return;
        }
        setSubmitting(false);
        showToast(submitFailureMessage, { tone: 'danger' });
      },
    });
  };

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    onSubmittingChange?.(submitting);
  }, [onSubmittingChange, submitting]);

  useEffect(() => {
    if (!focusOnMount) {
      return;
    }
    const frame = requestAnimationFrame(() => editor.current?.focus());
    return () => cancelAnimationFrame(frame);
  }, [focusOnMount, presentation]);

  const productionSurface: PostComposerVisibility = visibility;
  const composerMode: PostComposerMode = quoteMode ? 'quote' : replyMode ? 'reply' : 'post';
  const pickerProfiles =
    selectedProfileKey && !profiles.includes(selectedProfileKey)
      ? [...profiles, selectedProfileKey]
      : profiles;

  return (
    <Form
      accessibilityLabel={
        composerMode === 'reply'
          ? '답글 작성'
          : composerMode === 'quote'
            ? '인용 게시글 작성'
            : '게시글 작성'
      }
      onSubmit={submit}
      style={[
        presentation !== undefined ? styles.productionForm : styles.standaloneForm,
        (resolvedPresentation === 'mobile' || mediaEditor !== null) && styles.surfaceRoot,
      ]}
      submitOnModEnter
    >
      <PostComposerMediaControls
        actions={null}
        disabled={submitting}
        editorRef={editor}
        key={mediaGeneration}
        profileId={profile.id}
        onValueChange={setMedia}
        render={({
          items,
          onAltTextChange,
          onMediaAction,
          onMediaRemove,
          onMediaRetry,
          onSensitiveMediaChange,
          sensitiveMedia,
        }) => {
          const productionAuthor = (
            <View style={styles.productionAuthor}>
              {pickerProfiles.length > 1 ? (
                <PostComposerProfileSwitcher
                  disabled={submitting || items.some((item) => item.state === 'uploading')}
                  onDismissChange={onProfilePickerDismissChange}
                  onSelectionSuccess={() => editor.current?.focus()}
                  onSelectProfile={onSelectProfile}
                  profiles={pickerProfiles}
                  selectedProfileId={profile.id}
                  surface={presentation === 'rail' ? 'rail' : 'overlay'}
                />
              ) : (
                <>
                  <Avatar imageUri={profile.avatar?.url} label={profile.displayName} size={40} />
                  <ProfileNameBlock profile={profile} />
                </>
              )}
            </View>
          );
          const mediaEditorContent = mediaEditor ? (
            <ComposerMediaEditor
              fillContainer
              media={items}
              mobileState={mediaEditor.tool === 'alt' ? 'alt' : 'sensitive'}
              onAltTextChange={onAltTextChange}
              onBack={closeMediaEditor}
              onClose={() => {
                setMediaEditor(null);
                onRequestClose?.();
              }}
              onDone={closeMediaEditor}
              onSelectMedia={(key) => setMediaEditor({ key, tool: mediaEditor.tool })}
              onSensitiveMediaChange={onSensitiveMediaChange}
              onToolChange={(tool) => setMediaEditor({ key: mediaEditor.key, tool })}
              presentation={resolvedPresentation === 'mobile' ? 'mobile' : 'web'}
              selectedKey={mediaEditor.key}
              sensitiveMedia={sensitiveMedia}
              tool={mediaEditor.tool}
            />
          ) : null;

          const openMediaEditor = (key: string, tool: 'alt' | 'sensitive') => {
            editor.current?.blur();
            setMediaEditor({ key, tool });
            if (resolvedPresentation === 'rail') {
              onExpand?.();
            }
          };
          const sharedProductionProps = {
            author: productionAuthor,
            body,
            bodyRef: editor,
            children,
            contentWarning,
            contentWarningExpanded,
            expandControlRef,
            items,
            onBodyChange: setBody,
            onContentWarningChange: setContentWarning,
            onContentWarningToggle: () => setContentWarningExpanded((expanded) => !expanded),
            onEmojiAction: () => undefined,
            beforeEditor,
            mode: composerMode,
            onMediaAction,
            onMediaEdit: openMediaEditor,
            onMediaRemove,
            onMediaRetry: (key: string) => {
              const item = items.find((candidate) => candidate.key === key);
              if (item) {
                onMediaRetry(item);
              }
            },
            onPollAction: () => undefined,
            onQuotePolicyChange: setQuotePolicy,
            onSubmit: submit,
            onVisibilityChange: setVisibility,
            remaining,
            quotePolicy,
            sensitiveMedia,
            showEmojiAction: false,
            showMediaAction: items.length < 4,
            showPollAction: false,
            submitting,
            visibility: productionSurface,
          };

          const composerContent =
            resolvedPresentation === 'mobile' ? (
              <MobileFullscreenComposerShellCandidate
                {...sharedProductionProps}
                fillContainer
                onOverlayClose={onRequestClose!}
              />
            ) : (
              <PostComposer
                {...sharedProductionProps}
                onExpand={resolvedPresentation === 'rail' ? onExpand! : () => undefined}
                surface={resolvedPresentation === 'rail' ? 'rail' : 'overlay'}
              />
            );

          return (
            <>
              <View
                accessibilityElementsHidden={mediaEditor !== null}
                aria-hidden={mediaEditor !== null || undefined}
                style={[
                  presentation !== undefined ? styles.editorScroll : null,
                  resolvedPresentation === 'mobile' && styles.surfaceRoot,
                  mediaEditor !== null && styles.hiddenPresentation,
                ]}
              >
                {composerContent}
              </View>
              {mediaEditorContent}
            </>
          );
        }}
      />
    </Form>
  );
}

const styles = StyleSheet.create({
  productionForm: { flexShrink: 1, minHeight: 0, width: '100%' },
  standaloneForm: { width: '100%' },
  hiddenPresentation: { display: 'none' },
  productionAuthor: { alignItems: 'center', flexDirection: 'row', gap: spacing.md },
  surfaceRoot: { flex: 1, minHeight: 0 },
  editorScroll: { flexShrink: 1, minHeight: 0 },
});
