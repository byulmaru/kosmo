import assert from 'node:assert/strict';
import { afterEach, before, describe, it, mock } from 'node:test';
import { createElement } from 'react';
import { act, create } from 'react-test-renderer';
import type { ComponentType } from 'react';
import type { ReactTestRenderer } from 'react-test-renderer';
import type { useProfileBlockMutations as UseProfileBlockMutations } from './ProfileBlockController';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

type MutationOptions = {
  onCompleted?: (response: unknown, errors?: ReadonlyArray<{ message: string }> | null) => void;
  onError?: (error: Error) => void;
  updater?: (store: unknown) => void;
  variables: Record<string, string>;
};

const generationRef = { current: 1 };
let selectedProfileId: string | null = 'owner-a';
let blockMutation: MutationOptions | null = null;
let unblockMutation: MutationOptions | null = null;
let commitUpdateCalls = 0;
const resetCalls: string[] = [];

const environment = {
  commitUpdate: (updater: (store: unknown) => void) => {
    commitUpdateCalls += 1;
    updater({});
  },
  getStore: () => ({
    getSource: () => ({
      getRecordIDs: () => ['block-a'],
    }),
  }),
};

const mockModule = (specifier: string | URL, exports: object) =>
  mock.module(specifier, {
    exports,
  } as unknown as Parameters<typeof mock.module>[1]);

mockModule('react-relay', {
  graphql: (parts: TemplateStringsArray) => parts.join(''),
  useMutation: (operation: string) => {
    if (operation.includes('ProfileBlockControllerBlockMutation')) {
      return [
        (options: MutationOptions) => {
          blockMutation = options;
        },
        false,
      ];
    }
    return [
      (options: MutationOptions) => {
        unblockMutation = options;
      },
      false,
    ];
  },
  useRelayEnvironment: () => environment,
});
mockModule(new URL('../../relay/RelayActorProvider.tsx', import.meta.url), {
  useRelayActor: () => ({ resetActor: (profileId: string) => resetCalls.push(profileId) }),
});
mockModule(new URL('../../relay/RelayEnvironmentBoundary.tsx', import.meta.url), {
  useRelayEnvironmentGeneration: () => generationRef,
});
mockModule(new URL('../../session/SessionProvider.tsx', import.meta.url), {
  useSession: () => ({ selectedProfileId }),
});
mockModule(new URL('./profileBlockCache.ts', import.meta.url), {
  addProfileBlockToStore: () => undefined,
  removeProfileBlockFromStore: () => undefined,
  updateProfileBlockStatus: () => undefined,
});

type Controller = ReturnType<typeof UseProfileBlockMutations>;

let useProfileBlockMutations: typeof UseProfileBlockMutations;
let renderer: ReactTestRenderer | null = null;
let controller: Controller | null = null;

const Harness: ComponentType<{ onReady: (value: Controller) => void }> = ({ onReady }) => {
  onReady(useProfileBlockMutations());
  return null;
};

before(async () => {
  ({ useProfileBlockMutations } = await import('./ProfileBlockController'));
});

afterEach(async () => {
  if (renderer) {
    await act(async () => renderer?.unmount());
    renderer = null;
  }
  selectedProfileId = 'owner-a';
  generationRef.current = 1;
  blockMutation = null;
  unblockMutation = null;
  commitUpdateCalls = 0;
  resetCalls.length = 0;
  controller = null;
});

describe('ProfileBlockController', () => {
  it('기존 Profile ID인 생성 응답을 성공으로 처리한다', async () => {
    await renderController();
    const request = controller?.changeBlocked(
      { handle: '@target', ownerProfileId: 'owner-a', targetProfileId: 'target-a' },
      true,
    );
    assert.ok(request);
    assert.ok(blockMutation);

    blockMutation.onCompleted?.(
      {
        blockProfile: {
          profileBlock: { id: 'block-a', targetProfile: { id: 'target-a' } },
        },
      },
      null,
    );
    await request;
    await flushTasks();
    assert.deepEqual(resetCalls, ['owner-a']);
  });

  it('selected actor 전환 뒤 도착한 이전 actor 응답을 거부한다', async () => {
    await renderController();
    const request = controller?.changeBlocked(
      { handle: '@target', ownerProfileId: 'owner-a', targetProfileId: 'target-a' },
      true,
    );
    assert.ok(request);
    assert.ok(blockMutation);

    selectedProfileId = 'owner-b';
    generationRef.current = 2;
    await act(async () => {
      renderer?.update(createElement(Harness, { onReady: (value) => (controller = value) }));
    });

    blockMutation.onCompleted?.(
      {
        blockProfile: { profileBlock: { id: 'block-a', targetProfile: { id: 'target-a' } } },
      },
      null,
    );
    await assert.rejects(request, /inactive Profile/);
    assert.deepEqual(resetCalls, []);
  });

  it('unblock payload의 제거된 관계 ID가 요청 ID와 같으면 성공한다', async () => {
    await renderController();
    const request = controller?.changeBlocked(
      { handle: '@target', ownerProfileId: 'owner-a', profileBlockId: 'block-a' },
      false,
    );
    assert.ok(request);
    assert.ok(unblockMutation);

    unblockMutation.onCompleted?.({ unblockProfile: { profileBlockId: 'block-a' } }, null);

    await request;
    await flushTasks();
    assert.equal(commitUpdateCalls, 1);
    assert.deepEqual(resetCalls, ['owner-a']);
  });

  it('selected actor 전환 뒤 도착한 unblock 응답은 cache와 actor를 갱신하지 않는다', async () => {
    await renderController();
    const request = controller?.changeBlocked(
      { handle: '@target', ownerProfileId: 'owner-a', profileBlockId: 'block-a' },
      false,
    );
    assert.ok(request);
    assert.ok(unblockMutation);

    selectedProfileId = 'owner-b';
    generationRef.current = 2;
    await act(async () => {
      renderer?.update(createElement(Harness, { onReady: (value) => (controller = value) }));
    });

    unblockMutation.onCompleted?.({ unblockProfile: { profileBlockId: 'block-a' } }, null);

    await assert.rejects(request, /inactive Profile/);
    await flushTasks();
    assert.equal(commitUpdateCalls, 0);
    assert.deepEqual(resetCalls, []);
  });

  it('unblock payload가 null이면 cache commit 없이 실패한다', async () => {
    await renderController();
    const request = controller?.changeBlocked(
      { handle: '@target', ownerProfileId: 'owner-a', profileBlockId: 'block-a' },
      false,
    );
    assert.ok(request);
    assert.ok(unblockMutation);

    unblockMutation.onCompleted?.({ unblockProfile: { profileBlockId: null } }, null);

    await assert.rejects(request, /did not confirm/);
    assert.equal(commitUpdateCalls, 0);
    assert.deepEqual(resetCalls, []);
  });
});

async function renderController() {
  await act(async () => {
    renderer = create(createElement(Harness, { onReady: (value) => (controller = value) }));
  });
  assert.ok(controller);
}

async function flushTasks() {
  await new Promise<void>((resolve) => setTimeout(resolve, 0));
}
