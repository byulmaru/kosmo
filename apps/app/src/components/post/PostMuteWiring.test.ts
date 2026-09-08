import assert from 'node:assert/strict';
import { afterEach, before, describe, it, mock } from 'node:test';
import { createElement } from 'react';
import { act, create } from 'react-test-renderer';
import type { ComponentType } from 'react';
import type { ReactTestRenderer } from 'react-test-renderer';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

type Target = {
  id: string;
  profile: {
    displayName: string;
    id: string;
    relativeHandle: string;
    viewerState: { profileMute: { id: string } | null };
  };
  visibility: 'PUBLIC';
  actionBar: object;
  reactionController: object;
};

type MuteProps = {
  displayName: string;
  muted: boolean;
  onChangeMuted: (muted: boolean) => Promise<void>;
  profileId: string;
};

const target: Target = {
  actionBar: {},
  id: 'post:1',
  profile: {
    displayName: '코스모 작가',
    id: 'profile:author',
    relativeHandle: '@author',
    viewerState: { profileMute: { id: 'profile-mute:1' } },
  },
  reactionController: {},
  visibility: 'PUBLIC',
};
const changeCalls: Array<
  [
    {
      ownerProfileId: string;
      profileMuteId?: string | null;
      targetProfileId: string;
    },
    boolean,
  ]
> = [];
const changeMuted = (
  change: {
    ownerProfileId: string;
    profileMuteId?: string | null;
    targetProfileId: string;
  },
  nextMuted: boolean,
) => {
  changeCalls.push([change, nextMuted]);
  return Promise.resolve();
};
const capturedMute = { value: null as MuteProps | null };
let PostActionSurface: ComponentType<{ socialActionTarget: never }>;
let renderer: ReactTestRenderer | null = null;

mock.module('react-relay', {
  exports: {
    graphql: (parts: TemplateStringsArray) => parts.join(''),
    useFragment: (_fragment: unknown, key: unknown) => key,
  },
} as unknown as Parameters<typeof mock.module>[1]);
mock.module('react-native', {
  exports: { View: (props: Record<string, unknown>) => createElement('View', props) },
} as unknown as Parameters<typeof mock.module>[1]);
mock.module('@/components/profile/ProfileMuteController', {
  exports: { useProfileMuteMutations: () => ({ changeMuted }) },
} as unknown as Parameters<typeof mock.module>[1]);
mock.module('@/session/SessionProvider', {
  exports: { useSession: () => ({ selectedProfileId: 'profile:viewer' }) },
} as unknown as Parameters<typeof mock.module>[1]);
mock.module('./PostActionAuthentication', {
  exports: {
    usePostActionAuthentication: () => ({
      execution: { kind: 'enabled' },
      resolve: () => undefined,
      selectedProfileId: 'profile:viewer',
    }),
  },
} as unknown as Parameters<typeof mock.module>[1]);
mock.module('./PostActionBar', {
  exports: {
    PostActionBar: () => createElement('PostActionBar'),
  },
} as unknown as Parameters<typeof mock.module>[1]);
mock.module('./PostBookmarkAction', {
  exports: { useBookmarkFailureToast: () => () => undefined },
} as unknown as Parameters<typeof mock.module>[1]);
mock.module('./PostMoreMenu', {
  exports: { usePostMoreMenuItem: () => ({ key: 'copy-link', label: '링크 복사' }) },
} as unknown as Parameters<typeof mock.module>[1]);
mock.module('./PostReactionController', {
  exports: { usePostReactionController: () => ({}) },
} as unknown as Parameters<typeof mock.module>[1]);
mock.module('./useRepostFailureToast', {
  exports: { useRepostFailureToast: () => () => undefined },
} as unknown as Parameters<typeof mock.module>[1]);
mock.module('@/components/reaction/PostReactionSummary', {
  exports: { PostReactionSummary: () => createElement('PostReactionSummary') },
} as unknown as Parameters<typeof mock.module>[1]);
mock.module('@/components/profile/ProfileMuteAction', {
  exports: {
    ProfileMuteAction: (props: MuteProps) => {
      capturedMute.value = props;
      return createElement('ProfileMuteAction', props);
    },
  },
} as unknown as Parameters<typeof mock.module>[1]);

before(async () => {
  ({ PostActionSurface } = await import('./PostActionSurface'));
});

describe('PostActionSurface mute wiring', () => {
  it('현재 action target 작성자의 mute 상태와 selected Profile mutation을 연결한다', async () => {
    capturedMute.value = null;
    changeCalls.length = 0;

    await act(async () => {
      renderer = create(createElement(PostActionSurface, { socialActionTarget: target as never }));
    });

    if (!capturedMute.value) {
      throw new Error('PostActionSurface did not render ProfileMuteAction.');
    }
    const mute = capturedMute.value as unknown as MuteProps;
    assert.deepEqual(
      {
        displayName: mute.displayName,
        muted: mute.muted,
        profileId: mute.profileId,
      },
      { displayName: '코스모 작가', muted: true, profileId: 'profile:author' },
    );

    await mute.onChangeMuted(false);
    assert.deepEqual(changeCalls[0], [
      {
        ownerProfileId: 'profile:viewer',
        profileMuteId: 'profile-mute:1',
        targetProfileId: 'profile:author',
      },
      false,
    ]);
  });
});

afterEach(async () => {
  if (renderer) {
    await act(async () => renderer?.unmount());
    renderer = null;
  }
});
