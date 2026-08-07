import assert from 'node:assert/strict';
import { afterEach, before, describe, it, mock } from 'node:test';
import { createElement, Suspense } from 'react';
import { act, create } from 'react-test-renderer';
import type { PropsWithChildren, ReactNode } from 'react';
import type { ReactTestRenderer } from 'react-test-renderer';
import type { PostMediaViewerThread as PostMediaViewerThreadComponent } from './PostMediaViewerThread';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let actorRevision = 3;
let queryData = validQueryData();
let queryFetchKey: string | number | undefined;
let renderer: ReactTestRenderer | null = null;

mock.module('react-relay', {
  exports: {
    graphql: () => ({}),
    useLazyLoadQuery: (
      _query: unknown,
      _variables: unknown,
      options?: { fetchKey?: string | number },
    ) => {
      queryFetchKey = options?.fetchKey;
      return queryData;
    },
  },
} as unknown as Parameters<typeof mock.module>[1]);

mock.module('@/components/RouteBoundary', {
  exports: {
    RouteBoundary: ({ children, loading }: PropsWithChildren<{ loading: ReactNode }>) =>
      createElement(Suspense, { fallback: loading }, children),
  },
} as unknown as Parameters<typeof mock.module>[1]);

mock.module('@/components/ui/StateView', {
  exports: {
    StateView: (props: Record<string, unknown>) => createElement('StateView', props),
  },
} as unknown as Parameters<typeof mock.module>[1]);

mock.module('@/relay/RelayActorProvider', {
  exports: { useRelayActor: () => ({ revision: actorRevision }) },
} as unknown as Parameters<typeof mock.module>[1]);

mock.module('./PostDetailThread', {
  exports: {
    PostDetailThread: (props: Record<string, unknown>) =>
      createElement('PostDetailThread', { ...props, testID: 'viewer-post-detail-thread' }),
  },
} as unknown as Parameters<typeof mock.module>[1]);

let PostMediaViewerThread: typeof PostMediaViewerThreadComponent;

before(async () => {
  ({ PostMediaViewerThread } = await import('./PostMediaViewerThread'));
});

afterEach(async () => {
  if (renderer) {
    await act(async () => renderer?.unmount());
    renderer = null;
  }
  actorRevision = 3;
  queryData = validQueryData();
  queryFetchKey = undefined;
});

describe('PostMediaViewerThread', () => {
  it('같은 Post·Content의 기존 detail thread를 Viewer presentation으로 렌더한다', async () => {
    await render();

    const thread = renderer!.root.findByProps({ testID: 'viewer-post-detail-thread' });
    assert.equal(thread.props.presentation, 'viewer');
    assert.equal(thread.props.post, queryData.node.thread);
    assert.equal(thread.props.replyProfile, queryData.currentSession.selectedProfile);
    assert.equal(queryFetchKey, '3:post-1:content-1:0');
  });

  it('Reply 작성 뒤 같은 Post detail operation을 새 fetch key로 갱신한다', async () => {
    await render();
    const thread = renderer!.root.findByProps({ testID: 'viewer-post-detail-thread' });

    await act(async () => thread.props.onReplyCreated());

    assert.equal(queryFetchKey, '3:post-1:content-1:1');
  });

  it('조회된 Post·Content identity가 현재 projection과 다르면 thread만 숨긴다', async () => {
    queryData = validQueryData({ contentId: 'content-other' });

    await render();

    assert.equal(renderer!.root.findAllByProps({ testID: 'viewer-post-detail-thread' }).length, 0);
  });
});

async function render() {
  await act(async () => {
    renderer = create(
      createElement(PostMediaViewerThread, {
        contentId: 'content-1',
        postId: 'post-1',
      }),
    );
  });
  assert.ok(renderer);
}

function validQueryData({ contentId = 'content-1' }: { contentId?: string } = {}) {
  return {
    currentSession: { id: 'session-1', selectedProfile: { id: 'profile-selected' } },
    node: {
      __typename: 'Post' as const,
      content: { id: contentId },
      id: 'post-1',
      state: 'ACTIVE',
      thread: { id: 'thread-fragment' },
    },
  };
}
