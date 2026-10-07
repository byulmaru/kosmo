import assert from 'node:assert/strict';
import { afterEach, before, beforeEach, describe, it, mock } from 'node:test';
import { createElement, useEffect, useState } from 'react';
import * as ReactRelay from 'react-relay';
import { act, create } from 'react-test-renderer';
import * as RelayRuntime from 'relay-runtime';
import { Environment, Network, Observable, RecordSource, Store } from 'relay-runtime';
import PostComposerMentionSuggestionsQueryNode from './__generated__/PostComposerMentionSuggestionsQuery.graphql';
import type { ReactTestRenderer } from 'react-test-renderer';
import type { GraphQLResponse } from 'relay-runtime';
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
Object.assign(platform, {
  select: <T>(values: { default?: T; web?: T }) => values.web ?? values.default,
});
const mediaValue = {
  hasPendingMedia: false,
  items: [{ altText: '대체 텍스트', mediaId: 'media-1' }],
  sensitiveMedia: true,
};
let mediaState: 'ready' | 'uploading' | 'failed' = 'ready';
let mentionSearchFlagEnabled = true;
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
      mentionSearchEnabled: boolean;
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
      onVisibilityChange: (value: 'FOLLOWERS' | 'PUBLIC' | 'UNLISTED') => void;
      selection: { end: number; start: number };
      submitting?: boolean;
    }
  | undefined;
let mutationCalls: Array<{
  onCompleted: (response: { createPost: { post: { id: string } } }) => void;
  onError: (error: Error) => void;
  variables: {
    connections: string[];
    input: Record<string, unknown>;
  };
}> = [];
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
let textInputMountCount = 0;
let textInputUnmountCount = 0;
let PostComposerMentionInput: typeof PostComposerMentionInputComponent;

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

mockModule('react-native', {
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
  useMutation: () => [
    (config: (typeof mutationCalls)[number]) => {
      mutationCalls.push(config);
    },
  ],
  useRelayEnvironment: () => relayEnvironment,
});
mockModule('relay-runtime', {
  ...RelayRuntime,
  ConnectionHandler: { getConnectionID: () => 'home-connection' },
  ROOT_ID: 'root',
});
mockModule('@/analytics/client', { trackAnalytics: () => undefined });
mockModule('@/components/FeatureFlagsContext', {
  useFeatureFlag: (key: string) =>
    key === 'post-composer-mention-search' && mentionSearchFlagEnabled,
});
mockModule('@/components/profile/ProfileNameBlock', {
  ProfileNameBlock: () => createElement('ProfileNameBlock'),
});
mockModule('@/components/profile/ProfilePicker', { ProfilePicker: 'ProfilePicker' });
mockModule('@/components/ui/Avatar', { Avatar: 'Avatar' });
mockModule('@/components/ui/Button', { Button: 'Button' });
mockModule('@/components/ui/Form', { Form: 'Form' });
mockModule('@/components/ui/ToastProvider', { useToast: () => ({ showToast: () => undefined }) });
mockModule('@/components/ui/TextField', { TextArea: 'TextArea', TextField: 'TextField' });
mockModule('@/relay/RelayEnvironmentBoundary', { useRelayEnvironmentGeneration: () => null });
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
  emptyPostComposerMediaValue: { hasPendingMedia: false, items: [], sensitiveMedia: false },
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
            mentionSearchEnabled: props?.mentionSearchEnabled,
            mentionCandidates: props?.mentionCandidates,
            mentionSearchState: props?.mentionSearchState,
            onBodyChange: props?.onBodyChange ?? (() => undefined),
            onRetryMentionSearch: props?.onRetryMentionSearch,
            onSelectionChange: props?.onSelectionChange ?? (() => undefined),
            onSelectMention: props?.onSelectMention ?? (() => undefined),
            renderInput: ({ webProps, ...inputProps }) =>
              createElement(TrackedTextInput, { ...inputProps, ...webProps }),
            selection: props?.selection ?? { end: 0, start: 0 },
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
  mentionSearchFlagEnabled = true;
  requests = [];
  relayEnvironment = createRelayEnvironment();
  textInputMountCount = 0;
  textInputUnmountCount = 0;
});

