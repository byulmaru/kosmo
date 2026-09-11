import assert from 'node:assert/strict';
import { afterEach, describe, it } from 'node:test';
import { createElement } from 'react';
import { act, create } from 'react-test-renderer';
import { PostComposerCoordinatorProvider, usePostComposerBinding } from './PostComposerCoordinator';
import type { ReactTestRenderer } from 'react-test-renderer';
import type { ReplyComposerSurface_profile$key } from './__generated__/ReplyComposerSurface_profile.graphql';
import type { PostComposerBinding, PostComposerOwner } from './PostComposerCoordinator';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const profile = {} as ReplyComposerSurface_profile$key;
const bindings = new Map<string, PostComposerBinding | null>();
let renderer: ReactTestRenderer | null = null;

function Probe({ mode = 'reply', postId }: { mode?: 'quote' | 'reply'; postId: string }) {
  bindings.set(`${postId}:${mode}`, usePostComposerBinding(postId, mode));
  return null;
}

async function renderCoordinator({
  owner,
  replyProfile = profile,
}: {
  owner: PostComposerOwner;
  replyProfile?: ReplyComposerSurface_profile$key | null;
}) {
  await act(async () => {
    renderer = create(
      createElement(
        PostComposerCoordinatorProvider,
        { owner, profile: replyProfile },
        createElement(Probe, { key: 'a', postId: 'a' }),
        createElement(Probe, { key: 'b', postId: 'b' }),
        createElement(Probe, { key: 'a-quote', mode: 'quote', postId: 'a' }),
      ),
    );
  });
}

function binding(postId: string, mode: 'quote' | 'reply' = 'reply'): PostComposerBinding | null {
  const result = bindings.get(`${postId}:${mode}`);
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

describe('PostComposerCoordinator', () => {
  it('Provider 밖 소비를 guest로 숨기지 않고 programming error로 드러낸다', async () => {
    await assert.rejects(async () => {
      await act(async () => {
        renderer = create(createElement(Probe, { postId: 'outside' }));
      });
    }, /Post Composer 표현부에는 PostComposerCoordinatorProvider가 필요합니다/);
  });

  it('명시적인 null Profile에서도 resolution 조립용 disabled binding을 제공한다', async () => {
    await renderCoordinator({ owner: 'list', replyProfile: null });

    assert.equal(binding('a')?.profile, null);
    assert.equal(binding('a')?.expanded, false);
    assert.equal(binding('b')?.profile, null);

    await act(async () => binding('a')?.onPress());
    assert.equal(binding('a')?.expanded, false);
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

  it('같은 Post의 Reply와 Quote를 하나의 discard lifecycle로 전환한다', async () => {
    await renderCoordinator({ owner: 'list' });
    const pressQuote = binding('a', 'quote')?.onPress;
    assert.ok(pressQuote);
    await act(async () => binding('a')?.onPress());

    const replySurfaceRef = binding('a')?.surfaceRef;
    assert.ok(replySurfaceRef);
    let openQuote: (() => void) | undefined;
    replySurfaceRef.current = {
      requestClose: (onClosed) => {
        openQuote = onClosed;
      },
    };

    await act(async () => pressQuote());
    assert.equal(binding('a')?.expanded, true);
    assert.equal(binding('a', 'quote')?.expanded, false);
    assert.ok(openQuote);

    await act(async () => openQuote?.());
    assert.equal(binding('a')?.expanded, false);
    assert.equal(binding('a', 'quote')?.expanded, true);

    const quoteSurfaceRef = binding('a', 'quote')?.surfaceRef;
    assert.ok(quoteSurfaceRef);
    let openReply: (() => void) | undefined;
    quoteSurfaceRef.current = {
      requestClose: (onClosed) => {
        openReply = onClosed;
      },
    };

    await act(async () => binding('a')?.onPress());
    assert.equal(binding('a')?.expanded, false);
    assert.equal(binding('a', 'quote')?.expanded, true);
    assert.ok(openReply);

    await act(async () => openReply?.());
    assert.equal(binding('a')?.expanded, true);
    assert.equal(binding('a', 'quote')?.expanded, false);
  });
});
