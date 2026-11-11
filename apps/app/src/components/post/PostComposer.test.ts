import assert from 'node:assert/strict';
import { afterEach, before, beforeEach, describe, it, mock } from 'node:test';
import { MediaUsePermission } from '@kosmo/core/media-metadata';
import { createElement, forwardRef, useEffect, useImperativeHandle, useState } from 'react';
import * as ReactRelay from 'react-relay';
import { act, create } from 'react-test-renderer';
import {
  commitLocalUpdate,
  ConnectionHandler,
  createOperationDescriptor,
  Environment,
  getRelayHandleKey,
  getRequest,
  Network,
  Observable,
  RecordSource,
  Store,
} from 'relay-runtime';
import CreatePostMutation from './__generated__/PostComposerCreatePostMutation.graphql';
import PostComposerMentionSuggestionsQueryNode from './__generated__/PostComposerMentionSuggestionsQuery.graphql';
import PostRequestListQueryNode from './__generated__/PostRequestListQuery.graphql';
import type { ReactNode } from 'react';
import type { ReactTestRenderer } from 'react-test-renderer';
import type { GraphQLResponse } from 'relay-runtime';
import type { PostComposerCreatePostMutation } from './__generated__/PostComposerCreatePostMutation.graphql';
import type {
  MobileFullscreenComposerShellCandidate as MobileFullscreenComposerShellCandidateComponent,
  MobileFullscreenComposerShellCandidateProps,
} from './PostComposer';
import type {
  PostComposerController as PostComposerComponent,
  PostComposerCreatedPost,
} from './PostComposerController';
import type { PostRequestMediaItem } from './PostComposerMediaControls';
import type { PostComposerMentionInput as PostComposerMentionInputComponent } from './PostComposerMentionInput';
import type { PostComposerProfileRef } from './PostComposerProfileSwitcher';
import type {
  PostComposerMentionCandidate,
  PostComposerMentionCandidateResults,
  PostComposerMentionQuery,
} from './postComposerState';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const platform = { OS: 'web' };
const previousRequestAnimationFrame = globalThis.requestAnimationFrame;
const previousCancelAnimationFrame = globalThis.cancelAnimationFrame;
const appStateListeners = new Set<(nextState: string) => void>();
let keyboardDismissCount = 0;
const emitAppState = (nextState: string) => {
  for (const listener of appStateListeners) {
    listener(nextState);
  }
};
let mentionSearchEnabled = true;
Object.assign(platform, {
  select: <T>(values: { default?: T; web?: T }) => values.web ?? values.default,
});
const mediaValue = {
  hasPendingMedia: false,
  items: [{ altText: '대체 텍스트', mediaId: 'media-1' }],
  sensitiveMedia: true,
  getPostRequestMedia: () => {
    if (mediaState !== 'ready') {
      throw new Error('Media is unavailable');
    }
    return submittedMediaItems;
  },
  requirePostRequestMediaReselection: (mediaId: string) => reselectionMediaIds.push(mediaId),
};
let mediaState: 'ready' | 'uploading' | 'failed' = 'ready';
let submittedMediaItems: PostRequestMediaItem[] = [
  { altText: '대체 텍스트', applyAiProhibitFilter: false, mediaId: 'media-1' },
];
let reselectionMediaIds: string[] = [];
let refreshMedia: (() => void) | undefined;
let switcherProps:
  | {
      disabled?: boolean;
      onSelectionSuccess?: () => void;
      onSelectProfile: (id: string, profile: PostComposerProfileRef) => void | Promise<void>;
      profiles: readonly PostComposerProfileRef[];
      selectedProfileId: string;
    }
  | undefined;
let targetProps:
  | {
      author?: unknown;
      authorProfileId: string;
      body: string;
      contentWarning: string;
      bodyRef?: { current: { focus: () => void } | null };
      mentionCandidates?: PostComposerMentionCandidateResults;
      mentionSearchState?: 'error' | 'loading' | 'ready';
      onBodyChange: (value: string) => void;
      onContentWarningChange: (value: string) => void;
      onRetryMentionSearch?: () => void;
      onSelectionChange: (selection: { end: number; start: number }) => void;
      onSelectMention: (
        candidate: PostComposerMentionCandidate,
        query: PostComposerMentionQuery,
      ) => void;
      onSubmit: () => void;
      onVisibilityChange: (value: 'DIRECT' | 'FOLLOWERS' | 'PUBLIC' | 'UNLISTED') => void;
      remaining: number;
      selection: { end: number; start: number };
      selectionToApply?: { end: number; start: number };
      submitting?: boolean;
    }
  | undefined;
let mutationCalls: Array<{
  onCompleted: (
    response: {
      createPost: {
        post?: { id: string; slug: string } | null;
        request: {
          id: string;
          post?: { id: string; slug: string } | null;
          requestId: string;
          status?: string | null;
        } | null;
      } | null;
    } | null,
    errors?: Array<{
      extensions?: { code?: unknown; field?: unknown };
      message: string;
      path?: ReadonlyArray<number | string>;
    }> | null,
  ) => void;
  onError: (error: Error) => void;
  variables: {
    input: Record<string, unknown>;
  };
}> = [];
const analyticsEvents: Array<{ event: string; properties: Record<string, unknown> }> = [];
let sessionAccountId: string | null = 'account-1';
let sessionSelectedProfileId: string | null = 'profile-a';
const serverGeneratedRequestId = (callIndex: number) =>
  `00000000-0000-4000-8000-${String(callIndex + 1).padStart(12, '0')}`;

const acceptedRequestResponse = (callIndex: number) => ({
  createPost: {
    post: null,
    request: {
      id: `post-request-node-${callIndex}`,
      post: null,
      requestId: serverGeneratedRequestId(callIndex),
      status: 'QUEUED',
    },
  },
});
let renderer: ReactTestRenderer | null = null;
type PendingMentionSearchRequest = {
  complete: () => void;
  disposed: boolean;
  error: (error: Error) => void;
  name: string;
  next: (response: GraphQLResponse) => void;
  variables: Record<string, unknown>;
};
let requests: PendingMentionSearchRequest[] = [];
let relayEnvironment: Environment;
let relayEnvironmentGeneration: { current: number } | null = null;
let textInputMountCount = 0;
let textInputUnmountCount = 0;
let PostComposerMentionInput: typeof PostComposerMentionInputComponent;
let MobileFullscreenComposerShellCandidate: typeof MobileFullscreenComposerShellCandidateComponent;
let toastCalls: Array<[string, { tone: string }]> = [];
const mobileScrollRequests: Array<{ animated?: boolean; y?: number }> = [];
let mobileScrollNodeDimensions: {
  clientHeight: number;
  scrollHeight: number;
  scrollTop?: number;
} | null = null;

const MobileComposerScrollView = forwardRef<
  {
    getScrollableNode: () => typeof mobileScrollNodeDimensions;
    scrollTo: (options: { animated?: boolean; y?: number }) => void;
  },
  { children?: ReactNode; [key: string]: unknown }
>(({ children, ...props }, ref) => {
  useImperativeHandle(
    ref,
    () => ({
      getScrollableNode: () => mobileScrollNodeDimensions,
      scrollTo: (options) => mobileScrollRequests.push(options),
    }),
    [],
  );
  return createElement('ScrollView', props as never, children as ReactNode);
});

const profileA = {
  ' $fragmentSpreads': {
    PostComposerProfileSwitcher_profiles: true,
    PostComposer_profile: true,
  } as const,
  avatar: { id: 'avatar-a', url: 'https://example.com/a.png' },
  displayName: '프로필 A',
  handle: 'profile-a',
  id: 'profile-a',
  private: { defaultPostVisibility: 'UNLISTED' },
  relativeHandle: '@profile-a',
};
const profileB = {
  ' $fragmentSpreads': {
    PostComposerProfileSwitcher_profiles: true,
    PostComposer_profile: true,
  } as const,
  avatar: { id: 'avatar-b', url: 'https://example.com/b.png' },
  displayName: '프로필 B',
  handle: 'profile-b',
  id: 'profile-b',
  private: { defaultPostVisibility: 'PUBLIC' },
  relativeHandle: '@profile-b',
};
const candidates = [profileA, profileB] satisfies readonly PostComposerProfileRef[];

const createRelayEnvironment = () =>
  new Environment({
    network: Network.create((operation, variables) =>
      Observable.create<GraphQLResponse>((sink) => {
        const request: PendingMentionSearchRequest = {
          complete: () => sink.complete(),
          disposed: false,
          error: (error) => sink.error(error),
          name: operation.name,
          next: (response) => sink.next(response),
          variables: { ...variables },
        };
        requests.push(request);
        return () => {
          request.disposed = true;
        };
      }),
    ),
    store: new Store(new RecordSource()),
  });

function seedHomeTimeline(environment: Environment, existingPostIds: readonly string[] = []) {
  commitLocalUpdate(environment, (store) => {
    const root = store.getRoot();
    const connectionId = ConnectionHandler.getConnectionID(
      root.getDataID(),
      'PostList_homeTimeline',
    );
    const connection = store.create(connectionId, 'PostConnection');
    const edges = existingPostIds.map((id) => {
      const post = store.create(id, 'Post');
      return ConnectionHandler.createEdge(store, connection, post, 'PostConnectionEdge');
    });
    connection.setLinkedRecords(edges, 'edges');
    root.setLinkedRecord(
      connection,
      getRelayHandleKey('connection', 'PostList_homeTimeline', null),
    );
  });
}