afterEach(async () => {
  if (renderer) {
    await act(async () => renderer?.unmount());
    renderer = null;
  }
  platform.OS = 'web';
  mediaState = 'ready';
  refreshMedia = undefined;
  switcherProps = undefined;
  targetProps = undefined;
  mutationCalls = [];
  mock.restoreAll();
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
    await act(async () => targetProps?.onVisibilityChange('FOLLOWERS'));

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
      'FOLLOWERS',
    );

    await act(async () => targetProps?.onSubmit());
    assert.equal(mutationCalls.length, 1);
    assert.deepEqual(mutationCalls[0]?.variables, {
      connections: [],
      input: {
        bodyText: '보존할 본문',
        contentWarning: '보존할 CW',
        media: mediaValue.items,
        actorProfileId: profileB.id,
        sensitiveMedia: true,
        visibility: 'FOLLOWERS',
      },
      prependToHome: false,
    });

    await act(async () => mutationCalls[0]?.onError(new Error('실패')));
    assert.equal(targetProps?.body, '보존할 본문');
    assert.equal(targetProps?.contentWarning, '보존할 CW');
    assert.equal(
      renderer?.root.findByType('PostComposerTarget' as never).props.visibility,
      'FOLLOWERS',
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

    await act(async () => targetProps?.onSubmit());
    assert.equal(mutationCalls.length, 1);
    assert.deepEqual(mutationCalls[0]?.variables.input, {
      actorProfileId: profileB.id,
      bodyText: '😀 @alice',
      media: mediaValue.items,
      mentions: [{ profileId: 'profile-alice', start: 3, end: 9 }],
      sensitiveMedia: true,
      visibility: 'UNLISTED',
    });
  });

  it('restores the original author only after a successful post', async () => {
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
    await act(async () => switcherProps?.onSelectProfile(profileB.id, profileB));
    await act(async () => targetProps?.onBodyChange('첫 글'));
    await act(async () => targetProps?.onSubmit());
    await act(async () => mutationCalls[0]?.onError(new Error('실패')));
    assert.equal(switcherProps?.selectedProfileId, profileB.id);

    await act(async () => targetProps?.onSubmit());
    await act(async () =>
      mutationCalls[1]?.onCompleted({ createPost: { post: { id: 'post-1' } } }),
    );
    assert.equal(switcherProps?.selectedProfileId, profileA.id);
    assert.equal(
      renderer?.root.findByType('PostComposerTarget' as never).props.visibility,
      'UNLISTED',
    );

    await act(async () => targetProps?.onBodyChange('다음 글'));
    await act(async () => targetProps?.onSubmit());
    assert.equal(mutationCalls[2]?.variables.input.actorProfileId, undefined);
    assert.equal(mutationCalls[2]?.variables.input.visibility, 'UNLISTED');
  });
});

describe('PostComposer mention suggestions', () => {
  it('keeps plain-text editing and submission available when search is disabled', async () => {
    mentionSearchFlagEnabled = false;
    await act(async () => {
      renderer = create(
        createElement(PostComposer, {
          onExpand: () => undefined,
          onRequestClose: () => undefined,
          presentation: 'rail',
          profile: profileA as never,
        }),
      );
    });

    assert.equal(targetProps?.mentionSearchEnabled, false);
    const textInput = renderer?.root.findByType('TextInput' as never);
    assert.ok(textInput);
    await act(async () => textInput.props.onChangeText('@typed'));

    assert.equal(requests.length, 0);
    assert.equal(textInputMountCount, 1);
    assert.equal(textInputUnmountCount, 0);
    assert.equal(
      renderer?.root
        .findAllByType('Text' as never)
        .some((node) => node.children.join('') === '검색어를 입력하세요.'),
      false,
    );
    assert.equal(Object.hasOwn(textInput.props, 'aria-autocomplete'), false);

    await act(async () => targetProps?.onSubmit());
    assert.equal(mutationCalls.length, 1);
    assert.equal(mutationCalls[0]?.variables.input.bodyText, '@typed');
    assert.equal(mutationCalls[0]?.variables.input.mentions, undefined);
  });

  it('preserves a selected mention range when the search flag turns off', async () => {
    await act(async () => {
      renderer = create(
        createElement(PostComposer, {
          onExpand: () => undefined,
          onRequestClose: () => undefined,
          presentation: 'rail',
          profile: profileA as never,
        }),
      );
    });

    await act(async () => targetProps?.onBodyChange('@ali'));
    assert.equal(requests.length, 1);
    await act(async () => {
      requests[0]?.next({
        data: {
          searchProfiles: {
            edges: [
              {
                node: {
                  avatar: { id: 'avatar-alice', url: 'https://example.com/alice.png' },
                  displayName: '앨리스',
                  id: 'profile-alice',
                  relativeHandle: '@alice',
                },
              },
            ],
          },
        },
      });
      requests[0]?.complete();
    });
    await act(async () => {
      renderer?.root.findByProps({ accessibilityLabel: '앨리스, @alice' }).props.onPress();
    });
    assert.equal(targetProps?.body, '@alice ');

    mentionSearchFlagEnabled = false;
    await act(async () => {
      renderer?.update(
        createElement(PostComposer, {
          onExpand: () => undefined,
          onRequestClose: () => undefined,
          presentation: 'rail',
          profile: profileA as never,
        }),
      );
    });

    assert.equal(targetProps?.mentionSearchEnabled, false);
    assert.equal(targetProps?.body, '@alice ');
    assert.equal(requests.length, 1);
    assert.equal(textInputMountCount, 1);
    assert.equal(textInputUnmountCount, 0);

    await act(async () => targetProps?.onSubmit());
    assert.deepEqual(mutationCalls[0]?.variables.input, {
      bodyText: '@alice',
      media: mediaValue.items,
      mentions: [{ profileId: 'profile-alice', start: 0, end: 6 }],
      sensitiveMedia: true,
      visibility: 'UNLISTED',
    });
  });

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
    const enterText = async (value: string) => {
      const onChangeText = textInput()?.props.onChangeText as
        | ((nextValue: string) => void)
        | undefined;
      assert.ok(onChangeText);
      await act(async () => onChangeText(value));
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

    await enterText('@ali');
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
