import assert from 'node:assert/strict';
import { afterEach, before, describe, it, mock } from 'node:test';
import { createElement } from 'react';
import { act, create } from 'react-test-renderer';
import type { ComponentType } from 'react';
import type { ReactTestRenderer } from 'react-test-renderer';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

type ProfileMuteController = {
  changeMuted: (
    change: {
      ownerProfileId: string;
      profileMuteId?: string | null;
      targetProfileId: string;
    },
    nextMuted: boolean,
  ) => Promise<void>;
};

type MutationConfig = {
  onCompleted: (response: unknown, errors?: ReadonlyArray<{ message: string }> | null) => void;
  onError: (error: Error) => void;
  updater?: (store: unknown) => void;
  variables: { id: string };
};

const generationRef = { current: 1 };
const environment = { commitUpdate: () => (commitUpdateCalls += 1) };
let commitUpdateCalls = 0;
let refreshCalls = 0;
let selectedProfileId: string | null = 'profile:owner';
const commits: MutationConfig[] = [];
let ControllerProbe: ComponentType<{ onReady: (value: ProfileMuteController) => void }>;
let renderer: ReactTestRenderer | null = null;

mock.module('react-relay', {
  exports: {
    graphql: (parts: TemplateStringsArray) =>
      parts.join('').match(/mutation (ProfileMuteController\w+)/)?.[1] ?? 'unknown',
    useMutation: () => [
      (config: MutationConfig) => {
        commits.push(config);
      },
    ],
    useRelayEnvironment: () => environment,
  },
} as unknown as Parameters<typeof mock.module>[1]);
mock.module('@/components/shell/ShellChromeContext', {
  exports: { useShellChrome: () => ({ refreshProfileMuteTimelines: () => (refreshCalls += 1) }) },
} as unknown as Parameters<typeof mock.module>[1]);
mock.module('@/relay/RelayEnvironmentBoundary', {
  exports: { useRelayEnvironmentGeneration: () => generationRef },
} as unknown as Parameters<typeof mock.module>[1]);
mock.module('@/session/SessionProvider', {
  exports: { useSession: () => ({ selectedProfileId }) },
} as unknown as Parameters<typeof mock.module>[1]);

before(async () => {
  const { useProfileMuteMutations } = await import('./ProfileMuteController');
  ControllerProbe = ({ onReady }) => {
    onReady(useProfileMuteMutations());
    return null;
  };
});

describe('ProfileMuteController', () => {
  it('selected Profile mutation을 commit하고 성공 시 timeline refresh를 요청한다', async () => {
    const controller = await renderController();

    const request = controller.changeMuted(
      { ownerProfileId: 'profile:owner', targetProfileId: 'profile:target' },
      true,
    );
    assert.equal(commits.length, 1);
    assert.deepEqual(commits[0].variables, { id: 'profile:target' });

    commits[0].onCompleted({ muteProfile: { profileMute: { id: 'profile-mute:1' } } }, []);
    await request;
    assert.equal(refreshCalls, 1);
  });

  it('unmute는 관계 identity를 보내고 server confirmation 뒤 cache update를 실행한다', async () => {
    const controller = await renderController();

    const request = controller.changeMuted(
      {
        ownerProfileId: 'profile:owner',
        profileMuteId: 'profile-mute:1',
        targetProfileId: 'profile:target',
      },
      false,
    );
    assert.equal(commits.length, 1);
    assert.deepEqual(commits[0].variables, { id: 'profile-mute:1' });
    commits[0].onCompleted({ unmuteProfile: { profileMuteId: 'profile-mute:1' } }, []);

    await request;
    assert.equal(commitUpdateCalls, 1);
    assert.equal(refreshCalls, 1);
  });

  it('actor generation이 바뀐 응답은 reject하고 cache와 refresh를 건드리지 않는다', async () => {
    const controller = await renderController();
    const request = controller.changeMuted(
      { ownerProfileId: 'profile:owner', targetProfileId: 'profile:target' },
      true,
    );
    generationRef.current = 2;
    commits[0].onCompleted({ muteProfile: { profileMute: { id: 'profile-mute:stale' } } }, []);

    await assert.rejects(request, /inactive Profile/);
    assert.equal(refreshCalls, 0);
  });

  it('controller가 route와 함께 unmount된 응답은 성공으로 분류하지 않는다', async () => {
    const controller = await renderController();
    const request = controller.changeMuted(
      { ownerProfileId: 'profile:owner', targetProfileId: 'profile:target' },
      true,
    );

    await act(async () => renderer?.unmount());
    renderer = null;
    commits[0].onCompleted({ muteProfile: { profileMute: { id: 'profile-mute:stale' } } }, []);

    await assert.rejects(request, /inactive Profile/);
    assert.equal(refreshCalls, 0);
  });
});

afterEach(async () => {
  if (renderer) {
    await act(async () => renderer?.unmount());
    renderer = null;
  }
});

async function renderController() {
  commits.length = 0;
  commitUpdateCalls = 0;
  refreshCalls = 0;
  generationRef.current = 1;
  selectedProfileId = 'profile:owner';
  let controller!: ProfileMuteController;
  await act(async () => {
    renderer = create(
      createElement(ControllerProbe, {
        onReady: (value: ProfileMuteController) => {
          controller = value;
        },
      }),
    );
  });
  assert.ok(renderer);
  return controller;
}