function makeCreatedPost({
  bodyText,
  id,
  profileId,
  relativeHandle,
}: Readonly<{ bodyText: string; id: string; profileId: string; relativeHandle: string }>) {
  const profile = {
    __typename: 'Profile',
    avatar: null,
    displayName: profileId,
    id: profileId,
    instance: { __typename: 'ProfileInstance', kind: 'LOCAL' },
    relativeHandle,
    viewerState: {
      __typename: 'ProfileViewerState',
      blockedBy: false,
      isSelf: true,
      profileBlock: null,
      profileMute: null,
    },
  };
  const content = {
    __typename: 'PostContent',
    bodyText,
    contentWarning: null,
    document: null,
    id: `content:${id}`,
    media: [],
    mentionedProfiles: [],
  };

  return {
    __typename: 'Post',
    content,
    createdAt: '2026-11-03T00:00:00.000Z',
    id,
    slug: `Slug${id
      .slice(-8)
      .replace(/[^A-Za-z0-9]/g, '')
      .padStart(8, '0')}`,
    isPinned: false,
    profile,
    reactionCounts: [],
    replyCount: 0,
    replyParent: null,
    repostCount: 0,
    repostSource: null,
    state: 'ACTIVE',
    viewerBookmark: null,
    viewerReactions: [],
    viewerRepost: null,
    visibility: 'UNLISTED',
  };
}

function homeTimelinePostIds(environment: Environment) {
  const connectionId = ConnectionHandler.getConnectionID('client:root', 'PostList_homeTimeline');
  const source = environment.getStore().getSource();
  const connection = source.get(connectionId) as Record<string, unknown> | undefined;
  const edgeIds = (connection?.['edges'] as { __refs?: ReadonlyArray<string | null> } | undefined)
    ?.__refs;

  return (edgeIds ?? []).flatMap((edgeId) => {
    if (!edgeId) {
      return [];
    }
    const edge = source.get(edgeId) as Record<string, unknown> | undefined;
    const postId = (edge?.['node'] as { __ref?: string } | undefined)?.__ref;
    return postId ? [postId] : [];
  });
}

// ReactTestRenderer lifecycle probe only; this fixture does not model browser or device focus.
function TrackedTextInput(props: Record<string, unknown>) {
  useEffect(() => {
    textInputMountCount += 1;
    return () => {
      textInputUnmountCount += 1;
    };
  }, []);
  return createElement('TextInput', props);
}

const mockModule = (specifier: string | URL, exports: object) =>
  mock.module(specifier, {
    exports,
  } as unknown as Parameters<typeof mock.module>[1]);

mockModule('react-native', {
  AppState: {
    addEventListener: (_eventType: string, listener: (nextState: string) => void) => {
      appStateListeners.add(listener);
      return { remove: () => appStateListeners.delete(listener) };
    },
  },
  Keyboard: { dismiss: () => keyboardDismissCount++ },
  Modal: 'Modal',
  Platform: platform,
  Pressable: 'Pressable',
  ScrollView: MobileComposerScrollView,
  StyleSheet: { create: <T>(styles: T) => styles },
  Text: 'Text',
  TextInput: 'TextInput',
  useWindowDimensions: () => ({ height: 800, width: 390 }),
  View: 'View',
});
mockModule(require.resolve('lucide-react-native'), {
  AtSignIcon: 'AtSignIcon',
  ChartNoAxesColumnIncreasingIcon: 'ChartNoAxesColumnIncreasingIcon',
  ChevronDownIcon: 'ChevronDownIcon',
  ExpandIcon: 'ExpandIcon',
  GlobeIcon: 'GlobeIcon',
  ImagePlusIcon: 'ImagePlusIcon',
  LockIcon: 'LockIcon',
  MoonIcon: 'MoonIcon',
  SmileIcon: 'SmileIcon',
  TriangleAlertIcon: 'TriangleAlertIcon',
  XIcon: 'XIcon',
});
mockModule('react-native-svg', { Circle: 'Circle', Svg: 'Svg' });
mockModule('react-relay', {
  ...ReactRelay,
  graphql: (parts: TemplateStringsArray) => {
    const operationName = parts.join('').match(/(?:query|fragment|mutation)\s+(\w+)/)?.[1];
    return operationName === 'PostComposerMentionSuggestionsQuery'
      ? PostComposerMentionSuggestionsQueryNode
      : {};
  },
  useFragment: (_fragment: unknown, key: typeof profileA) => key,
  useMutation: () => [
    (config: (typeof mutationCalls)[number]) => {
      mutationCalls.push(config);
    },
    false,
  ],
  useRelayEnvironment: () => relayEnvironment,
});
mockModule('@/session/SessionProvider', {
  useSession: () => ({ accountId: sessionAccountId, selectedProfileId: sessionSelectedProfileId }),
});
mockModule('@/analytics/client', {
  trackAnalytics: (event: string, properties: unknown) => {
    analyticsEvents.push({ event, properties: properties as Record<string, unknown> });
  },
});
mockModule('@/components/FeatureFlagsContext', { useFeatureFlag: () => mentionSearchEnabled });
mockModule('@/components/profile/ProfileNameBlock', {
  ProfileNameBlock: () => createElement('ProfileNameBlock'),
});
mockModule('@/components/profile/ProfilePicker', { ProfilePicker: 'ProfilePicker' });
mockModule('@/components/ui/Avatar', { Avatar: 'Avatar' });
mockModule('@/components/ui/Button', { Button: 'Button' });
mockModule('@/components/ui/Form', { Form: 'Form' });
mockModule('@/components/ui/ToastProvider', {
  useToast: () => ({
    showToast: (message: string, options: { tone: string }) => toastCalls.push([message, options]),
  }),
});
mockModule('@/components/ui/TextField', { TextArea: 'TextArea', TextField: 'TextField' });
mockModule('@/relay/RelayEnvironmentBoundary', {
  useRelayEnvironmentGeneration: () => relayEnvironmentGeneration,
});
mockModule('@/theme/ThemeProvider', {
  useElevation: () => ({ floating: {}, overlay: {} }),
  useTheme: () => ({
    backgroundElevated: '#fff',
    borderDefault: '#ddd',
    border: '#ddd',
    card: '#fff',
    danger: '#c00',
    foregroundPrimary: '#111',
    foregroundSecondary: '#666',
    overlayScrim: '#000',
    stateHover: '#eee',
    surface: '#eee',
    text: '#111',
    textSecondary: '#666',
  }),
});
mockModule('@/theme/tokens', {
  borderWidths: { 0: 0, 1: 1 },
  fontFamilies: { ui: 'ui' },
  iconSizes: { 16: 16, 20: 20, 24: 24 },
  layoutRecipes: { labelSupportStack: {} },
  radii: { md: 12, sm: 8 },
  radius: { 12: 12 },
  space: { 4: 4, 8: 8, 12: 12 },
  spacing: { lg: 24, md: 16, sm: 8, xs: 4 },
  textStyles: { uiCopyM: {}, uiCopyS: {}, uiLabelM: {} },
  typography: { sm: {}, xsm: {} },
});
mockModule('./ComposerMediaEditor', { ComposerMediaEditor: 'ComposerMediaEditor' });
mockModule('./PostComposerMediaItemsTarget', {
  PostComposerMediaItemsTarget: 'PostComposerMediaItemsTarget',
});
mockModule('./PostComposerProfileSwitcher', {
  PostComposerProfileSwitcher: (props: typeof switcherProps) => {
    switcherProps = props;
    return createElement('ProfileSwitcher', props);
  },
});
mockModule('./PostComposerMediaControls', {
  emptyPostComposerMediaValue: {
    getPostRequestMedia: () => [],
    hasPendingMedia: false,
    items: [],
    sensitiveMedia: false,
    requirePostRequestMediaReselection: (mediaId: string) => reselectionMediaIds.push(mediaId),
  },
  PostComposerMediaControls: ({
    onValueChange,
    render,
  }: {
    onValueChange: (value: typeof mediaValue) => void;
    render: (props: Record<string, unknown>) => unknown;
  }) => {
    const [, setRenderVersion] = useState(0);
    useEffect(() => {
      refreshMedia = () => setRenderVersion((version) => version + 1);
      onValueChange(mediaValue);
      return () => {
        refreshMedia = undefined;
      };
    }, [onValueChange]);
    const item = {
      altText: '대체 텍스트',
      asset: { uri: 'https://example.com/a.png' },
      key: 'media-key-1',
      state: mediaState,
    };
    return render({
      error: null,
      items: [item],
      onAltTextChange: () => undefined,
      onApplyAiProhibitFilterChange: () => undefined,
      onRightsChange: () => undefined,
      onMediaAction: () => undefined,
      onMediaRemove: () => undefined,
      onMediaRetry: () => undefined,
      onSensitiveMediaChange: () => undefined,
      sensitiveMedia: true,
    });
  },
});
mockModule('./PostComposer', {
  MobileFullscreenComposerShellCandidate: 'MobileFullscreenComposerShellCandidate',
  PostComposer: (props: typeof targetProps) => {
    targetProps = props;
    return createElement(
      'PostComposerTarget',
      props,
      props?.author as never,
      PostComposerMentionInput
        ? createElement(PostComposerMentionInput, {
            authorProfileId: props?.authorProfileId ?? '',
            body: props?.body ?? '',
            disabled: props?.submitting,
            inputRef: (props?.bodyRef ?? { current: null }) as never,
            mentionCandidates: props?.mentionCandidates,
            mentionSearchState: props?.mentionSearchState,
            onBodyChange: props?.onBodyChange ?? (() => undefined),
            onRetryMentionSearch: props?.onRetryMentionSearch,
            onSelectionChange: props?.onSelectionChange ?? (() => undefined),
            onSelectMention: props?.onSelectMention ?? (() => undefined),
            renderInput: ({ webProps, ...inputProps }) =>
              createElement(TrackedTextInput, { ...inputProps, ...webProps }),
            selection: props?.selection ?? { end: 0, start: 0 },
            selectionToApply: props?.selectionToApply,
          })
        : null,
    );
  },
});

let PostComposer: typeof PostComposerComponent;

