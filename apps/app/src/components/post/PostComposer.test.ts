import assert from 'node:assert/strict';
import { afterEach, before, describe, it, mock } from 'node:test';
import { createElement, useEffect, useState } from 'react';
import { act, create } from 'react-test-renderer';
import type { ReactTestRenderer } from 'react-test-renderer';
import type { PostComposer as PostComposerComponent } from './PostComposer';

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
let refreshMedia: (() => void) | undefined;
let switcherProps:
  | {
      disabled?: boolean;
      onSelectProfile: (id: string) => void | Promise<void>;
      profiles: readonly { id: string }[];
      selectedProfileId: string;
    }
  | undefined;
let targetProps:
  | {
      body: string;
      contentWarning: string;
      onBodyChange: (value: string) => void;
      onContentWarningChange: (value: string) => void;
      onSubmit: () => void;
      onVisibilityChange: (value: 'FOLLOWERS' | 'PUBLIC' | 'UNLISTED') => void;
    }
  | undefined;
let mutationCalls: Array<{
  onError: (error: Error) => void;
  variables: {
    connections: string[];
    input: Record<string, unknown>;
  };
}> = [];
let renderer: ReactTestRenderer | null = null;

const profileA = {
  avatar: { id: 'avatar-a', url: 'https://example.com/a.png' },
  displayName: '프로필 A',
  handle: 'profile-a',
  id: 'profile-a',
  private: { defaultPostVisibility: 'UNLISTED' },
};
const profileB = {
  avatar: { id: 'avatar-b', url: 'https://example.com/b.png' },
  displayName: '프로필 B',
  handle: 'profile-b',
  id: 'profile-b',
  private: { defaultPostVisibility: 'PUBLIC' },
};
const candidates = [
  {
    id: profileA.id,
    pickerProfile: { ...profileA, relativeHandle: '@profile-a' },
    profileKey: profileA,
  },
  {
    id: profileB.id,
    pickerProfile: { ...profileB, relativeHandle: '@profile-b' },
    profileKey: profileB,
  },
];

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
const relayEnvironment = {};
mockModule('react-relay', {
  graphql: () => ({}),
  useFragment: (_fragment: unknown, key: typeof profileA) => key,
  useMutation: () => [
    (config: (typeof mutationCalls)[number]) => {
      mutationCalls.push(config);
    },
  ],
  useRelayEnvironment: () => relayEnvironment,
});
mockModule('relay-runtime', {
  ConnectionHandler: { getConnectionID: () => 'home-connection' },
  ROOT_ID: 'root',
});
mockModule('@/analytics/client', { trackAnalytics: () => undefined });
mockModule('@/components/profile/ProfileNameBlock', {
  ProfileNameBlock: () => createElement('ProfileNameBlock'),
});
mockModule('@/components/profile/ProfilePicker', { ProfilePicker: 'ProfilePicker' });
mockModule('@/components/ui/Avatar', { Avatar: 'Avatar' });
mockModule('@/components/ui/Button', { Button: 'Button' });
mockModule('@/components/ui/Form', { Form: 'Form' });
mockModule('@/components/ui/TextField', { TextArea: 'TextArea', TextField: 'TextField' });
mockModule('@/relay/RelayEnvironmentBoundary', { useRelayEnvironmentGeneration: () => null });
mockModule('@/theme/ThemeProvider', {
  useElevation: () => ({ floating: {}, overlay: {} }),
  useTheme: () => ({
    border: '#ddd',
    card: '#fff',
    danger: '#c00',
    overlayScrim: '#000',
    surface: '#eee',
    text: '#111',
    textSecondary: '#666',
  }),
});
mockModule('@/theme/tokens', {
  fontFamilies: { ui: 'ui' },
  layoutRecipes: { labelSupportStack: {} },
  radii: { md: 12, sm: 8 },
  spacing: { lg: 24, md: 16, sm: 8, xs: 4 },
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
mockModule('./PostComposerTarget', {
  MobileFullscreenComposerShellCandidate: 'MobileFullscreenComposerShellCandidate',
  PostComposerTarget: (props: typeof targetProps) => {
    targetProps = props;
    return createElement(
      'PostComposerTarget',
      props,
      (props as unknown as { author: unknown }).author as never,
    );
  },
});

let PostComposer: typeof PostComposerComponent;

before(async () => {
  ({ PostComposer } = await import('./PostComposer'));
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

    await act(async () => switcherProps?.onSelectProfile(profileB.id));
    assert.equal(switcherProps?.selectedProfileId, profileB.id);
    await act(async () => {
      renderer?.update(
        createElement(PostComposer, {
          onExpand: () => undefined,
          onRequestClose: () => undefined,
          presentation: 'rail',
          profile: profileA as never,
          profiles: [candidates[0]] as never,
        }),
      );
    });
    assert.ok(switcherProps?.profiles.some((candidate) => candidate.id === profileB.id));
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
        profileId: profileB.id,
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
});
