import assert from 'node:assert/strict';
import { afterEach, before, describe, it, mock } from 'node:test';
import { createElement } from 'react';
import { act, create } from 'react-test-renderer';
import type { ReactNode } from 'react';
import type { ReactTestRenderer } from 'react-test-renderer';
import type { SettingsMutedProfiles as SettingsMutedProfilesExport } from './SettingsMutedProfiles';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const focus = mock.fn();
let profiles = [{ id: 'target-a', displayName: '별마루', relativeHandle: '@star' }];

const mockModule = (specifier: string | URL, exports: object) =>
  mock.module(specifier, { exports } as unknown as Parameters<typeof mock.module>[1]);

mockModule('react-native', {
  Platform: {
    OS: 'web',
  },
  StyleSheet: { create: <T>(styles: T) => styles },
  View: 'View',
});
mockModule('react-relay', {
  graphql: (parts: TemplateStringsArray) => parts.join(''),
  useLazyLoadQuery: () => ({
    currentSession: { selectedProfile: { id: 'owner-a', instance: { kind: 'LOCAL' } } },
  }),
  usePaginationFragment: () => ({
    data: {
      profileMutes: {
        edges: profiles.map((profile) => ({
          node: { id: `mute-${profile.id}`, targetProfile: profile },
        })),
      },
    },
    hasNext: false,
    isLoadingNext: false,
    loadNext: () => undefined,
  }),
});
mockModule(new URL('../profile/MutedProfileList.tsx', import.meta.url), {
  MutedProfileList: (props: object) => createElement('MutedProfileList', props),
});
mockModule(new URL('../profile/ProfileMuteAction.tsx', import.meta.url), {
  ProfileMuteAction: (props: object) => createElement('ProfileMuteAction', props),
});
mockModule(new URL('../profile/ProfileMuteController.tsx', import.meta.url), {
  useProfileMuteMutations: () => ({ changeMuted: async () => undefined }),
});
mockModule(new URL('../RouteBoundary.tsx', import.meta.url), {
  RouteBoundary: ({ children }: { children?: ReactNode }) => children,
  useRouteBoundary: () => ({ fetchKey: 0 }),
});
mockModule(new URL('../shell/ShellChromeContext.tsx', import.meta.url), {
  useShellChrome: () => null,
});
mockModule(new URL('../ui/StateView.tsx', import.meta.url), {
  StateView: (props: object) => createElement('StateView', props),
});

let SettingsMutedProfiles: typeof SettingsMutedProfilesExport;
let renderer: ReactTestRenderer | null = null;

before(async () => {
  ({ SettingsMutedProfiles } = await import('./SettingsMutedProfiles'));
});

afterEach(async () => {
  profiles = [{ id: 'target-a', displayName: '별마루', relativeHandle: '@star' }];
  focus.mock.resetCalls();
  if (renderer) {
    await act(async () => renderer?.unmount());
    renderer = null;
  }
});

describe('뮤트한 프로필 설정 화면', () => {
  it('뮤트 해제 성공으로 행이 사라진 뒤 semantic heading에 포커스를 옮긴다', async () => {
    const headingRef = { current: { focus } } as never;
    await act(async () => {
      renderer = create(createElement(SettingsMutedProfiles, { headingRef }));
    });

    const activeRenderer = renderer;
    assert.ok(activeRenderer);
    const list = activeRenderer.root.find((node) => (node.type as unknown) === 'MutedProfileList');
    const state = list.props.state as {
      profiles: Array<{
        action: { props: { onFeedback?: (feedback: object) => void } };
      }>;
    };
    await act(async () => {
      state.profiles[0]?.action.props.onFeedback?.({
        muted: false,
        profileId: 'target-a',
        status: 'success',
      });
    });
    assert.equal(focus.mock.callCount(), 0);

    profiles = [];
    await act(async () => renderer?.update(createElement(SettingsMutedProfiles, { headingRef })));

    assert.equal(focus.mock.callCount(), 1);
    assert.equal(
      renderer?.root.findAllByProps({ accessibilityLabel: '뮤트한 프로필 목록' }).length,
      0,
    );
  });
});