before(async () => {
  ({ PostComposerMentionInput } = await import('./PostComposerMentionInput'));
  // Load the real shell while the controller's `./PostComposer` import stays mocked above.
  const mobileComposerModuleUrl = new URL('./PostComposer.tsx', import.meta.url);
  mobileComposerModuleUrl.searchParams.set('test', 'initial-anchor-regression');
  const mobileComposerModule = (await import(mobileComposerModuleUrl.href)) as {
    MobileFullscreenComposerShellCandidate: typeof MobileFullscreenComposerShellCandidateComponent;
  };
  ({ MobileFullscreenComposerShellCandidate } = mobileComposerModule);
  ({ PostComposerController: PostComposer } = await import('./PostComposerController'));
});

beforeEach(() => {
  mentionSearchEnabled = true;
  submittedMediaItems = [
    { altText: '대체 텍스트', applyAiProhibitFilter: false, mediaId: 'media-1' },
  ];
  appStateListeners.clear();
  keyboardDismissCount = 0;
  requests = [];
  relayEnvironment = createRelayEnvironment();
  relayEnvironmentGeneration = null;
  sessionAccountId = 'account-1';
  sessionSelectedProfileId = 'profile-a';
  analyticsEvents.length = 0;
  textInputMountCount = 0;
  textInputUnmountCount = 0;
  mobileScrollRequests.length = 0;
  mobileScrollNodeDimensions = null;
  toastCalls = [];
});

afterEach(async () => {
  if (renderer) {
    await act(async () => renderer?.unmount());
    renderer = null;
  }
  Object.assign(globalThis, {
    cancelAnimationFrame: previousCancelAnimationFrame,
    requestAnimationFrame: previousRequestAnimationFrame,
  });
  platform.OS = 'web';
  mediaState = 'ready';
  refreshMedia = undefined;
  switcherProps = undefined;
  targetProps = undefined;
  mutationCalls = [];
  reselectionMediaIds = [];
  mock.restoreAll();
});

describe('PostComposer initial body', () => {
  it('waits for the Session owner identity before submitting a request', async () => {
    sessionAccountId = null;
    await act(async () => {
      renderer = create(createElement(PostComposer, { profile: profileA as never }));
    });
    await act(async () => targetProps?.onBodyChange('게시 요청'));
    await act(async () => targetProps?.onSubmit());

    assert.equal(mutationCalls.length, 0);
  });

  it('seeds an editable reply and submits its plain text when mention search is off', async () => {
    mentionSearchEnabled = false;
    const seed = '@parent @remote@remote.example ';
    const props = {
      initialBodyText: seed,
      onRequestClose: () => undefined,
      presentation: 'overlay' as const,
      profile: profileA as never,
      replyParentId: 'post-parent-a',
      replyParentVisibility: 'UNLISTED' as const,
    };

    await act(async () => {
      renderer = create(createElement(PostComposer, props));
    });
    await act(async () => undefined);

    assert.equal(targetProps?.body, seed);
    assert.deepEqual(targetProps?.selection, { start: seed.length, end: seed.length });
    const textInput = () => renderer?.root.findByType('TextInput' as never);
    assert.deepEqual(textInput()?.props.selection, { start: seed.length, end: seed.length });
    assert.equal(requests.length, 0);

    const movedSelection = { start: 4, end: 4 };
    await act(async () =>
      (textInput()?.props.onSelectionChange as (event: unknown) => void)({
        nativeEvent: { selection: movedSelection },
      }),
    );
    assert.equal(targetProps?.body, seed);
    assert.deepEqual(targetProps?.selection, movedSelection);
    assert.equal(Object.hasOwn(textInput()?.props ?? {}, 'selection'), false);

    await act(async () => targetProps?.onBodyChange('@parent '));
    assert.equal(targetProps?.body, '@parent ');

    await act(async () => targetProps?.onSubmit());
    assert.equal(mutationCalls[0]?.variables.input.bodyText, '@parent');
    assert.equal(mutationCalls[0]?.variables.input.mentions, undefined);
    assert.equal(mutationCalls[0]?.variables.input.replyParentId, 'post-parent-a');
    assert.equal(requests.length, 0);

    const nextSeed = '@new-parent ';
    await act(async () => {
      renderer?.update(
        createElement(PostComposer, {
          ...props,
          initialBodyText: nextSeed,
          replyParentId: 'post-parent-b',
        }),
      );
    });
    assert.equal(targetProps?.body, nextSeed);
    assert.deepEqual(targetProps?.selection, { start: nextSeed.length, end: nextSeed.length });
  });

  it('keeps a normal Post empty without an initial body', async () => {
    const profile = { ...profileA, private: { defaultPostVisibility: 'PUBLIC' } };
    await act(async () => {
      renderer = create(createElement(PostComposer, { profile: profile as never }));
    });

    assert.equal(targetProps?.body, '');
    assert.deepEqual(targetProps?.selection, { start: 0, end: 0 });
    assert.equal(
      renderer?.root.findByType('PostComposerTarget' as never).props.visibility,
      'PUBLIC',
    );
  });
});

describe('PostComposer submit handler', () => {
  it('ignores a native press event and submits the current composer state', async () => {
    await act(async () => {
      renderer = create(createElement(PostComposer, { profile: profileA as never }));
    });
    await act(async () => targetProps?.onBodyChange('버튼에서 제출할 본문'));

    const pressEvent = {
      nativeEvent: {
        actorProfileId: 'event-actor',
        bodyText: '이벤트 본문',
      },
    };
    const onSubmit = targetProps?.onSubmit;
    assert.ok(onSubmit);
    await act(async () => {
      Reflect.apply(onSubmit, undefined, [pressEvent]);
    });

    const submittedInput = mutationCalls[0]?.variables.input;
    assert.equal(mutationCalls.length, 1);
    assert.equal(Object.hasOwn(submittedInput ?? {}, 'requestId'), false);
    assert.equal(submittedInput?.bodyText, '버튼에서 제출할 본문');
    assert.equal(submittedInput?.actorProfileId, profileA.id);
  });
});

describe('PostComposer character count', () => {
  it('counts the combined body and Content Warning in Unicode code points', async () => {
    await act(async () => {
      renderer = create(
        createElement(PostComposer, {
          onRequestClose: () => undefined,
          presentation: 'overlay',
          profile: profileA as never,
        }),
      );
    });

    await act(async () => {
      targetProps?.onBodyChange('가'.repeat(500));
      targetProps?.onContentWarningChange('😀');
    });
    assert.equal(targetProps?.remaining, -1);

    await act(async () => targetProps?.onSubmit());
    assert.equal(mutationCalls.length, 0);

    await act(async () => targetProps?.onBodyChange('가'.repeat(499)));
    assert.equal(targetProps?.remaining, 0);
    await act(async () => targetProps?.onSubmit());

    assert.equal(mutationCalls.length, 1);
    assert.equal(mutationCalls[0]?.variables.input.bodyText, '가'.repeat(499));
    assert.equal(mutationCalls[0]?.variables.input.contentWarning, '😀');
  });
});

