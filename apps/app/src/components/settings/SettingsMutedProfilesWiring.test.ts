import assert from 'node:assert/strict';
import { afterEach, before, describe, it, mock } from 'node:test';
import { createElement } from 'react';
import { act, create } from 'react-test-renderer';
import type { ComponentType, ReactElement } from 'react';
import type { ReactTestRenderer } from 'react-test-renderer';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const targetProfile = {
  avatar: null,
  displayName: '코스모 작가',
  id: 'profile:target',
  relativeHandle: '@target',
  viewerState: { profileMute: { id: 'profile-mute:1' } },
};
const selectedProfile = {
  id: 'profile:viewer',
  instance: { kind: 'LOCAL' },
  profileMutes: {
    edges: [{ cursor: 'cursor:1', node: { id: 'profile-mute:1', targetProfile } }],
  },
};
const capturedList = { value: null as Record<string, unknown> | null };
const ProfileMuteAction = (props: Record<string, unknown>) =>
  createElement('ProfileMuteAction', props);
let SettingsMutedProfiles: ComponentType;
let renderer: ReactTestRenderer | null = null;

mock.module('react-relay', {
  exports: {
    graphql: (parts: TemplateStringsArray) => parts.join(''),
    useLazyLoadQuery: () => ({ currentSession: { selectedProfile } }),
    usePaginationFragment: () => ({
      data: selectedProfile,
      hasNext: false,
      isLoadingNext: false,
      loadNext: () => undefined,
    }),
  },
} as unknown as Parameters<typeof mock.module>[1]);
mock.module('@/components/profile/ProfileMuteAction', {
  exports: { ProfileMuteAction },
} as unknown as Parameters<typeof mock.module>[1]);
mock.module('@/components/profile/ProfileMuteController', {
  exports: {
    useProfileMuteMutations: () => {
      throw new Error('SettingsMutedProfiles must not own the profile mute mutation.');
    },
  },
} as unknown as Parameters<typeof mock.module>[1]);
mock.module('@/components/profile/MutedProfileList', {
  exports: {
    MutedProfileList: (props: Record<string, unknown>) => {
      capturedList.value = props;
      return createElement('MutedProfileList', props);
    },
  },
} as unknown as Parameters<typeof mock.module>[1]);
mock.module('@/components/RouteBoundary', {
  exports: {
    RouteBoundary: ({ children }: { children: unknown }) => children,
    useRouteBoundary: () => ({ fetchKey: 0 }),
  },
} as unknown as Parameters<typeof mock.module>[1]);
mock.module('@/components/shell/ShellChromeContext', {
  exports: { useShellChrome: () => null },
} as unknown as Parameters<typeof mock.module>[1]);
mock.module('@/components/ui/StateView', {
  exports: { StateView: () => createElement('StateView') },
} as unknown as Parameters<typeof mock.module>[1]);

before(async () => {
  ({ SettingsMutedProfiles } = await import('./SettingsMutedProfiles'));
});

describe('SettingsMutedProfiles mute wiring', () => {
  it('관리 행의 target Profile fragment를 mute action에 위임한다', async () => {
    capturedList.value = null;

    await act(async () => {
      renderer = create(createElement(SettingsMutedProfiles));
    });

    const list = capturedList.value as null | {
      state: {
        profiles: Array<{
          action: ReactElement<{ profile: unknown; surface: string }>;
          id: string;
        }>;
      };
    };
    assert.ok(list);
    const { state } = list;
    assert.equal(state.profiles[0]?.id, targetProfile.id);
    assert.equal(state.profiles[0]?.action.type, ProfileMuteAction);
    assert.equal(state.profiles[0]?.action.props.profile, targetProfile);
    assert.equal(state.profiles[0]?.action.props.surface, 'button');
  });
});

afterEach(async () => {
  if (renderer) {
    await act(async () => renderer?.unmount());
    renderer = null;
  }
});
