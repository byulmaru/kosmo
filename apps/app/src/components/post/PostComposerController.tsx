import { normalizePostContentPlainText } from '@kosmo/core/post-content';
import { postBodyMaxLength } from '@kosmo/core/validation/post-policy';
import { randomUUID } from 'expo-crypto';
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { AppState, Keyboard, Platform, StyleSheet, Text, View } from 'react-native';
import { graphql, useFragment, useMutation, useRelayEnvironment } from 'react-relay';
import { QueryRenderer } from 'react-relay/legacy';
import { commitLocalUpdate } from 'relay-runtime';
import { useFeatureFlag } from '@/components/FeatureFlagsContext';
import { ProfileNameBlock } from '@/components/profile/ProfileNameBlock';
import { Avatar } from '@/components/ui/Avatar';
import { Button } from '@/components/ui/Button';
import { Form } from '@/components/ui/Form';
import { useToast } from '@/components/ui/ToastProvider';
import { useRelayEnvironmentGeneration } from '@/relay/RelayEnvironmentBoundary';
import { useSession } from '@/session/SessionProvider';
import { fontFamilies, spacing, textStyles } from '@/theme/tokens';
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
  findPostComposerMentionQuery,
  normalizePostComposerMentionDraft,
  replacePostComposerMentionQuery,
  resolvePostComposerVisibility,
  updatePostComposerDraftBody,
  updatePostComposerDraftSelection,
  updatePostComposerMentionRanges,
} from './postComposerState';
import { prependPostRequestToLoadedPages, reconcilePublishedPostInHome } from './postRequestCache';
import type { PostVisibility } from '@kosmo/core/enums';
import type { ReactNode, RefObject } from 'react';
import type { TextInput } from 'react-native';
import type { PostComposer_profile$key } from './__generated__/PostComposer_profile.graphql';
import type { PostComposerCreatePostMutation } from './__generated__/PostComposerCreatePostMutation.graphql';
import type { PostComposerMentionSuggestionsQuery } from './__generated__/PostComposerMentionSuggestionsQuery.graphql';
import type { ComposerMediaEditorTool } from './ComposerMediaEditor';
import type { PostComposerMode, PostComposerVisibility } from './PostComposer';
import type { PostComposerMediaValue } from './PostComposerMediaControls';
import type { PostComposerProfileRef } from './PostComposerProfileSwitcher';
import type {
  PostComposerDraft,
  PostComposerMentionCandidate,
  PostComposerMentionCandidateResults,
  PostComposerMentionQuery,
  PostComposerMentionSearchState,
  PostComposerTextSelection,
} from './postComposerState';

type Visibility = PostComposerVisibility;
export type PostComposerCreatedPost = Readonly<{ id: string }>;

const submitFailureMessage = '게시 요청을 접수하지 못했어요. 내용을 확인하고 다시 시도해 주세요.';
const postRequestUncertainMessage = '접수 결과를 확인하지 못했어요.';

function postRequestSubmissionError(error: unknown): { code: string; field?: string } | null {
  if (typeof error !== 'object' || error === null || !('extensions' in error)) {
    return null;
  }
  const extensions = error.extensions;
  if (typeof extensions !== 'object' || extensions === null || !('code' in extensions)) {
    return null;
  }
  return {
    code: String(extensions.code),
    ...('field' in extensions && typeof extensions.field === 'string'
      ? { field: extensions.field }
      : {}),
  };
}

type PostRequestSubmission = Readonly<{
  contextGeneration: number;
  environmentGeneration: number | null;
  input: PostComposerCreatePostMutation['variables']['input'];
  ownerAccountId: string | null;
  requestId: string;
  uncertain: boolean;
}>;

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
  mutation PostComposerCreatePostMutation($input: CreatePostInput!) {
    createPost(input: $input) {
      request {
        id
        post {
          id
        }
        requestId
        status
        ...PostRequestCard_request
      }
    }
  }