describe('PostComposer request acknowledgement cache projection', () => {
  for (const status of ['QUEUED', 'PUBLISHED'] as const) {
    it(`projects a ${status} acknowledgement into Profile requests without changing Home`, async () => {
      const requestNodeId = 'post-request-node';
      const publishedPostId = 'post-published';
      const createdPosts: PostComposerCreatedPost[] = [];
      let acceptedCount = 0;
      const query = getRequest(PostRequestListQueryNode);
      const environment = relayEnvironment;
      const seedList = (profileId: string) => {
        environment.commitPayload(createOperationDescriptor(query, { profileId }), {
          node: {
            __typename: 'Profile',
            id: profileId,
            postRequests: [],
          },
        });
      };
      seedList('profile-a');
      seedList('profile-b');
      seedHomeTimeline(environment, ['post-home-existing']);

      const composerProps = (profile: typeof profileA) => ({
        onPostCreated: (post: PostComposerCreatedPost) => createdPosts.push(post),
        onPostRequestAccepted: () => acceptedCount++,
        onRequestClose: () => undefined,
        presentation: 'overlay' as const,
        profile: profile as never,
      });

      await act(async () => {
        renderer = create(createElement(PostComposer, composerProps(profileA)));
      });
      await act(async () => targetProps?.onBodyChange('접수된 본문'));
      await act(async () => targetProps?.onSubmit());

      const call = mutationCalls[0];
      assert.ok(call);
      assert.equal(call.variables.input.actorProfileId, profileA.id);
      const requestId = serverGeneratedRequestId(0);
      const variables = call.variables as PostComposerCreatePostMutation['variables'];
      const mutationOperation = createOperationDescriptor(
        getRequest(CreatePostMutation),
        variables,
      );
      const publishedPost =
        status === 'PUBLISHED'
          ? makeCreatedPost({
              bodyText: '접수된 본문',
              id: publishedPostId,
              profileId: 'profile-a',
              relativeHandle: '@profile-a',
            })
          : null;
      environment.commitPayload(mutationOperation, {
        createPost: {
          post: publishedPost,
          request: {
            __typename: 'PostRequest',
            authorProfile: {
              __typename: 'Profile',
              avatar: null,
              displayName: '작성자',
              handle: '@writer',
              id: 'profile-a',
              relativeHandle: '@writer',
            },
            bodyText: '접수된 본문',
            id: requestNodeId,
            media: [],
            post: publishedPost,
            requestId,
            sensitiveMedia: true,
            status,
          },
        },
      });
      await act(async () =>
        call.onCompleted({
          createPost: {
            post: publishedPost ? { id: publishedPostId, slug: publishedPost.slug } : null,
            request: {
              id: requestNodeId,
              post: publishedPost ? { id: publishedPostId, slug: publishedPost.slug } : null,
              requestId,
              status,
            },
          },
        }),
      );
      assert.equal(targetProps?.body, '');
      assert.deepEqual(
        createdPosts,
        status === 'PUBLISHED' ? [{ id: publishedPostId, slug: publishedPost!.slug }] : [],
      );
      assert.equal(acceptedCount, status === 'PUBLISHED' ? 0 : 1);
      assert.deepEqual(analyticsEvents, [
        {
          event: 'post_created',
          properties: {
            ai_prohibit_image_count: 0,
            selected_profile_id: profileA.id,
            visibility: 'UNLISTED',
          },
        },
      ]);

      const requestIds = (profileId: string) => {
        const operation = createOperationDescriptor(query, { profileId });
        const data = environment.lookup(operation.fragment).data as {
          node: { __typename: string; postRequests: ReadonlyArray<{ id: string }> } | null;
        };
        return data.node?.__typename === 'Profile'
          ? data.node.postRequests.map((request) => request.id)
          : [];
      };

      assert.deepEqual(requestIds('profile-a'), status === 'PUBLISHED' ? [] : [requestNodeId]);
      assert.deepEqual(requestIds('profile-b'), []);
      assert.deepEqual(homeTimelinePostIds(environment), ['post-home-existing']);

      const requestRecord = environment.getStore().getSource().get(requestNodeId);
      assert.equal(requestRecord?.bodyText, '접수된 본문');
      assert.equal(requestRecord?.sensitiveMedia, true);
      assert.equal(requestRecord?.status, status);
      assert.equal(requestRecord?.draft, undefined);

      if (status === 'PUBLISHED') {
        await act(async () => {
          renderer?.update(createElement(PostComposer, composerProps(profileB)));
        });
        await act(async () => targetProps?.onBodyChange('프로필 B에서 작성한 본문'));
        await act(async () => targetProps?.onSubmit());

        const authorBCall = mutationCalls[1];
        assert.ok(authorBCall);
        const authorBRequestId = serverGeneratedRequestId(1);
        const authorBRequestNodeId = 'post-request-node-profile-b';
        const authorBPostId = 'post-published-profile-b';
        const authorBPost = makeCreatedPost({
          bodyText: '프로필 B에서 작성한 본문',
          id: authorBPostId,
          profileId: profileB.id,
          relativeHandle: profileB.relativeHandle,
        });
        assert.equal(authorBCall.variables.input.actorProfileId, profileB.id);
        const authorBMutation = createOperationDescriptor(
          getRequest(CreatePostMutation),
          authorBCall.variables as PostComposerCreatePostMutation['variables'],
        );
        environment.commitPayload(authorBMutation, {
          createPost: {
            post: authorBPost,
            request: {
              __typename: 'PostRequest',
              authorProfile: {
                __typename: 'Profile',
                avatar: null,
                displayName: '작성자 B',
                handle: '@profile-b',
                id: profileB.id,
                relativeHandle: '@profile-b',
              },
              bodyText: '프로필 B에서 작성한 본문',
              id: authorBRequestNodeId,
              media: [],
              post: authorBPost,
              requestId: authorBRequestId,
              sensitiveMedia: false,
              status: 'PUBLISHED',
            },
          },
        });
        await act(async () =>
          authorBCall.onCompleted({
            createPost: {
              post: { id: authorBPostId, slug: authorBPost.slug },
              request: {
                id: authorBRequestNodeId,
                post: { id: authorBPostId, slug: authorBPost.slug },
                requestId: authorBRequestId,
                status: 'PUBLISHED',
              },
            },
          }),
        );

        assert.deepEqual(createdPosts, [
          ...(status === 'PUBLISHED' ? [{ id: publishedPostId, slug: publishedPost!.slug }] : []),
          { id: authorBPostId, slug: authorBPost.slug },
        ]);
        assert.deepEqual(analyticsEvents[1], {
          event: 'post_created',
          properties: {
            selected_profile_id: profileB.id,
            visibility: authorBCall.variables.input.visibility,
            ai_prohibit_image_count: 0,
          },
        });
        assert.deepEqual(requestIds(profileA.id), []);
        assert.deepEqual(requestIds(profileB.id), []);
        assert.deepEqual(homeTimelinePostIds(environment), ['post-home-existing']);
      }
    });
  }

  it('accepts a real Post response with no request without changing Home', async () => {
    const createdPostId = 'post-direct-created';
    const createdPosts: PostComposerCreatedPost[] = [];
    let acceptedCount = 0;
    const query = getRequest(PostRequestListQueryNode);
    const environment = relayEnvironment;
    for (const profileId of [profileA.id, profileB.id]) {
      environment.commitPayload(createOperationDescriptor(query, { profileId }), {
        node: { __typename: 'Profile', id: profileId, postRequests: [] },
      });
    }
    seedHomeTimeline(environment, ['post-home-existing']);

    await act(async () => {
      renderer = create(
        createElement(PostComposer, {
          onPostCreated: (post: PostComposerCreatedPost) => createdPosts.push(post),
          onPostRequestAccepted: () => acceptedCount++,
          onRequestClose: () => undefined,
          presentation: 'overlay',
          profile: profileA as never,
        }),
      );
    });
    await act(async () => targetProps?.onBodyChange('바로 게시된 본문'));
    await act(async () => targetProps?.onSubmit());

    const call = mutationCalls[0];
    assert.ok(call);
    const mutationOperation = createOperationDescriptor(
      getRequest(CreatePostMutation),
      call.variables as PostComposerCreatePostMutation['variables'],
    );
    environment.commitPayload(mutationOperation, {
      createPost: {
        post: makeCreatedPost({
          bodyText: '바로 게시된 본문',
          id: createdPostId,
          profileId: profileA.id,
          relativeHandle: profileA.relativeHandle,
        }),
        request: null,
      },
    });
    await act(async () =>
      call.onCompleted({
        createPost: {
          post: { id: createdPostId, slug: 'AbCdEf123456' },
          request: null,
        },
      }),
    );

    assert.equal(targetProps?.body, '');
    assert.deepEqual(createdPosts, [{ id: createdPostId, slug: 'AbCdEf123456' }]);
    assert.equal(acceptedCount, 0);
    assert.deepEqual(analyticsEvents, [
      {
        event: 'post_created',
        properties: {
          ai_prohibit_image_count: 0,
          selected_profile_id: profileA.id,
          visibility: 'UNLISTED',
        },
      },
    ]);
    assert.deepEqual(homeTimelinePostIds(environment), ['post-home-existing']);
    for (const profileId of [profileA.id, profileB.id]) {
      const data = environment.lookup(createOperationDescriptor(query, { profileId }).fragment)
        .data as {
        node: { __typename: string; postRequests: ReadonlyArray<{ id: string }> } | null;
      };
      const requestIds =
        data.node?.__typename === 'Profile'
          ? data.node.postRequests.map((request) => request.id)
          : [];
      assert.deepEqual(requestIds, []);
    }
  });

  it('counts protected images from the submitted snapshot after a request is accepted', async () => {
    submittedMediaItems = [
      { altText: '첫 이미지', applyAiProhibitFilter: true, mediaId: 'media-1' },
      { altText: '둘째 이미지', applyAiProhibitFilter: false, mediaId: 'media-2' },
      { altText: '셋째 이미지', applyAiProhibitFilter: true, mediaId: 'media-3' },
    ];
    await act(async () => {
      renderer = create(createElement(PostComposer, { profile: profileA as never }));
    });
    await act(async () => targetProps?.onBodyChange('보호 이미지가 포함된 본문'));
    await act(async () => targetProps?.onSubmit());

    const call = mutationCalls[0];
    assert.ok(call);
    assert.deepEqual(call.variables.input.media, [
      { altText: '첫 이미지', applyAiProhibitFilter: true, mediaId: 'media-1' },
      { altText: '둘째 이미지', applyAiProhibitFilter: false, mediaId: 'media-2' },
      { altText: '셋째 이미지', applyAiProhibitFilter: true, mediaId: 'media-3' },
    ]);

    submittedMediaItems = [
      { altText: '수정된 이미지', applyAiProhibitFilter: false, mediaId: 'media-4' },
    ];
    await act(async () => call.onCompleted(acceptedRequestResponse(0)));

    assert.deepEqual(analyticsEvents, [
      {
        event: 'post_created',
        properties: {
          ai_prohibit_image_count: 2,
          selected_profile_id: profileA.id,
          visibility: 'UNLISTED',
        },
      },
    ]);
  });

  it('shows completion feedback and closes after a direct Post when no Post callback is supplied', async () => {
    let closeCount = 0;
    await act(async () => {
      renderer = create(
        createElement(PostComposer, {
          onPostRequestAccepted: () => closeCount++,
          onRequestClose: () => undefined,
          presentation: 'overlay',
          profile: profileA as never,
        }),
      );
    });
    await act(async () => targetProps?.onBodyChange('게시 완료'));
    await act(async () => targetProps?.onSubmit());

    const call = mutationCalls[0];
    assert.ok(call);
    await act(async () =>
      call.onCompleted({
        createPost: {
          post: { id: 'post-direct-created', slug: 'AbCdEf123456' },
          request: null,
        },
      }),
    );

    assert.equal(targetProps?.body, '');
    assert.equal(closeCount, 1);
    assert.deepEqual(toastCalls, [['게시했어요', { tone: 'success' }]]);
  });
});

