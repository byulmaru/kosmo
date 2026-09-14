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
  variables: Record<string, string>;
};

let selectedProfileId: string | null = 'owner-a';
let blockMutation: MutationOptions | null = null;
let unblockMutation: MutationOptions | null = null;

const mockModule = (specifier: string | URL, exports: object) =>
  mock.module(specifier, {
    exports,
  } as unknown as Parameters<typeof mock.module>[1]);

mockModule('react-relay', {
  graphql: (parts: TemplateStringsArray) => parts.join(''),
  useMutation: (operation: string) => [
    (options: MutationOptions) => {
      if (operation.includes('UnblockMutation')) {
        unblockMutation = options;
      } else {
        blockMutation = options;
      }
    },
    false,
  ],
  useRelayEnvironment: () => ({
    getStore: () => ({ getSource: () => ({ has: () => false }) }),
  }),
});
mockModule(new URL('../../session/SessionProvider.tsx', import.meta.url), {
  useSession: () => ({ selectedProfileId }),
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
  blockMutation = null;
  unblockMutation = null;
  controller = null;
});

describe('ProfileBlockController actor boundary', () => {
  it('selected actor 전환 뒤 도착한 block 응답을 거부한다', async () => {
    await renderController();
    const request = controller?.changeBlocked(
      { ownerProfileId: 'owner-a', targetProfileId: 'target-a' },
      true,
    );
    assert.ok(request);
    assert.ok(blockMutation);

    await switchActor();
    blockMutation.onCompleted?.({
      blockProfile: {
        success: true,
        profileBlock: { id: 'block-a', targetProfile: { id: 'target-a' } },
      },
    });

    await assert.rejects(request, /inactive Profile/);
  });

  it('selected actor 전환 뒤 도착한 unblock 응답을 거부한다', async () => {
    await renderController();
    const request = controller?.changeBlocked(
      { ownerProfileId: 'owner-a', profileBlockId: 'block-a' },
      false,
    );
    assert.ok(request);
    assert.ok(unblockMutation);

    await switchActor();
    unblockMutation.onCompleted?.({
      unblockProfile: { success: true, profileBlockId: 'block-a' },
    });

    await assert.rejects(request, /inactive Profile/);
  });
});

async function renderController() {
  await act(async () => {
    renderer = create(createElement(Harness, { onReady: (value) => (controller = value) }));
  });
  assert.ok(controller);
}

async function switchActor() {
  selectedProfileId = 'owner-b';
  await act(async () => {
    renderer?.update(createElement(Harness, { onReady: (value) => (controller = value) }));
  });
}
