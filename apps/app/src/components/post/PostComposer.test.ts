import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { afterEach, before, beforeEach, describe, it, mock } from 'node:test';
import { createElement, useEffect, useState } from 'react';
import * as ReactRelay from 'react-relay';
import { act, create } from 'react-test-renderer';
import * as RelayRuntime from 'relay-runtime';
import { Environment, Network, Observable, RecordSource, Store } from 'relay-runtime';
import PostComposerMentionSuggestionsQueryNode from './__generated__/PostComposerMentionSuggestionsQuery.graphql';
import SubmitPostRequestMutation from './__generated__/PostComposerSubmitPostRequestMutation.graphql';
import type { ReactTestRenderer } from 'react-test-renderer';
import type { GraphQLResponse } from 'relay-runtime';
import type { PostComposerSubmitPostRequestMutation } from './__generated__/PostComposerSubmitPostRequestMutation.graphql';
import type { PostComposerController as PostComposerComponent } from './PostComposerController';
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
    return [{ altText: '대체 텍스트', applyNightshade: false, mediaId: 'media-1' }];
  },
  requirePostRequestMediaReselection: (mediaId: string) => reselectionMediaIds.push(mediaId),
  restorePostRequestMedia: () => undefined,
};
let mediaState: 'ready' | 'uploading' | 'failed' = 'ready';
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
    response: { submitPostRequest: { request: { requestId: string } | null } | null } | null,
    errors?: Array<{ extensions?: { code?: unknown; field?: unknown }; message: string }> | null,
  ) => void;
  onError: (error: Error) => void;
  variables: {
    connections: string[];
    input: Record<string, unknown>;
  };
}> = [];
let sessionAccountId: string | null = 'account-1';
let accountQueryCalls: Array<{ fetchPolicy: string }> = [];
const acceptedRequestResponse = (callIndex: number) => ({
  submitPostRequest: {
    request: {
      requestId: String(mutationCalls[callIndex]?.variables.input.requestId),
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
let toastCalls: Array<[string, { tone: string }]> = [];

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

mockModule('expo-crypto', { randomUUID });
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
  ScrollView: 'ScrollView',
  StyleSheet: { create: <T>(styles: T) => styles },
  Text: 'Text',
  View: 'View',
});
mockModule(require.resolve('lucide-react-native'), {
  AtSignIcon: 'AtSignIcon',
  GlobeIcon: 'GlobeIcon',
  LockIcon: 'LockIcon',
  MoonIcon: 'MoonIcon',
});
mockModule('react-relay', {
  ...ReactRelay,
  graphql: (parts: TemplateStringsArray) => {
    const operationName = parts.join('').match(/(?:query|fragment|mutation)\s+(\w+)/)?.[1];
    return operationName === 'PostComposerMentionSuggestionsQuery'
      ? PostComposerMentionSuggestionsQueryNode
      : {};
  },
  useFragment: (_fragment: unknown, key: typeof profileA) => key,
  useLazyLoadQuery: (_query: unknown, _variables: unknown, options: { fetchPolicy: string }) => {
    accountQueryCalls.push(options);
    return { me: { id: 'account-1' } };
  },
  useMutation: () => [
    (config: (typeof mutationCalls)[number]) => {
      mutationCalls.push(config);
    },
    false,
  ],
  useRelayEnvironment: () => relayEnvironment,
});
mockModule('relay-runtime', {
  ...RelayRuntime,
  ConnectionHandler: {
    getConnectionID: (
      accountId: string,
      key: string,
      filters: { profileId: string; statuses: unknown },
    ) => `${accountId}:${key}:${filters.profileId}:${filters.statuses === null ? 'all' : 'home'}`,
  },
  ROOT_ID: 'root',
});
mockModule('@/session/SessionProvider', {
  useSession: () => ({ accountId: sessionAccountId }),
});
mockModule('@/analytics/client', { trackAnalytics: () => undefined });
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
  borderWidths: { 1: 1 },
  fontFamilies: { ui: 'ui' },
  layoutRecipes: { labelSupportStack: {} },
  radii: { md: 12, sm: 8 },
  radius: { 12: 12 },
  space: { 4: 4, 8: 8, 12: 12 },
  spacing: { lg: 24, md: 16, sm: 8, xs: 4 },
  textStyles: { uiCopyM: {}, uiCopyS: {}, uiLabelM: {} },
  typography: { sm: {}, xsm: {} },
});
mockModule('./ComposerMediaEditor', { ComposerMediaEditor: 'ComposerMediaEditor' });
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
    restorePostRequestMedia: () => undefined,
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
  ({ PostComposerController: PostComposer } = await import('./PostComposerController'));
});