it('uses acknowledgement feedback without a published Post ID and published feedback with one', async () => {
  const createdPosts: PostComposerCreatedPost[] = [];
  let acceptedCount = 0;
  const props = {
    onPostCreated: (post: PostComposerCreatedPost) => createdPosts.push(post),
    onPostRequestAccepted: () => acceptedCount++,
    onRequestClose: () => undefined,
    presentation: 'overlay' as const,
    profile: profileA as never,
  };
  await act(async () => {
    renderer = create(createElement(PostComposer, props));
  });

  await act(async () => targetProps?.onBodyChange('게시할 답글'));
  await act(async () => targetProps?.onSubmit());
  const callWithNullPost = mutationCalls.at(-1);
  assert.ok(callWithNullPost);
  const nullPostRequestId = serverGeneratedRequestId(mutationCalls.length - 1);
  await act(async () =>
    callWithNullPost.onCompleted({
      createPost: {
        request: {
          id: `request-${nullPostRequestId}`,
          post: null,
          requestId: nullPostRequestId,
          status: 'PUBLISHED',
        },
      },
    }),
  );

  await act(async () => {
    renderer?.update(
      createElement(PostComposer, {
        onPostRequestAccepted: props.onPostRequestAccepted,
        onRequestClose: props.onRequestClose,
        presentation: props.presentation,
        profile: props.profile,
      }),
    );
  });
  await act(async () => targetProps?.onBodyChange('게시할 일반 글'));
  await act(async () => targetProps?.onSubmit());
  const callWithoutCreatedHandler = mutationCalls.at(-1);
  assert.ok(callWithoutCreatedHandler);
  const requestId = serverGeneratedRequestId(mutationCalls.length - 1);
  await act(async () =>
    callWithoutCreatedHandler.onCompleted({
      createPost: {
        request: {
          id: `request-${requestId}`,
          post: { id: 'post-published-without-handler', slug: 'Published001' },
          requestId,
          status: 'PUBLISHED',
        },
      },
    }),
  );

  assert.deepEqual(createdPosts, []);
  assert.equal(acceptedCount, 2);
  assert.deepEqual(toastCalls, [
    ['게시 요청을 접수했어요', { tone: 'success' }],
    ['게시했어요', { tone: 'success' }],
  ]);
});

describe('PostComposer media submission', () => {
  it('submits ready image references and metadata', async () => {
    await act(async () => {
      renderer = create(
        createElement(PostComposer, {
          onRequestClose: () => undefined,
          presentation: 'overlay',
          profile: profileA as never,
        }),
      );
    });
    await act(async () => targetProps?.onBodyChange('본문을 보존합니다'));
    await act(async () => targetProps?.onSubmit());

    assert.equal(mutationCalls.length, 1);
    assert.deepEqual(mutationCalls[0]?.variables.input.media, mediaValue.getPostRequestMedia());
  });

  it('submits checked media publication rights with the image metadata', async () => {
    submittedMediaItems = [
      {
        altText: '대체 텍스트',
        applyAiProhibitFilter: true,
        mediaId: 'media-1',
        rights: {
          personal: MediaUsePermission.EDIT,
          noncommercial: MediaUsePermission.ORIGINAL,
          commercial: MediaUsePermission.DENY,
        },
      },
    ];
    await act(async () => {
      renderer = create(
        createElement(PostComposer, {
          onRequestClose: () => undefined,
          presentation: 'overlay',
          profile: profileA as never,
        }),
      );
    });
    await act(async () => targetProps?.onBodyChange('본문을 보존합니다'));
    await act(async () => targetProps?.onSubmit());

    assert.deepEqual(mutationCalls[0]?.variables.input.media, [
      {
        altText: '대체 텍스트',
        applyAiProhibitFilter: true,
        mediaId: 'media-1',
        rights: {
          personal: MediaUsePermission.EDIT,
          noncommercial: MediaUsePermission.ORIGINAL,
          commercial: MediaUsePermission.DENY,
        },
      },
    ]);
  });

  it('omits media publication rights from create input when the license switch is off', async () => {
    await act(async () => {
      renderer = create(
        createElement(PostComposer, {
          onRequestClose: () => undefined,
          presentation: 'overlay',
          profile: profileA as never,
        }),
      );
    });
    await act(async () => targetProps?.onBodyChange('본문을 보존합니다'));
    await act(async () => targetProps?.onSubmit());

    assert.deepEqual(mutationCalls[0]?.variables.input.media, [
      { altText: '대체 텍스트', applyAiProhibitFilter: false, mediaId: 'media-1' },
    ]);
  });

  it('keeps the draft when media references cannot be submitted', async () => {
    mediaState = 'failed';
    await act(async () => {
      renderer = create(
        createElement(PostComposer, {
          onRequestClose: () => undefined,
          presentation: 'overlay',
          profile: profileA as never,
        }),
      );
    });
    await act(async () => targetProps?.onBodyChange('재시도할 본문'));
    await act(async () => targetProps?.onSubmit());

    assert.equal(mutationCalls.length, 0);
    assert.equal(targetProps?.body, '재시도할 본문');
    assert.equal(
      toastCalls[0]?.[0],
      '게시 요청을 접수하지 못했어요. 내용을 확인하고 다시 시도해 주세요.',
    );
  });
});

describe('PostComposer native background', () => {
  beforeEach(() => {
    Object.assign(globalThis, {
      cancelAnimationFrame: () => undefined,
      requestAnimationFrame: () => 0,
    });
  });

  it('dismisses the open native keyboard on background and keeps the mounted draft', async () => {
    platform.OS = 'ios';
    let closeCount = 0;
    await act(async () => {
      renderer = create(
        createElement(PostComposer, {
          focusOnMount: true,
          onRequestClose: () => closeCount++,
          presentation: 'overlay',
          profile: profileA as never,
        }),
      );
    });
    assert.equal(appStateListeners.size, 1);
    await act(async () => targetProps?.onBodyChange('보존할 본문'));

    await act(async () => {
      emitAppState('inactive');
      emitAppState('active');
    });
    assert.equal(keyboardDismissCount, 0);

    await act(async () => emitAppState('background'));
    assert.equal(keyboardDismissCount, 1);
    await act(async () => emitAppState('active'));
    assert.equal(keyboardDismissCount, 1);
    assert.equal(
      renderer?.root.findByType('PostComposerTarget' as never).props.body,
      '보존할 본문',
    );
    assert.equal(closeCount, 0);

    await act(async () => renderer?.unmount());
    renderer = null;
    assert.equal(appStateListeners.size, 0);
  });

  it('does not subscribe for a hidden native composer or a Web composer', async () => {
    platform.OS = 'ios';
    await act(async () => {
      renderer = create(
        createElement(PostComposer, { focusOnMount: false, profile: profileA as never }),
      );
    });
    assert.equal(appStateListeners.size, 0);
    await act(async () => emitAppState('background'));
    assert.equal(keyboardDismissCount, 0);
    await act(async () => renderer?.unmount());
    renderer = null;

    platform.OS = 'web';
    await act(async () => {
      renderer = create(
        createElement(PostComposer, { focusOnMount: true, profile: profileA as never }),
      );
    });
    assert.equal(appStateListeners.size, 0);
    await act(async () => emitAppState('background'));
    assert.equal(keyboardDismissCount, 0);
  });
});

describe('Mobile fullscreen reply initial anchor', () => {
  it('defers an unreachable anchor until layout growth and stops after reaching it', async () => {
    platform.OS = 'web';
    const animationFrames = new Map<number, (timestamp: number) => void>();
    let nextAnimationFrame = 1;
    Object.assign(globalThis, {
      cancelAnimationFrame: (id: number) => animationFrames.delete(id),
      requestAnimationFrame: (callback: (timestamp: number) => void) => {
        const id = nextAnimationFrame++;
        animationFrames.set(id, callback);
        return id;
      },
    });

    const scrollNodeDimensions = { clientHeight: 160, scrollHeight: 192, scrollTop: 0 };
    mobileScrollNodeDimensions = scrollNodeDimensions;
    const props: MobileFullscreenComposerShellCandidateProps = {
      author: null,
      beforeEditor: createElement('ReplyParentContext'),
      body: '',
      bodyRef: { current: null },
      contentWarning: '',
      contentWarningExpanded: false,
      items: [],
      mode: 'reply',
      onBodyChange: () => undefined,
      onContentWarningChange: () => undefined,
      onContentWarningToggle: () => undefined,
      onEmojiAction: () => undefined,
      onMediaAction: () => undefined,
      onMediaEdit: () => undefined,
      onMediaRemove: () => undefined,
      onMediaRetry: () => undefined,
      onOverlayClose: () => undefined,
      onPollAction: () => undefined,
      onSelectionChange: () => undefined,
      onSubmit: () => undefined,
      onVisibilityChange: () => undefined,
      remaining: 500,
      selection: { end: 0, start: 0 },
      sensitiveMedia: false,
      showCWAction: false,
      showEmojiAction: false,
      showMediaAction: false,
      showPollAction: false,
      visibility: 'PUBLIC',
    };

    await act(async () => {
      renderer = create(createElement(MobileFullscreenComposerShellCandidate, props));
    });
    const scrollView = () => renderer?.root.findByType('ScrollView' as never);
    const parent = renderer?.root
      .findAllByType('View' as never)
      .find((view) => typeof view.props.onLayout === 'function');
    assert.ok(parent);
    assert.ok(scrollView());

    await act(async () => {
      (scrollView()?.props.onLayout as (event: unknown) => void)({
        nativeEvent: { layout: { height: 160, width: 390 } },
      });
      (parent.props.onLayout as (event: unknown) => void)({
        nativeEvent: { layout: { height: 116, width: 390, x: 0, y: 0 } },
      });
    });
    const flushAnimationFrames = async () => {
      const callbacks = Array.from(animationFrames.values());
      animationFrames.clear();
      await act(async () => callbacks.forEach((callback) => callback(0)));
    };
    await flushAnimationFrames();
    assert.deepEqual(
      mobileScrollRequests.map(({ y }) => y),
      [],
      'the initial reply anchor waits while it exceeds the available scroll range',
    );

    const emitScroll = async (offset: number) => {
      scrollNodeDimensions.scrollTop = offset;
      await act(async () => {
        (scrollView()?.props.onScroll as (event: unknown) => void)({
          nativeEvent: { contentOffset: { x: 0, y: offset } },
        });
      });
    };
    await emitScroll(32);

    scrollNodeDimensions.clientHeight = 716;
    scrollNodeDimensions.scrollHeight = 880;
    await act(async () => {
      (scrollView()?.props.onLayout as (event: unknown) => void)({
        nativeEvent: { layout: { height: 716, width: 390 } },
      });
    });
    await act(async () => {
      (scrollView()?.props.onContentSizeChange as () => void)();
    });
    await flushAnimationFrames();
    assert.deepEqual(
      mobileScrollRequests.map(({ y }) => y),
      [116],
      'layout growth retries the still-pending reply anchor',
    );

    await emitScroll(116);
    await emitScroll(72);
    scrollNodeDimensions.clientHeight = 720;
    await act(async () => {
      (scrollView()?.props.onLayout as (event: unknown) => void)({
        nativeEvent: { layout: { height: 720, width: 390 } },
      });
      (scrollView()?.props.onContentSizeChange as () => void)();
    });
    await flushAnimationFrames();
    assert.deepEqual(
      mobileScrollRequests.map(({ y }) => y),
      [116],
      'later manual scrolling and layout changes do not re-anchor',
    );
  });
});

