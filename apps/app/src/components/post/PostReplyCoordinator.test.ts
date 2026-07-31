import assert from 'node:assert/strict';
import { afterEach, describe, it } from 'node:test';
import { createElement } from 'react';
import { act, create } from 'react-test-renderer';
import { PostReplyCoordinatorProvider, usePostReplyBinding } from './PostReplyCoordinator';
import type { ReactTestRenderer } from 'react-test-renderer';
import type { ReplyComposerSurface_profile$key } from './__generated__/ReplyComposerSurface_profile.graphql';
import type { PostReplyBinding, PostReplyOwner } from './PostReplyCoordinator';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const profile = {} as ReplyComposerSurface_profile$key;
const bindings = new Map<string, PostReplyBinding | null>();
let renderer: ReactTestRenderer | null = null;

function Probe({ postId }: { postId: string }) {
  bindings.set(postId, usePostReplyBinding(postId));
  return null;
}

async function renderCoordinator({
  owner,
  replyProfile = profile,
}: {
  owner: PostReplyOwner;
  replyProfile?: ReplyComposerSurface_profile$key | null;
}) {
  await act(async () => {
    renderer = create(
      createElement(
        PostReplyCoordinatorProvider,
        { owner, profile: replyProfile },
        createElement(Probe, { key: 'a', postId: 'a' }),
        createElement(Probe, { key: 'b', postId: 'b' }),
      ),
    );
  });
}

function binding(postId: string): PostReplyBinding | null {
  const result = bindings.get(postId);
  assert.notEqual(result, undefined);
  return result ?? null;
}

afterEach(async () => {
  bindings.clear();
  if (renderer) {
    await act(async () => renderer?.unmount());
    renderer = null;
  }
});

describe('PostReplyCoordinator', () => {
  it('Provider 밖 소비를 guest로 숨기지 않고 programming error로 드러낸다', async () => {
    await assert.rejects(async () => {
      await act(async () => {
        renderer = create(createElement(Probe, { postId: 'outside' }));
      });
    }, /PostReplyCoordinatorProvider가 필요합니다/);
  });

  it('명시적인 null Profile에서는 Reply binding을 제공하지 않는다', async () => {
    await renderCoordinator({ owner: 'list', replyProfile: null });

    assert.equal(binding('a'), null);
    assert.equal(binding('b'), null);
  });

  it('목록 collection에서 한 Parent만 active 상태로 유지한다', async () => {
    await renderCoordinator({ owner: 'list' });

    await act(async () => binding('a')?.onPress());
    assert.equal(binding('a')?.expanded, true);
    assert.equal(binding('b')?.expanded, false);

    await act(async () => binding('b')?.onPress());
    assert.equal(binding('a')?.expanded, false);
    assert.equal(binding('b')?.expanded, true);

    await act(async () => binding('b')?.onPress());
    assert.equal(binding('a')?.expanded, false);
    assert.equal(binding('b')?.expanded, false);
  });

  it('상세 Parent 전환은 active surface가 close callback을 실행한 뒤에만 반영한다', async () => {
    await renderCoordinator({ owner: 'detail' });
    await act(async () => binding('a')?.onPress());

    const activeSurfaceRef = binding('a')?.surfaceRef;
    assert.ok(activeSurfaceRef);
    let closeContinuation: (() => void) | undefined;
    activeSurfaceRef.current = {
      requestClose: (onClosed) => {
        closeContinuation = onClosed;
      },
    };

    await act(async () => binding('b')?.onPress());
    assert.equal(binding('a')?.expanded, true);
    assert.equal(binding('b')?.expanded, false);
    assert.ok(closeContinuation);

    await act(async () => closeContinuation?.());
    assert.equal(binding('a')?.expanded, false);
    assert.equal(binding('b')?.expanded, true);

    const pendingSurfaceRef = binding('b')?.surfaceRef;
    assert.ok(pendingSurfaceRef);
    pendingSurfaceRef.current = { requestClose: () => undefined };

    await act(async () => binding('a')?.onPress());
    assert.equal(binding('a')?.expanded, false);
    assert.equal(binding('b')?.expanded, true);
  });
});