beforeEach(() => {
  mentionSearchEnabled = true;
  appStateListeners.clear();
  keyboardDismissCount = 0;
  requests = [];
  relayEnvironment = createRelayEnvironment();
  relayEnvironmentGeneration = null;
  sessionAccountId = 'account-1';
  accountQueryCalls = [];
  textInputMountCount = 0;
  textInputUnmountCount = 0;
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
  it('loads the Account owner when session context does not provide it for request connections', async () => {
    sessionAccountId = null;
    await act(async () => {
      renderer = create(createElement(PostComposer, { profile: profileA as never }));
    });
    await act(async () => targetProps?.onBodyChange('게시 요청'));
    await act(async () => targetProps?.onSubmit());

    assert.deepEqual(accountQueryCalls, [{ fetchPolicy: 'store-or-network' }]);
    assert.deepEqual(mutationCalls[0]?.variables.connections, [
      'account-1:PostRequestList_postRequests:profile-a:all',
      'account-1:PostRequestList_postRequests:profile-a:home',
    ]);
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
  it('inserts the acknowledged request with card preview data in both request connections', () => {
    const requestId = 'request-acknowledged';
    const requestNodeId = 'post-request-node';
    const connectionIds = ['request-connection-all', 'request-connection-home'];
    const source = new RecordSource();
    for (const connectionId of connectionIds) {
      source.set(connectionId, {
        __id: connectionId,
        __typename: 'PostRequestConnection',
        edges: { __refs: [] },
      });
    }
    const environment = new Environment({
      network: Network.create(() =>
        Observable.create<GraphQLResponse>((sink) => {
          sink.next({
            data: {
              submitPostRequest: {
                request: {
                  authorProfile: {
                    avatar: null,
                    displayName: '작성자',
                    handle: '@writer',
                    id: 'profile-a',
                    relativeHandle: '@writer',
                  },
                  draft: {
                    bodyText: '접수된 본문',
                    contentWarning: '접수된 경고',
                    media: [],
                    sensitiveMedia: true,
                  },
                  id: requestNodeId,
                  post: null,
                  requestId,
                  status: 'QUEUED',
                },
              },
            },
          });
          sink.complete();
        }),
      ),
      store: new Store(source),
    });
    let acknowledgedRequestId: string | undefined;

    ReactRelay.commitMutation<PostComposerSubmitPostRequestMutation>(environment, {
      mutation: SubmitPostRequestMutation,
      variables: {
        connections: connectionIds,
        input: {
          actorProfileId: 'profile-a',
          bodyText: '접수된 본문',
          contentWarning: '접수된 경고',
          media: [],
          requestId,
          sensitiveMedia: true,
          visibility: 'PUBLIC',
        },
      },
      onCompleted: (response) => {
        acknowledgedRequestId = response.submitPostRequest?.request?.requestId;
      },
    });

    const normalizedSource = environment.getStore().getSource();
    assert.equal(acknowledgedRequestId, requestId);
    for (const connectionId of connectionIds) {
      const edges = normalizedSource.get(connectionId)?.edges?.__refs ?? [];
      assert.equal(edges.length, 1);
      assert.equal(normalizedSource.get(edges[0]!)?.node?.__ref, requestNodeId);
    }

    const draftId = normalizedSource.get(requestNodeId)?.draft?.__ref;
    assert.ok(draftId);
    assert.equal(normalizedSource.get(draftId)?.bodyText, '접수된 본문');
    assert.equal(normalizedSource.get(draftId)?.contentWarning, '접수된 경고');
    assert.equal(normalizedSource.get(draftId)?.sensitiveMedia, true);
  });
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
  it('preserves the draft while switching author, sends the local id, isolates home, and unlocks failed media', async () => {
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
    assert.equal(mutationCalls.length, 1);
    assert.deepEqual(mutationCalls[0]?.variables.connections, [
      'account-1:PostRequestList_postRequests:profile-b:all',
      'account-1:PostRequestList_postRequests:profile-b:home',
    ]);
    const { requestId, ...submittedInput } = mutationCalls[0]!.variables.input;
    assert.equal(typeof requestId, 'string');
    assert.deepEqual(submittedInput, {
      bodyText: '보존할 본문',
      contentWarning: '보존할 CW',
      media: mediaValue.getPostRequestMedia(),
      actorProfileId: profileB.id,
      sensitiveMedia: true,
      visibility: 'DIRECT',
    });

    await act(async () => mutationCalls[0]?.onError(new Error('실패')));
    assert.equal(toastCalls.length, 0);
    assert.ok(
      renderer?.root
        .findAllByType('Button' as never)
        .some((button) => button.props.children === '접수 다시 확인'),
    );
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
    assert.deepEqual(mutationCalls[0]?.variables.input, {
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

    assert.deepEqual(mutationCalls[0]?.variables.input, {
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

  it('keeps the original actor, request ID, and connections when retrying after an unknown outcome', async () => {
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
    await act(async () => targetProps?.onBodyChange('첫 글'));
    await act(async () => targetProps?.onSubmit());
    const originalSubmission = mutationCalls[0]?.variables;
    assert.equal(originalSubmission?.input.actorProfileId, profileA.id);
    assert.deepEqual(originalSubmission?.connections, [
      'account-1:PostRequestList_postRequests:profile-a:all',
      'account-1:PostRequestList_postRequests:profile-a:home',
    ]);
    await act(async () => mutationCalls[0]?.onError(new Error('실패')));
    assert.equal(reselectionMediaIds.length, 0);
    assert.ok(
      renderer?.root
        .findAllByType('Button' as never)
        .some((button) => button.props.children === '접수 다시 확인'),
    );

    await act(async () => {
      renderer?.update(
        createElement(PostComposer, {
          onExpand: () => undefined,
          onRequestClose: () => undefined,
          presentation: 'rail',
          profile: profileB as never,
          profiles: candidates as never,
        }),
      );
    });
    const retry = renderer?.root
      .findAllByType('Button' as never)
      .find((button) => button.props.children === '접수 다시 확인');
    assert.ok(retry);
    await act(async () => retry.props.onPress());
    assert.deepEqual(mutationCalls[1]?.variables, originalSubmission);
    assert.equal(mutationCalls[1]?.variables.input.requestId, originalSubmission?.input.requestId);

    const retryRequestId = String(originalSubmission?.input.requestId);
    await act(async () =>
      mutationCalls[1]?.onCompleted(
        { submitPostRequest: { request: { requestId: retryRequestId } } },
        [{ message: 'ignored field error', extensions: { code: 'VALIDATION', field: 'mentions' } }],
      ),
    );
    assert.deepEqual(toastCalls.at(-1), ['게시 요청을 접수했어요', { tone: 'success' }]);
    assert.equal(
      renderer?.root.findByType('PostComposerTarget' as never).props.visibility,
      'PUBLIC',
    );

    await act(async () => targetProps?.onBodyChange('다음 글'));
    await act(async () => targetProps?.onSubmit());
    assert.equal(mutationCalls[2]?.variables.input.actorProfileId, profileB.id);
    assert.equal(mutationCalls[2]?.variables.input.visibility, 'PUBLIC');
    assert.deepEqual(mutationCalls[2]?.variables.connections, [
      'account-1:PostRequestList_postRequests:profile-b:all',
      'account-1:PostRequestList_postRequests:profile-b:home',
    ]);
  });

  it('blocks an uncertain request recheck under another account and allows it after switching back', async () => {
    let currentRetry: (() => void) | undefined;
    let acceptedCount = 0;
    const props = {
      onPostRequestAccepted: () => acceptedCount++,
      onPostRequestUncertainChange: (uncertain: boolean, retry?: () => void) => {
        currentRetry = uncertain ? retry : undefined;
      },
      onRequestClose: () => undefined,
      presentation: 'overlay' as const,
      profile: profileA as never,
    };

    await act(async () => {
      renderer = create(createElement(PostComposer, props));
    });
    await act(async () => targetProps?.onBodyChange('계정 A에 남겨 둘 본문'));
    await act(async () => targetProps?.onSubmit());
    const originalSubmission = mutationCalls[0]?.variables;
    assert.ok(originalSubmission);
    await act(async () => mutationCalls[0]?.onError(new Error('결과 확인 불가')));

    const staleRetry = currentRetry;
    assert.ok(staleRetry);
    const retryButton = () =>
      renderer?.root
        .findAllByType('Button' as never)
        .find((button) => button.props.children === '접수 다시 확인');
    assert.equal(retryButton()?.props.disabled, false);

    sessionAccountId = 'account-2';
    await act(async () => {
      renderer?.update(createElement(PostComposer, props));
    });

    assert.equal(retryButton()?.props.disabled, true);
    assert.equal(currentRetry, undefined);
    assert.ok(
      renderer?.root
        .findAllByType('Text' as never)
        .some((text) => text.props.children === '요청을 제출한 계정으로 전환해 주세요.'),
    );
    assert.ok(
      renderer?.root
        .findAllByType('View' as never)
        .some((view) => view.props.accessibilityElementsHidden && view.props['aria-hidden']),
    );

    await act(async () => staleRetry?.());
    await act(async () => retryButton()?.props.onPress());
    assert.equal(mutationCalls.length, 1);

    sessionAccountId = 'account-1';
    await act(async () => {
      renderer?.update(createElement(PostComposer, props));
    });

    assert.equal(retryButton()?.props.disabled, false);
    assert.ok(currentRetry);
    await act(async () => currentRetry?.());
    assert.deepEqual(mutationCalls[1]?.variables, originalSubmission);
    assert.equal(mutationCalls[1]?.variables.input.requestId, originalSubmission.input.requestId);

    sessionAccountId = 'account-2';
    await act(async () => {
      renderer?.update(createElement(PostComposer, props));
    });
    await act(async () =>
      mutationCalls[1]?.onCompleted({
        submitPostRequest: { request: { requestId: originalSubmission.input.requestId } },
      }),
    );
    assert.equal(acceptedCount, 0);
    assert.equal(retryButton()?.props.disabled, true);
    assert.equal(currentRetry, undefined);

    sessionAccountId = 'account-1';
    await act(async () => {
      renderer?.update(createElement(PostComposer, props));
    });
    assert.equal(retryButton()?.props.disabled, false);
    assert.ok(currentRetry);
    await act(async () => currentRetry?.());
    assert.deepEqual(mutationCalls[2]?.variables, originalSubmission);
    await act(async () =>
      mutationCalls[2]?.onCompleted({
        submitPostRequest: { request: { requestId: originalSubmission.input.requestId } },
      }),
    );
    assert.equal(acceptedCount, 1);
  });

  it('marks a remounted request uncertain and ignores its stale actor response before rechecking', async () => {
    let retryUncertainRequest: (() => void) | undefined;
    let acceptedCount = 0;
    relayEnvironmentGeneration = { current: 0 };
    const props = {
      onPostRequestAccepted: () => acceptedCount++,
      onPostRequestUncertainChange: (uncertain: boolean, retry?: () => void) => {
        if (uncertain) {
          retryUncertainRequest = retry;
        }
      },
      onRequestClose: () => undefined,
      presentation: 'overlay' as const,
      profile: profileA as never,
    };

    await act(async () => {
      renderer = create(createElement(PostComposer, props));
    });
    await act(async () => targetProps?.onBodyChange('첫 글'));
    await act(async () => targetProps?.onSubmit());
    const originalSubmission = mutationCalls[0]?.variables;
    assert.ok(originalSubmission);

    await act(async () => {
      relayEnvironment = createRelayEnvironment();
      relayEnvironmentGeneration!.current += 1;
      renderer?.update(createElement(PostComposer, { ...props, profile: profileB as never }));
    });

    assert.ok(retryUncertainRequest);
    await act(async () =>
      mutationCalls[0]?.onCompleted({
        submitPostRequest: {
          request: { requestId: String(originalSubmission.input.requestId) },
        },
      }),
    );
    assert.equal(acceptedCount, 0);
    assert.ok(
      renderer?.root
        .findAllByType('Button' as never)
        .some((button) => button.props.children === '접수 다시 확인'),
    );

    await act(async () => retryUncertainRequest?.());
    assert.deepEqual(mutationCalls[1]?.variables, originalSubmission);
    assert.equal(mutationCalls[1]?.variables.input.actorProfileId, profileA.id);
    assert.equal(mutationCalls[1]?.variables.input.requestId, originalSubmission.input.requestId);
    assert.deepEqual(mutationCalls[1]?.variables.connections, [
      'account-1:PostRequestList_postRequests:profile-a:all',
      'account-1:PostRequestList_postRequests:profile-a:home',
    ]);

    await act(async () =>
      mutationCalls[1]?.onCompleted({
        submitPostRequest: {
          request: { requestId: String(originalSubmission.input.requestId) },
        },
      }),
    );
    assert.equal(acceptedCount, 1);
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