describe('PostComposer Reply visibility seed', () => {
  it('submits the more restrictive of the selected Profile default and Parent visibility', async () => {
    const cases = [
      { defaultPostVisibility: 'PUBLIC', parentVisibility: 'FOLLOWERS', expected: 'FOLLOWERS' },
      { defaultPostVisibility: 'PUBLIC', parentVisibility: 'DIRECT', expected: 'DIRECT' },
      { defaultPostVisibility: 'FOLLOWERS', parentVisibility: 'PUBLIC', expected: 'FOLLOWERS' },
    ] as const;

    for (const { defaultPostVisibility, parentVisibility, expected } of cases) {
      const profile = { ...profileA, private: { defaultPostVisibility } };
      await act(async () => {
        renderer = create(
          createElement(PostComposer, {
            onRequestClose: () => undefined,
            presentation: 'overlay',
            profile: profile as never,
            replyParentId: 'post-parent',
            replyParentVisibility: parentVisibility,
          }),
        );
      });

      assert.equal(
        renderer?.root.findByType('PostComposerTarget' as never).props.visibility,
        expected,
      );
      await act(async () => targetProps?.onBodyChange('답글 본문'));
      await act(async () => targetProps?.onSubmit());
      assert.equal(mutationCalls[0]?.variables.input.replyParentId, 'post-parent');
      assert.equal(mutationCalls[0]?.variables.input.visibility, expected);

      await act(async () => renderer?.unmount());
      renderer = null;
      targetProps = undefined;
      mutationCalls = [];
    }
  });

  it('preserves a manual visibility choice and seeds the clamp again after success', async () => {
    const profile = { ...profileA, private: { defaultPostVisibility: 'PUBLIC' } };
    await act(async () => {
      renderer = create(
        createElement(PostComposer, {
          onRequestClose: () => undefined,
          presentation: 'overlay',
          profile: profile as never,
          replyParentId: 'post-parent',
          replyParentVisibility: 'FOLLOWERS',
        }),
      );
    });

    assert.equal(
      renderer?.root.findByType('PostComposerTarget' as never).props.visibility,
      'FOLLOWERS',
    );
    await act(async () => targetProps?.onBodyChange('수동 공개 답글'));
    await act(async () => targetProps?.onVisibilityChange('PUBLIC'));
    await act(async () => targetProps?.onSubmit());
    assert.equal(mutationCalls[0]?.variables.input.visibility, 'PUBLIC');

    await act(async () => mutationCalls[0]?.onCompleted(acceptedRequestResponse(0)));
    assert.equal(targetProps?.body, '');
    assert.equal(
      renderer?.root.findByType('PostComposerTarget' as never).props.visibility,
      'FOLLOWERS',
    );

    await act(async () => targetProps?.onBodyChange('다음 답글'));
    await act(async () => targetProps?.onSubmit());
    assert.equal(mutationCalls[1]?.variables.input.visibility, 'FOLLOWERS');
  });

  it('keeps the current Reply draft and manual visibility when the Profile default changes', async () => {
    const profile = { ...profileA, private: { defaultPostVisibility: 'PUBLIC' } };
    const props = {
      onRequestClose: () => undefined,
      presentation: 'overlay' as const,
      profile: profile as never,
      replyParentId: 'post-parent',
      replyParentVisibility: 'PUBLIC' as const,
    };
    await act(async () => {
      renderer = create(createElement(PostComposer, props));
    });
    await act(async () => targetProps?.onBodyChange('보존할 답글'));
    await act(async () => targetProps?.onVisibilityChange('DIRECT'));

    await act(async () =>
      renderer?.update(
        createElement(PostComposer, {
          ...props,
          profile: { ...profile, private: { defaultPostVisibility: 'FOLLOWERS' } } as never,
        }),
      ),
    );

    assert.equal(targetProps?.body, '보존할 답글');
    assert.equal(
      renderer?.root.findByType('PostComposerTarget' as never).props.visibility,
      'DIRECT',
    );
    await act(async () => targetProps?.onSubmit());
    assert.equal(mutationCalls[0]?.variables.input.visibility, 'DIRECT');
  });

  it('leaves Quote visibility based on the Profile default', async () => {
    const profile = { ...profileA, private: { defaultPostVisibility: 'PUBLIC' } };
    await act(async () => {
      renderer = create(
        createElement(PostComposer, {
          onRequestClose: () => undefined,
          presentation: 'overlay',
          profile: profile as never,
          repostSourceId: 'post-source',
        }),
      );
    });

    assert.equal(
      renderer?.root.findByType('PostComposerTarget' as never).props.visibility,
      'PUBLIC',
    );
    await act(async () => targetProps?.onBodyChange('인용 본문'));
    await act(async () => targetProps?.onSubmit());
    assert.equal(mutationCalls[0]?.variables.input.repostSourceId, 'post-source');
    assert.equal(mutationCalls[0]?.variables.input.visibility, 'PUBLIC');
  });
});