`;

const PostComposerMentionSuggestionsQuery = graphql`
  query PostComposerMentionSuggestionsQuery($actorProfileId: ID!, $query: String!) {
    searchProfiles(
      actorProfileId: $actorProfileId
      first: 10
      query: $query
      resolveRemote: false
    ) {
      edges {
        node {
          id
          relativeHandle
          displayName
          avatar {
            id
            url
          }
        }
      }
    }
  }
`;

type PostComposerBaseProps = {
  beforeEditor?: ReactNode;
  children?: ReactNode;
  contextGuard?: RefObject<number>;
  editorRef?: RefObject<TextInput | null>;
  expanded?: boolean;
  expandControlRef?: RefObject<View | null>;
  focusOnMount?: boolean;
  initialBodyText?: string;
  initialContentWarning?: string | null;
  mentionCandidates?: PostComposerMentionCandidateResults;
  onPostCreated?: (post: PostComposerCreatedPost) => void;
  onPostRequestAccepted?: () => void;
  onPostRequestUncertainChange?: (uncertain: boolean, retry?: () => void) => void;
  onSubmittingChange?: (submitting: boolean) => void;
  profile: PostComposer_profile$key;
  profiles?: readonly PostComposerProfileRef[];
  renderSurface?: (props: { form: ReactNode; mediaEditorOpen: boolean }) => ReactNode;
  registerNativeBackHandler?: (handler: (() => void) | null) => void;
};

type PostComposerPresentationProps =
  | {
      onExpand?: never;
      onRequestClose?: () => void;
      presentation?: undefined;
      replyContext?: never;
    }
  | {
      onExpand: () => void;
      onRequestClose: () => void;
      presentation: 'rail';
      replyContext?: never;
    }
  | {
      onExpand?: never;
      onRequestClose: () => void;
      presentation: 'mobile' | 'overlay';
      replyContext?: ReactNode;
    };

type PostComposerRelationshipProps =
  | {
      replyParentId: string;
      replyParentVisibility: PostVisibility | '%future added value';
      repostSourceId?: never;
    }
  | { replyParentId?: never; replyParentVisibility?: never; repostSourceId: string }
  | { replyParentId?: never; replyParentVisibility?: never; repostSourceId?: never };

export type PostComposerControllerProps = PostComposerBaseProps &
  PostComposerPresentationProps &
  PostComposerRelationshipProps;

export function PostComposerController({
  profile: profileKey,
  profiles = [],
  replyParentId,
  replyParentVisibility,
  repostSourceId,
  ...props
}: PostComposerControllerProps) {
  const environment = useRelayEnvironment();
  const environmentGenerationRef = useRelayEnvironmentGeneration();
  const { accountId } = useSession();
  const currentAccountIdRef = useRef<string | null>(accountId);
  currentAccountIdRef.current = accountId;
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
  const [pendingSubmission, setPendingSubmission] = useState<PostRequestSubmission | null>(null);

  const contentsKey = [contextGenerationRef.current, environmentGenerationRef?.current ?? 0].join(
    ':',
  );
  const contentsCommonProps: PostComposerContentsCommonProps = {
    ...props,
    contextGenerationRef,
    currentAccountIdRef,
    environmentGenerationRef,
    mentionCandidates: props.mentionCandidates,
    pendingSubmission,
    profileKey,
    profiles,
    setPendingSubmission,
  };
  const contentsProps: PostComposerContentsInputProps = replyParentId
    ? { ...contentsCommonProps, replyParentId, replyParentVisibility }
    : repostSourceId
      ? { ...contentsCommonProps, repostSourceId }
      : contentsCommonProps;

  return <PostComposerContents key={contentsKey} {...contentsProps} accountId={accountId} />;
}

type CurrentAccountIdRef = { current: string | null };

type PostComposerContentsCommonProps = Omit<PostComposerBaseProps, 'profile' | 'profiles'> & {
  contextGenerationRef: RefObject<number>;
  currentAccountIdRef: CurrentAccountIdRef;
  environmentGenerationRef: RefObject<number> | null;
  onExpand?: () => void;
  onRequestClose?: () => void;
  presentation?: 'mobile' | 'overlay' | 'rail';
  profileKey: PostComposer_profile$key;
  profiles: readonly PostComposerProfileRef[];
  replyContext?: ReactNode;
  pendingSubmission: PostRequestSubmission | null;
  setPendingSubmission: (submission: PostRequestSubmission | null) => void;
};

type PostComposerContentsRelationshipProps =
  | Extract<PostComposerRelationshipProps, { replyParentId: string }>
  | Extract<PostComposerRelationshipProps, { repostSourceId: string }>
  | Extract<PostComposerRelationshipProps, { replyParentId?: never; repostSourceId?: never }>;
type PostComposerContentsInputProps = PostComposerContentsCommonProps &
  PostComposerContentsRelationshipProps;
type PostComposerContentsProps = PostComposerContentsInputProps & { accountId: string | null };

function PostComposerContents({
  beforeEditor,
  children,
  contextGuard,
  contextGenerationRef,
  currentAccountIdRef,
  editorRef,
  expanded = true,
  expandControlRef,
  environmentGenerationRef,
  focusOnMount = false,
  initialBodyText,
  initialContentWarning,
  onPostCreated,
  onPostRequestAccepted,
  onPostRequestUncertainChange,
  pendingSubmission,
  accountId,
  onRequestClose,
  onSubmittingChange,
  onExpand,
  presentation,
  mentionCandidates,
  profileKey,
  profiles,
  replyContext,
  registerNativeBackHandler,
  replyParentId,
  replyParentVisibility,
  repostSourceId,
  renderSurface,
  setPendingSubmission,
}: PostComposerContentsProps) {
  const mentionSearchEnabled = useFeatureFlag('post-composer-mention-search');
  const environment = useRelayEnvironment();
  const { selectedProfileId } = useSession();
  const [selectedProfileKey, setSelectedProfileKey] = useState<PostComposerProfileRef | null>(null);
  const globalProfile = useFragment(PostComposerFragment, profileKey);
  const profile = useFragment(PostComposerFragment, selectedProfileKey ?? profileKey);
  const onSelectProfile = useCallback((_id: string, profileRef: PostComposerProfileRef) => {
    setSelectedProfileKey(profileRef);
  }, []);
  const resolvedPresentation = presentation ?? 'overlay';
  const internalEditorRef = useRef<TextInput>(null);
  const editor = editorRef ?? internalEditorRef;
  const [draft, setDraft] = useState<PostComposerDraft>(() => {
    const initialBody = initialBodyText ?? '';
    const end = initialBody.length;
    return {
      body: initialBody,
      mentionRanges: [],
      previousSelection: { start: end, end },
      selection: { start: end, end },
      selectionToApply: { start: end, end },
    };
  });
  const { body, mentionRanges, selection } = draft;
  const activeMentionQuery = findPostComposerMentionQuery(body, selection.start, selection.end);
  const mentionQuery = activeMentionQuery?.query ?? '';
  const shouldSearchMentions =
    mentionSearchEnabled && mentionCandidates === undefined && mentionQuery.trim().length > 0;
  const onBodyChange = useCallback((nextBody: string) => {
    setDraft((previous) => updatePostComposerDraftBody(previous, nextBody));
  }, []);
  const onSelectionChange = useCallback((nextSelection: PostComposerTextSelection) => {
    setDraft((previous) => updatePostComposerDraftSelection(previous, nextSelection));
  }, []);
  const onBodyReset = useCallback(() => {
    setDraft({
      body: '',
      mentionRanges: [],
      previousSelection: { start: 0, end: 0 },
      selection: { start: 0, end: 0 },
    });
  }, []);
  const selectMention = useCallback(
    (
      candidate: PostComposerMentionCandidate,
      query: PostComposerMentionQuery,
      candidateResults: PostComposerMentionCandidateResults | undefined,
    ) => {
      if (
        candidateResults?.authorProfileId !== profile.id ||
        candidateResults.query !== query.query ||
        !candidateResults.profiles.some(
          (result) =>
            result.id === candidate.id && result.relativeHandle === candidate.relativeHandle,
        )
      ) {
        return;
      }

      setDraft((previous) => {
        const inserted = replacePostComposerMentionQuery(previous.body, query, candidate);
        if (!inserted) {
          return previous;
        }
        const selectionToApply = { start: inserted.range.end + 1, end: inserted.range.end + 1 };
        return {
          body: inserted.body,
          mentionRanges: [
            ...updatePostComposerMentionRanges(
              previous.body,
              inserted.body,
              previous.mentionRanges,
              [{ start: query.start, end: query.end }],
            ),
            inserted.range,
          ].sort((left, right) => left.start - right.start),
          previousSelection: { start: query.start, end: query.start },
          selection: selectionToApply,
          selectionToApply,
        };
      });
    },
    [profile.id],
  );
  const [contentWarning, setContentWarning] = useState(() =>
    normalizePostContentPlainText(initialContentWarning ?? ''),
  );
  const [contentWarningExpanded, setContentWarningExpanded] = useState(
    () => initialContentWarning !== null && initialContentWarning !== undefined,
  );
  const defaultVisibility = resolvePostComposerVisibility(
    profile.private?.defaultPostVisibility,
    replyParentVisibility,
  );
  const [visibility, setVisibility] = useState<Visibility>(() => defaultVisibility);
  const defaultVisibilityRef = useRef(defaultVisibility);
  const visibilityProfileIdRef = useRef(profile.id);
  const [media, setMedia] = useState<PostComposerMediaValue>(emptyPostComposerMediaValue);
  const [mediaEditor, setMediaEditor] = useState<{
    key: string;
    tool: ComposerMediaEditorTool;
  } | null>(null);
  if (!expanded && mediaEditor !== null) {
    setMediaEditor(null);
  }
  const profilePickerDismissRef = useRef<(() => void) | null>(null);
  const [profilePickerOpen, setProfilePickerOpen] = useState(false);
  const onProfilePickerDismissChange = useCallback((dismiss: (() => void) | null) => {
    profilePickerDismissRef.current = dismiss;
    setProfilePickerOpen(dismiss !== null);
  }, []);
  const [mediaGeneration, setMediaGeneration] = useState(0);
  const [commit, submitting] = useMutation<PostComposerCreatePostMutation>(CreatePostMutation);
  const { showToast } = useToast();
  const replyMode = Boolean(replyParentId);
  const quoteMode = Boolean(repostSourceId);
  const mountedRef = useRef(true);
  const { bodyText, mentions } = normalizePostComposerMentionDraft(body, mentionRanges);
  const contentWarningText = normalizePostContentPlainText(contentWarning);
  const hasDraftContent =
    bodyText.length > 0 ||
    contentWarningText.length > 0 ||
    media.items.length > 0 ||
    media.hasPendingMedia;
  const hasUnsavedDraft = hasDraftContent || visibility !== defaultVisibility;
  const remaining = postBodyMaxLength - [...bodyText].length - [...contentWarningText].length;
  const disabled =
    accountId === null ||
    submitting ||
    (bodyText.length === 0 && media.items.length === 0) ||
    media.hasPendingMedia ||
    remaining < 0;
  const canRecheckSubmission =
    pendingSubmission !== null &&
    accountId !== null &&
    accountId === pendingSubmission.ownerAccountId;
  const notifiedUncertainContextRef = useRef<{
    accountId: string | null;
    contextGeneration: number;
    environmentGeneration: number | null;
    requestId: string;
  } | null>(null);

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

  const submit = (retrySnapshot?: PostRequestSubmission) => {
    const retryCandidate = retrySnapshot ?? pendingSubmission;
    if (
      retryCandidate &&
      (currentAccountIdRef.current === null ||
        currentAccountIdRef.current !== retryCandidate.ownerAccountId)
    ) {
      return;
    }

    const wasUncertain = retryCandidate?.uncertain ?? false;
    if (!retryCandidate && disabled) {
      return;
    }
    const submissionOwnerAccountId = retryCandidate ? retryCandidate.ownerAccountId : accountId;
    const submissionGeneration = contextGenerationRef.current;
    const submissionEnvironmentGeneration = environmentGenerationRef?.current ?? null;
    const submissionGuardGeneration = contextGuard?.current;
    const submittedCreatedCallback = onPostCreated;
    const submittedCallback = onPostRequestAccepted;
    const isCurrentSubmission = () =>
      mountedRef.current &&
      contextGenerationRef.current === submissionGeneration &&
      (environmentGenerationRef?.current ?? null) === submissionEnvironmentGeneration &&
      contextGuard?.current === submissionGuardGeneration &&
      currentAccountIdRef.current === submissionOwnerAccountId;

    let submission = retryCandidate;
    if (!submission) {
      try {
        const requestId = randomUUID();
        const submittedMedia = media.getPostRequestMedia();
        const frozenMentions = Object.freeze(
          mentions.map((mention) => Object.freeze({ ...mention })),
        );
        submission = Object.freeze({
          contextGeneration: submissionGeneration,
          environmentGeneration: submissionEnvironmentGeneration,
          input: Object.freeze({
            requestId,
            ...createPostComposerMutationInput(
              bodyText,
              visibility,
              replyParentId,
              contentWarningText,
              repostSourceId,
              frozenMentions,
            ),
            actorProfileId: profile.id,
            media: submittedMedia,
            sensitiveMedia: media.sensitiveMedia,
          }),
          ownerAccountId: accountId,
          requestId,
          uncertain: false,
        });
      } catch {
        if (isCurrentSubmission()) {
          showToast(submitFailureMessage, { tone: 'danger' });
        }
        return;
      }
    }

    const finalSubmission = Object.freeze({
      ...submission,
      uncertain: wasUncertain || submission.uncertain,
    });
    setPendingSubmission(finalSubmission);

    commit({
      variables: { input: finalSubmission.input },
      onCompleted: (response, errors) => {
        if (!isCurrentSubmission()) {
          return;
        }
        const acceptedRequest = response?.createPost?.request;
        if (acceptedRequest?.id && acceptedRequest.requestId === finalSubmission.requestId) {
          const actorProfileId = finalSubmission.input.actorProfileId;
          if (typeof actorProfileId === 'string' && actorProfileId.length > 0) {
            commitLocalUpdate(environment, (store) => {
              prependPostRequestToLoadedPages(store, actorProfileId, acceptedRequest.id);

              const request = store.get(acceptedRequest.id);
              if (request?.getValue('status') !== 'PUBLISHED') {
                return;
              }

              const post = request.getLinkedRecord('post');
              const authorProfile = post?.getLinkedRecord('profile');
              reconcilePublishedPostInHome(store, {
                authorProfileId: authorProfile?.getDataID() ?? null,
                currentProfileId: selectedProfileId,
                postId: post?.getDataID() ?? null,
                profileId: actorProfileId,
                requestNodeId: acceptedRequest.id,
              });
            });
          }
          setPendingSubmission(null);
          onPostRequestUncertainChange?.(false);
          onBodyReset();
          setContentWarning('');
          setContentWarningExpanded(false);
          setMedia(emptyPostComposerMediaValue);
          setMediaGeneration((generation) => generation + 1);
          setSelectedProfileKey(null);
          setVisibility(
            resolvePostComposerVisibility(
              globalProfile.private?.defaultPostVisibility,
              replyParentVisibility,
            ),
          );
          if (
            acceptedRequest.status === 'PUBLISHED' &&
            acceptedRequest.post?.id &&
            submittedCreatedCallback
          ) {
            submittedCreatedCallback({ id: acceptedRequest.post.id });
          } else {
            showToast('게시 요청을 접수했어요', { tone: 'success' });
            submittedCallback?.();
          }
          return;
        }

        const submissionErrors =
          errors?.flatMap((error) => {
            const submissionError = postRequestSubmissionError(error);
            return submissionError ? [submissionError] : [];
          }) ?? [];
        const definiteDenial = submissionErrors.some(({ code }) =>
          [
            'CONFLICT',
            'NOT_FOUND',
            'PERMISSION_DENIED',
            'PROFILE_LIMIT_EXCEEDED',
            'VALIDATION',
          ].includes(code),
        );
        if (definiteDenial && !wasUncertain) {
          const unavailableMediaIndex = submissionErrors
            .filter(
              (error) =>
                (error.code === 'NOT_FOUND' || error.code === 'VALIDATION') &&
                /^media\.\d+$/.test(error.field ?? ''),
            )
            .map((error) => Number(error.field?.match(/^media\.(\d+)$/)?.[1]))
            .find((index) => Number.isInteger(index) && index >= 0);
          const unavailableMediaId =
            unavailableMediaIndex === undefined
              ? undefined
              : finalSubmission.input.media?.[unavailableMediaIndex]?.mediaId;
          if (unavailableMediaId) {
            media.requirePostRequestMediaReselection(unavailableMediaId);
          }
          setPendingSubmission(null);
          onPostRequestUncertainChange?.(false);
          showToast(submitFailureMessage, { tone: 'danger' });
          return;
        }

        const uncertainSubmission = Object.freeze({ ...finalSubmission, uncertain: true });
        setPendingSubmission(uncertainSubmission);
        notifyUncertainSubmission(uncertainSubmission);
      },
      onError: () => {
        if (!isCurrentSubmission()) {
          return;
        }
        const uncertainSubmission = Object.freeze({ ...finalSubmission, uncertain: true });
        setPendingSubmission(uncertainSubmission);
        notifyUncertainSubmission(uncertainSubmission);
      },
    });
  };

  const notifyUncertainSubmission = (submission: PostRequestSubmission) => {
    const currentContext = {
      accountId: currentAccountIdRef.current,
      contextGeneration: contextGenerationRef.current,
      environmentGeneration: environmentGenerationRef?.current ?? null,
      requestId: submission.requestId,
    };
    notifiedUncertainContextRef.current = currentContext;
    onPostRequestUncertainChange?.(
      true,
      currentContext.accountId !== null && currentContext.accountId === submission.ownerAccountId
        ? () => void submit(submission)
        : undefined,
    );
  };

  useEffect(() => {
    if (
      pendingSubmission === null ||
      pendingSubmission.uncertain ||
      (pendingSubmission.contextGeneration === contextGenerationRef.current &&
        pendingSubmission.environmentGeneration === (environmentGenerationRef?.current ?? null) &&
        currentAccountIdRef.current === pendingSubmission.ownerAccountId)
    ) {
      return;
    }

    const uncertainSubmission = Object.freeze({ ...pendingSubmission, uncertain: true });
    setPendingSubmission(uncertainSubmission);
    notifyUncertainSubmission(uncertainSubmission);
  }, [
    accountId,
    contextGenerationRef,
    environmentGenerationRef,
    notifyUncertainSubmission,
    onPostRequestUncertainChange,
    pendingSubmission,
    submit,
  ]);

  const contextGeneration = contextGenerationRef.current;
  const currentEnvironmentGeneration = environmentGenerationRef?.current ?? null;
  useLayoutEffect(() => {
    if (pendingSubmission === null || !pendingSubmission.uncertain) {
      notifiedUncertainContextRef.current = null;
      return;
    }

    const currentContext = {
      accountId: currentAccountIdRef.current,
      contextGeneration,
      environmentGeneration: currentEnvironmentGeneration,
      requestId: pendingSubmission.requestId,
    };
    const previousContext = notifiedUncertainContextRef.current;
    if (
      previousContext?.accountId === currentContext.accountId &&
      previousContext.contextGeneration === currentContext.contextGeneration &&
      previousContext.environmentGeneration === currentContext.environmentGeneration &&
      previousContext.requestId === currentContext.requestId
    ) {
      return;
    }

    notifyUncertainSubmission(pendingSubmission);
  }, [
    accountId,
    contextGeneration,
    currentEnvironmentGeneration,
    notifyUncertainSubmission,
    onPostRequestUncertainChange,
    pendingSubmission,
    submit,
  ]);

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

  useEffect(() => {
    if (!focusOnMount || Platform.OS === 'web') {
      return;
    }
    // Keep the native composer stable when an app switch leaves its keyboard open.
    const subscription = AppState.addEventListener('change', (nextState) => {
      if (nextState === 'background') {
        Keyboard.dismiss();
      }
    });
    return () => subscription.remove();
  }, [focusOnMount]);

  const productionSurface: PostComposerVisibility = visibility;
  const showRecovery =
    pendingSubmission !== null &&
    (pendingSubmission.uncertain ||
      pendingSubmission.contextGeneration !== contextGenerationRef.current ||
      pendingSubmission.environmentGeneration !== (environmentGenerationRef?.current ?? null) ||
      pendingSubmission.ownerAccountId !== accountId);
  const composerMode: PostComposerMode = quoteMode ? 'quote' : replyMode ? 'reply' : 'post';
  const pickerProfiles =
    selectedProfileKey && !profiles.includes(selectedProfileKey)
      ? [...profiles, selectedProfileKey]
      : profiles;

  const form = (
    <Form
      accessibilityLabel={
        composerMode === 'reply'
          ? '답글 작성'
          : composerMode === 'quote'
            ? '인용 게시글 작성'
            : '게시글 작성'
      }
      accessibilityElementsHidden={showRecovery ? true : undefined}
      aria-hidden={showRecovery ? true : undefined}
      onSubmit={() => submit()}
      pointerEvents={showRecovery ? 'none' : undefined}
      style={[
        presentation !== undefined ? styles.productionForm : styles.standaloneForm,
        (resolvedPresentation === 'mobile' || mediaEditor !== null) && styles.surfaceRoot,
        showRecovery && styles.hiddenPresentation,
      ]}
      submitOnModEnter
    >
      <QueryRenderer<PostComposerMentionSuggestionsQuery>
        environment={environment}
        query={shouldSearchMentions ? PostComposerMentionSuggestionsQuery : null}
        variables={{
          actorProfileId: profile.id,
          query: mentionQuery,
        }}
        render={({ error, props: searchData, retry }) => {
          const searchedProfiles = searchData?.searchProfiles?.edges.flatMap((edge) => {
            const candidate = edge?.node;
            return candidate
              ? [
                  {
                    avatar: candidate.avatar ? { url: candidate.avatar.url } : candidate.avatar,
                    displayName: candidate.displayName,
                    id: candidate.id,
                    relativeHandle: candidate.relativeHandle,
                  },
                ]
              : [];
          });
          const currentMentionCandidates =
            mentionCandidates ??
            (shouldSearchMentions && activeMentionQuery
              ? {
                  authorProfileId: profile.id,
                  profiles: searchedProfiles ?? [],
                  query: activeMentionQuery.query,
                }
              : undefined);
          const mentionSearchState: PostComposerMentionSearchState | undefined =
            shouldSearchMentions
              ? error
                ? 'error'
                : searchData === null
                  ? 'loading'
                  : 'ready'
              : undefined;

          return (
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
                onApplyAiProhibitFilterChange,
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
                        <Avatar
                          imageUri={profile.avatar?.url}
                          label={profile.displayName}
                          size={40}
                        />
                        <ProfileNameBlock profile={profile} />
                      </>
                    )}
                  </View>
                );
                const mediaEditorContent = mediaEditor ? (
                  <ComposerMediaEditor
                    media={items}
                    mobileState={mediaEditor.tool}
                    onAltTextChange={onAltTextChange}
                    onApplyAiProhibitFilterChange={onApplyAiProhibitFilterChange}
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

                const openMediaEditor = (key: string, tool: ComposerMediaEditorTool) => {
                  editor.current?.blur();
                  setMediaEditor({ key, tool });
                  if (resolvedPresentation === 'rail') {
                    onExpand?.();
                  }
                };
                const sharedProductionProps = {
                  author: productionAuthor,
                  authorProfileId: profile.id,
                  body,
                  bodyRef: editor,
                  children,
                  contentWarning,
                  contentWarningExpanded,
                  expandControlRef,
                  items,
                  mentionCandidates: currentMentionCandidates,
                  mentionSearchState,
                  selectionToApply: draft.selectionToApply,
                  onRetryMentionSearch:
                    mentionSearchState === 'error' && retry ? () => retry() : undefined,
                  onSelectMention: (
                    candidate: PostComposerMentionCandidate,
                    query: PostComposerMentionQuery,
                  ) => selectMention(candidate, query, currentMentionCandidates),
                  onBodyChange,
                  onSelectionChange,
                  selection,
                  onContentWarningChange: setContentWarning,
                  onContentWarningToggle: () => setContentWarningExpanded((expanded) => !expanded),
                  onEmojiAction: () => undefined,
                  beforeEditor,
                  mode: composerMode,
                  replyContext,
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
                  onSubmit: () => submit(),
                  onVisibilityChange: setVisibility,
                  remaining,
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
          );
        }}
      />
    </Form>
  );

  const requestRecoveryForm = showRecovery ? (
    <Form
      accessibilityLabel="게시 요청 확인"
      onSubmit={() => void submit(pendingSubmission)}
      style={[styles.productionForm, styles.requestRecoveryForm]}
    >
      <View style={styles.requestRecoveryContent}>
        <Text accessibilityLiveRegion="polite" style={styles.requestRecoveryText}>
          {submitting
            ? '게시 요청을 보내고 있어요.'
            : canRecheckSubmission
              ? postRequestUncertainMessage
              : '요청을 제출한 계정으로 전환해 주세요.'}
        </Text>
        <Button
          disabled={submitting || !canRecheckSubmission}
          loading={submitting}
          onPress={() => void submit(pendingSubmission)}
        >
          {submitting ? '확인 중' : '접수 다시 확인'}
        </Button>
      </View>
    </Form>
  ) : null;
  const visibleForm = (
    <>
      {form}
      {requestRecoveryForm}
    </>
  );

  return renderSurface
    ? renderSurface({
        form: visibleForm,
        mediaEditorOpen: mediaEditor !== null && !showRecovery,
      })
    : visibleForm;
}

const styles = StyleSheet.create({
  productionForm: { flexShrink: 1, minHeight: 0, width: '100%' },
  standaloneForm: { width: '100%' },
  hiddenPresentation: { display: 'none' },
  productionAuthor: { alignItems: 'center', flexDirection: 'row', gap: spacing.md },
  surfaceRoot: { flex: 1, minHeight: 0 },
  editorScroll: { flexShrink: 1, minHeight: 0 },
  requestRecoveryForm: { flex: 1, justifyContent: 'center' },
  requestRecoveryContent: { alignItems: 'center', gap: spacing.md, padding: spacing.lg },
  requestRecoveryText: { ...textStyles.uiCopyM, fontFamily: fontFamilies.ui, textAlign: 'center' },
});