describe('PostComposer local author', () => {
  it('preserves the draft while switching author and reports errors after failed media unlocks', async () => {
    let editorFocusCount = 0;
    const editorRef = { current: { focus: () => editorFocusCount++ } };
    await act(async () => {
      renderer = create(
        createElement(PostComposer, {
          editorRef: editorRef as never,
          onExpand: () => undefined,
          onRequestClose: () => undefined,
          presentation: 'rail',
          profile: profileA as never,
          profiles: candidates as never,
        }),
      );
    });
    await act(async () => undefined);

    assert.equal(switcherProps?.selectedProfileId, profileA.id);
    assert.equal(switcherProps?.disabled, false);
    await act(async () => targetProps?.onBodyChange('보존할 본문'));
    await act(async () => targetProps?.onContentWarningChange('보존할 CW'));
    await act(async () => targetProps?.onVisibilityChange('DIRECT'));

    mediaState = 'uploading';
    await act(async () => refreshMedia?.());
    assert.equal(switcherProps?.disabled, true);
    mediaState = 'failed';
    await act(async () => refreshMedia?.());
    assert.equal(switcherProps?.disabled, false);

    await act(async () => switcherProps?.onSelectProfile(profileB.id, profileB));
    await act(async () => switcherProps?.onSelectionSuccess?.());
    assert.equal(switcherProps?.selectedProfileId, profileB.id);
    assert.equal(editorFocusCount, 1);
    await act(async () => {
      renderer?.update(
        createElement(PostComposer, {
          editorRef: editorRef as never,
          onExpand: () => undefined,
          onRequestClose: () => undefined,
          presentation: 'rail',
          profile: profileA as never,
          profiles: [candidates[0]] as never,
        }),
      );
    });
    assert.ok(switcherProps?.profiles.some((candidate) => candidate === profileB));
    assert.equal(targetProps?.body, '보존할 본문');
    assert.equal(targetProps?.contentWarning, '보존할 CW');
    assert.equal(
      renderer?.root.findByType('PostComposerTarget' as never).props.visibility,
      'DIRECT',
    );

    await act(async () => targetProps?.onSubmit());
    assert.equal(mutationCalls.length, 0);
    assert.equal(targetProps?.body, '보존할 본문');

    mediaState = 'ready';
    await act(async () => refreshMedia?.());
    await act(async () => targetProps?.onSubmit());
    assert.equal(mutationCalls.length, 1);
    assert.deepEqual(mutationCalls[0]!.variables.input, {
      bodyText: '보존할 본문',
      contentWarning: '보존할 CW',
      media: mediaValue.getPostRequestMedia(),
      actorProfileId: profileB.id,
      sensitiveMedia: true,
      visibility: 'DIRECT',
    });

    const toastCountBeforeError = toastCalls.length;
    await act(async () => mutationCalls[0]?.onError(new Error('실패')));
    assert.equal(toastCalls.length, toastCountBeforeError + 1);
    assert.equal(targetProps?.body, '보존할 본문');
    assert.equal(targetProps?.contentWarning, '보존할 CW');
    assert.equal(
      renderer?.root.findByType('PostComposerTarget' as never).props.visibility,
      'DIRECT',
    );
  });

  it('calls the provided editor focus handle after Web and Native success', async () => {
    for (const platformName of ['web', 'ios'] as const) {
      platform.OS = platformName;
      let editorFocusCount = 0;
      const editorRef = { current: { focus: () => editorFocusCount++ } };
      await act(async () => {
        renderer = create(
          createElement(PostComposer, {
            editorRef: editorRef as never,
            onExpand: () => undefined,
            onRequestClose: () => undefined,
            presentation: 'rail',
            profile: profileA as never,
            profiles: candidates as never,
          }),
        );
      });
      await act(async () => undefined);

      await act(async () => switcherProps?.onSelectProfile(profileA.id, profileA));
      await act(async () => switcherProps?.onSelectionSuccess?.());
      assert.equal(editorFocusCount, 1);

      await act(async () => renderer?.unmount());
      renderer = null;
    }
  });

  it('keeps candidate identity tied to the current author and submits its normalized mention range', async () => {
    const alice: PostComposerMentionCandidate = {
      avatar: { url: 'https://example.com/alice.png' },
      displayName: '앨리스',
      domain: 'remote.example',
      id: 'profile-alice',
      relativeHandle: '@alice',
    };
    const mentionCandidates: PostComposerMentionCandidateResults = {
      authorProfileId: profileB.id,
      profiles: [alice],
      query: 'ali',
    };
    const query = { end: 10, query: 'ali', start: 6 };
    await act(async () => {
      renderer = create(
        createElement(PostComposer, {
          onExpand: () => undefined,
          onRequestClose: () => undefined,
          presentation: 'rail',
          profile: profileA as never,
          profiles: candidates as never,
          mentionCandidates,
        }),
      );
    });

    await act(async () => targetProps?.onBodyChange(' \r\n😀 @ali'));
    await act(async () => targetProps?.onSelectMention(alice, query));
    assert.equal(targetProps?.body, ' \r\n😀 @ali');
    assert.equal(targetProps?.authorProfileId, profileA.id);

    await act(async () => switcherProps?.onSelectProfile(profileB.id, profileB));
    assert.equal(targetProps?.authorProfileId, profileB.id);
    await act(async () => targetProps?.onSelectMention(alice, query));
    assert.equal(targetProps?.body, ' \r\n😀 @alice ');
    assert.deepEqual(targetProps?.selectionToApply, { start: 13, end: 13 });

    await act(async () => targetProps?.onSelectionChange({ start: 13, end: 13 }));
    assert.equal(targetProps?.selectionToApply, undefined);
    await act(async () => targetProps?.onBodyChange(' \r\n😀 @alice !'));
    assert.equal(targetProps?.selectionToApply, undefined);
    assert.deepEqual(targetProps?.selection, { start: 13, end: 13 });
    await act(async () => targetProps?.onSelectionChange({ start: 14, end: 14 }));

    await act(async () => targetProps?.onSubmit());
    assert.equal(mutationCalls.length, 1);
    assert.deepEqual(mutationCalls[0]!.variables.input, {
      actorProfileId: profileB.id,
      bodyText: '😀 @alice !',
      media: mediaValue.getPostRequestMedia(),
      mentions: [{ profileId: 'profile-alice', start: 3, end: 9 }],
      sensitiveMedia: true,
      visibility: 'UNLISTED',
    });
  });

  it('submits DIRECT with the selected Mentioned Profile range', async () => {
    const alice: PostComposerMentionCandidate = {
      displayName: '앨리스',
      id: 'profile-alice',
      relativeHandle: '@alice',
    };
    await act(async () => {
      renderer = create(
        createElement(PostComposer, {
          onExpand: () => undefined,
          onRequestClose: () => undefined,
          presentation: 'rail',
          profile: profileA as never,
          profiles: candidates as never,
          mentionCandidates: {
            authorProfileId: profileA.id,
            profiles: [alice],
            query: 'ali',
          },
        }),
      );
    });

    await act(async () => targetProps?.onBodyChange('@ali'));
    await act(async () => targetProps?.onSelectMention(alice, { end: 4, query: 'ali', start: 0 }));
    await act(async () => targetProps?.onVisibilityChange('DIRECT'));
    await act(async () => targetProps?.onSubmit());

    assert.equal(mutationCalls.length, 1);
    assert.deepEqual(mutationCalls[0]!.variables.input, {
      actorProfileId: profileA.id,
      bodyText: '@alice',
      media: mediaValue.getPostRequestMedia(),
      mentions: [{ profileId: 'profile-alice', start: 0, end: 6 }],
      sensitiveMedia: true,
      visibility: 'DIRECT',
    });
  });

  it('submits an author-only DIRECT post without Mentioned Profiles', async () => {
    await act(async () => {
      renderer = create(
        createElement(PostComposer, {
          onExpand: () => undefined,
          onRequestClose: () => undefined,
          presentation: 'rail',
          profile: profileA as never,
          profiles: candidates as never,
        }),
      );
    });

    await act(async () => targetProps?.onBodyChange('작성자만 읽을 수 있는 글'));
    await act(async () => targetProps?.onVisibilityChange('DIRECT'));
    await act(async () => targetProps?.onSubmit());
    assert.equal(mutationCalls[0]?.variables.input.bodyText, '작성자만 읽을 수 있는 글');
    assert.equal(mutationCalls[0]?.variables.input.visibility, 'DIRECT');
    assert.equal(mutationCalls[0]?.variables.input.mentions, undefined);
    await act(async () => mutationCalls[0]?.onCompleted(acceptedRequestResponse(0)));
    assert.equal(targetProps?.body, '');
  });

  it('keeps the draft and shows generic feedback for an invalid DIRECT mention', async () => {
    const alice: PostComposerMentionCandidate = {
      displayName: '앨리스',
      id: 'profile-alice',
      relativeHandle: '@alice',
    };
    await act(async () => {
      renderer = create(
        createElement(PostComposer, {
          onExpand: () => undefined,
          onRequestClose: () => undefined,
          presentation: 'rail',
          profile: profileA as never,
          profiles: candidates as never,
          mentionCandidates: {
            authorProfileId: profileA.id,
            profiles: [alice],
            query: 'ali',
          },
        }),
      );
    });

    await act(async () => targetProps?.onBodyChange('@ali'));
    await act(async () => targetProps?.onSelectMention(alice, { end: 4, query: 'ali', start: 0 }));
    await act(async () => targetProps?.onVisibilityChange('DIRECT'));
    await act(async () => targetProps?.onSubmit());
    await act(async () =>
      mutationCalls[0]?.onCompleted(null, [
        {
          message: 'The selected Mention is unavailable.',
          extensions: { code: 'VALIDATION', field: 'mentions' },
        },
      ]),
    );

    assert.equal(targetProps?.body.trim(), '@alice');
    assert.equal(
      renderer?.root.findByType('PostComposerTarget' as never).props.visibility,
      'DIRECT',
    );
    assert.deepEqual(analyticsEvents, []);
    assert.deepEqual(toastCalls[0], [
      '게시 요청을 접수하지 못했어요. 내용을 확인하고 다시 시도해 주세요.',
      { tone: 'danger' },
    ]);
  });

  it('requires media reselection only for an exact missing media slot field', async () => {
    await act(async () => {
      renderer = create(
        createElement(PostComposer, {
          onRequestClose: () => undefined,
          presentation: 'overlay',
          profile: profileA as never,
        }),
      );
    });
    await act(async () => targetProps?.onBodyChange('게시 요청'));

    await act(async () => targetProps?.onSubmit());
    await act(async () =>
      mutationCalls[0]?.onCompleted(null, [
        { message: 'Media slot is missing.', extensions: { code: 'NOT_FOUND', field: 'media.0' } },
      ]),
    );
    assert.deepEqual(reselectionMediaIds, ['media-1']);

    await act(async () => targetProps?.onSubmit());
    await act(async () =>
      mutationCalls[1]?.onCompleted(null, [
        {
          message: 'Unrelated media field error.',
          extensions: { code: 'VALIDATION', field: 'media.0.extra' },
        },
      ]),
    );
    assert.deepEqual(reselectionMediaIds, ['media-1']);
  });

  it('submits typed mentions as text with DIRECT while mention search is off', async () => {
    mentionSearchEnabled = false;
    await act(async () => {
      renderer = create(
        createElement(PostComposer, {
          onRequestClose: () => undefined,
          presentation: 'overlay',
          profile: profileA as never,
        }),
      );
    });

    await act(async () => targetProps?.onBodyChange('본문 @alice'));
    await act(async () => targetProps?.onVisibilityChange('DIRECT'));
    await act(async () => targetProps?.onSubmit());

    assert.equal(requests.length, 0);
    assert.equal(mutationCalls[0]?.variables.input.bodyText, '본문 @alice');
    assert.equal(mutationCalls[0]?.variables.input.visibility, 'DIRECT');
    assert.equal(mutationCalls[0]?.variables.input.mentions, undefined);
  });

  it('keeps the draft after a request error and submits again without a client request ID', async () => {
    let acceptedCount = 0;
    const createdPosts: PostComposerCreatedPost[] = [];
    await act(async () => {
      renderer = create(
        createElement(PostComposer, {
          onPostCreated: (post: PostComposerCreatedPost) => createdPosts.push(post),
          onPostRequestAccepted: () => acceptedCount++,
          onRequestClose: () => undefined,
          presentation: 'overlay',
          profile: profileA as never,
        }),
      );
    });
    await act(async () => targetProps?.onBodyChange('오류 뒤 보존할 본문'));
    await act(async () => targetProps?.onContentWarningChange('오류 뒤 보존할 CW'));
    await act(async () => targetProps?.onVisibilityChange('DIRECT'));
    await act(async () => targetProps?.onSubmit());

    const firstCall = mutationCalls[0];
    assert.ok(firstCall);
    assert.equal(Object.hasOwn(firstCall.variables.input, 'requestId'), false);
    await act(async () => firstCall.onError(new Error('acknowledgement lost')));

    assert.equal(targetProps?.body, '오류 뒤 보존할 본문');
    assert.equal(targetProps?.contentWarning, '오류 뒤 보존할 CW');
    assert.equal(
      renderer?.root.findByType('PostComposerTarget' as never).props.visibility,
      'DIRECT',
    );
    assert.equal(acceptedCount, 0);
    assert.deepEqual(createdPosts, []);
    assert.deepEqual(toastCalls.at(-1), [
      '게시 요청을 접수하지 못했어요. 내용을 확인하고 다시 시도해 주세요.',
      { tone: 'danger' },
    ]);
    assert.deepEqual(analyticsEvents, []);
    assert.equal(mutationCalls.length, 1);

    await act(async () => targetProps?.onSubmit());
    const secondCall = mutationCalls[1];
    assert.ok(secondCall);
    assert.equal(Object.hasOwn(secondCall.variables.input, 'requestId'), false);
    assert.deepEqual(secondCall.variables.input, firstCall.variables.input);
    await act(async () => secondCall.onCompleted(acceptedRequestResponse(1)));

    assert.equal(acceptedCount, 1);
    assert.deepEqual(createdPosts, []);
    assert.equal(targetProps?.body, '');
    assert.deepEqual(analyticsEvents, [
      {
        event: 'post_created',
        properties: {
          ai_prohibit_image_count: 0,
          selected_profile_id: profileA.id,
          visibility: 'DIRECT',
        },
      },
    ]);
  });

  it('ignores a mutation response after the composer actor and environment change', async () => {
    let acceptedCount = 0;
    relayEnvironmentGeneration = { current: 0 };
    const props = {
      onPostRequestAccepted: () => acceptedCount++,
      onRequestClose: () => undefined,
      presentation: 'overlay' as const,
      profile: profileA as never,
    };

    await act(async () => {
      renderer = create(createElement(PostComposer, props));
    });
    await act(async () => targetProps?.onBodyChange('첫 글'));
    await act(async () => targetProps?.onSubmit());
    const originalCall = mutationCalls[0];
    assert.ok(originalCall);
    assert.equal(originalCall.variables.input.actorProfileId, profileA.id);
    assert.equal(Object.hasOwn(originalCall.variables.input, 'requestId'), false);

    await act(async () => {
      relayEnvironment = createRelayEnvironment();
      relayEnvironmentGeneration!.current += 1;
      renderer?.update(createElement(PostComposer, { ...props, profile: profileB as never }));
    });
    await act(async () =>
      originalCall.onCompleted({
        createPost: {
          request: {
            id: 'request-node-a',
            requestId: serverGeneratedRequestId(0),
          },
        },
      }),
    );

    assert.equal(acceptedCount, 0);
    assert.equal(toastCalls.length, 0);
    assert.equal(targetProps?.body, '');
    assert.deepEqual(analyticsEvents, []);
  });

  it('records an accepted request even when a partial GraphQL error is present', async () => {
    let acceptedCount = 0;
    const createdPosts: PostComposerCreatedPost[] = [];
    await act(async () => {
      renderer = create(
        createElement(PostComposer, {
          onPostCreated: (post: PostComposerCreatedPost) => createdPosts.push(post),
          onPostRequestAccepted: () => acceptedCount++,
          onRequestClose: () => undefined,
          presentation: 'overlay',
          profile: profileA as never,
        }),
      );
    });
    await act(async () => targetProps?.onBodyChange('접수된 본문'));
    await act(async () => targetProps?.onVisibilityChange('FOLLOWERS'));
    await act(async () => targetProps?.onSubmit());

    const call = mutationCalls[0];
    assert.ok(call);
    await act(async () =>
      call.onCompleted(acceptedRequestResponse(0), [
        {
          message: 'nullable Post projection failed',
          path: ['createPost', 'request', 'post'],
        },
      ]),
    );

    assert.equal(targetProps?.body, '');
    assert.equal(acceptedCount, 1);
    assert.deepEqual(createdPosts, []);
    assert.deepEqual(analyticsEvents, [
      {
        event: 'post_created',
        properties: {
          ai_prohibit_image_count: 0,
          selected_profile_id: profileA.id,
          visibility: 'FOLLOWERS',
        },
      },
    ]);
  });

  it('preserves the draft when a response has neither a real Post nor an accepted request', async () => {
    await act(async () => {
      renderer = create(createElement(PostComposer, { profile: profileA as never }));
    });
    await act(async () => targetProps?.onBodyChange('접수되지 않은 본문'));
    await act(async () => targetProps?.onSubmit());

    const call = mutationCalls[0];
    assert.ok(call);
    await act(async () =>
      call.onCompleted({ createPost: { post: null, request: null } }, [
        { message: 'request was rejected' },
      ]),
    );

    assert.equal(targetProps?.body, '접수되지 않은 본문');
    assert.deepEqual(analyticsEvents, []);
    assert.deepEqual(toastCalls, [
      ['게시 요청을 접수하지 못했어요. 내용을 확인하고 다시 시도해 주세요.', { tone: 'danger' }],
    ]);
  });
});

describe('PostComposer mention suggestions', () => {
  it('keeps the rendered editor mounted while searching and ignores late results from the previous author', async () => {
    await act(async () => {
      renderer = create(
        createElement(PostComposer, {
          onExpand: () => undefined,
          onRequestClose: () => undefined,
          presentation: 'rail',
          profile: profileA as never,
          profiles: candidates as never,
        }),
      );
    });

    const textInput = () => renderer?.root.findByType('TextInput' as never);
    const enterText = async (value: string, caret = value.length) => {
      const onChangeText = textInput()?.props.onChangeText as
        | ((nextValue: string) => void)
        | undefined;
      const onSelectionChange = textInput()?.props.onSelectionChange as
        | ((event: { nativeEvent: { selection: { end: number; start: number } } }) => void)
        | undefined;
      assert.ok(onChangeText);
      assert.ok(onSelectionChange);
      await act(async () => onChangeText(value));
      await act(async () =>
        onSelectionChange({ nativeEvent: { selection: { start: caret, end: caret } } }),
      );
    };
    const hasMessage = (message: string) =>
      renderer?.root
        .findAllByType('Text' as never)
        .some((node) => node.children.join('') === message) ?? false;
    const optionLabels = () =>
      renderer?.root
        .findAllByType('Pressable' as never)
        .map((node) => node.props.accessibilityLabel)
        .filter((label): label is string => typeof label === 'string') ?? [];

    assert.equal(requests.length, 0);
    await enterText('@');
    assert.equal(requests.length, 0);
    assert.equal(hasMessage('검색어를 입력하세요.'), true);
    assert.equal(textInputMountCount, 1);
    assert.equal(textInputUnmountCount, 0);

    await enterText('@ali suffix', 4);
    assert.equal(requests.length, 1);
    assert.equal(requests[0]?.name, 'PostComposerMentionSuggestionsQuery');
    assert.deepEqual(requests[0]?.variables, {
      actorProfileId: profileA.id,
      query: 'ali',
    });
    assert.equal(hasMessage('프로필을 검색하고 있어요.'), true);
    assert.equal(textInputMountCount, 1);
    assert.equal(textInputUnmountCount, 0);

    await enterText('@be');
    assert.equal(requests.length, 2);
    assert.equal(requests[0]?.disposed, true);
    assert.deepEqual(requests[1]?.variables, {
      actorProfileId: profileA.id,
      query: 'be',
    });
    assert.equal(hasMessage('프로필을 검색하고 있어요.'), true);
    assert.equal(textInputMountCount, 1);
    assert.equal(textInputUnmountCount, 0);

    const profileAlice: PostComposerMentionCandidate = {
      avatar: { url: 'https://example.com/alice.png' },
      displayName: '앨리스',
      id: 'profile-alice',
      relativeHandle: '@alice',
    };
    await act(async () => switcherProps?.onSelectProfile(profileB.id, profileB));
    assert.equal(requests.length, 3);
    assert.equal(requests[1]?.disposed, true);
    assert.deepEqual(requests[2]?.variables, {
      actorProfileId: profileB.id,
      query: 'be',
    });
    assert.equal(hasMessage('프로필을 검색하고 있어요.'), true);
    assert.deepEqual(optionLabels(), []);
    assert.equal(textInputMountCount, 1);
    assert.equal(textInputUnmountCount, 0);

    await act(async () => {
      requests[0]?.next({
        data: {
          searchProfiles: {
            edges: [
              {
                node: {
                  avatar: { id: 'avatar-alice', url: 'https://example.com/alice.png' },
                  displayName: profileAlice.displayName,
                  id: profileAlice.id,
                  relativeHandle: profileAlice.relativeHandle,
                },
              },
            ],
          },
        },
      });
      requests[0]?.complete();
    });
    assert.deepEqual(optionLabels(), []);

    await act(async () => {
      requests[1]?.next({
        data: {
          searchProfiles: {
            edges: [
              {
                node: {
                  avatar: { id: 'avatar-alice', url: 'https://example.com/alice.png' },
                  displayName: profileAlice.displayName,
                  id: profileAlice.id,
                  relativeHandle: profileAlice.relativeHandle,
                },
              },
            ],
          },
        },
      });
      requests[1]?.complete();
    });
    assert.deepEqual(optionLabels(), []);

    await act(async () => requests[2]?.error(new Error('network failure')));
    assert.equal(hasMessage('프로필을 검색하지 못했어요.'), true);
    assert.equal(optionLabels().includes('앨리스, @alice'), false);
    assert.equal(textInputMountCount, 1);
    assert.equal(textInputUnmountCount, 0);

    await act(async () => {
      renderer?.root
        .findByProps({ accessibilityRole: 'button' })
        .props.onPress({ nativeEvent: { target: 'retry' } });
    });
    assert.equal(requests.length, 4);
    assert.deepEqual(requests[3]?.variables, requests[2]?.variables);
    assert.equal(hasMessage('프로필을 검색하고 있어요.'), true);
    assert.equal(textInputMountCount, 1);
    assert.equal(textInputUnmountCount, 0);

    await act(async () => {
      requests[3]?.next({
        data: {
          searchProfiles: {
            edges: [
              {
                node: {
                  avatar: { id: 'avatar-beta', url: 'https://example.com/beta.png' },
                  displayName: '프로필 B',
                  id: 'profile-beta',
                  relativeHandle: '@beta',
                },
              },
            ],
          },
        },
      });
      requests[3]?.complete();
    });
    assert.deepEqual(optionLabels(), ['프로필 B, @beta']);
    await act(async () => {
      renderer?.root.findByProps({ accessibilityLabel: '프로필 B, @beta' }).props.onPress();
    });
    assert.equal(targetProps?.body, '@beta ');
    assert.equal(textInputMountCount, 1);
    assert.equal(textInputUnmountCount, 0);

    await enterText('@typed');
    await act(async () => targetProps?.onSubmit());
    assert.equal(mutationCalls.length, 1);
    assert.equal(mutationCalls[0]?.variables.input.bodyText, '@typed');
    assert.equal(mutationCalls[0]?.variables.input.mentions, undefined);
    assert.equal(textInputMountCount, 1);
    assert.equal(textInputUnmountCount, 0);
  });
});
