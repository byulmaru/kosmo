import assert from 'node:assert/strict';
import { afterEach, before, beforeEach, describe, it, mock } from 'node:test';
import { createElement } from 'react';
import * as Relay from 'react-relay';
import { act, create } from 'react-test-renderer';
import { Environment, Network, Observable, RecordSource, Store } from 'relay-runtime';
import { post } from '@/stories/fixtures';
import PostDetailThreadFragment from './__generated__/PostDetailThread_post.graphql';
import PostMediaViewerThreadQueryNode from './__generated__/PostMediaViewerThreadQuery.graphql';
import type { ReactTestRenderer } from 'react-test-renderer';
import type { GraphQLResponse } from 'relay-runtime';
import type { PostDetailThread_post$key } from './__generated__/PostDetailThread_post.graphql';
import type { PostMediaViewerThread as PostMediaViewerThreadComponent } from './PostMediaViewerThread';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

type Request = {
  mediaOwnerPostId: unknown;
  respond: (data: ReturnType<typeof threadResponse>) => void;
};

let renderer: ReactTestRenderer | null = null;
let PostMediaViewerThread: typeof PostMediaViewerThreadComponent;
const requests: Request[] = [];

const mockModule = (specifier: string | URL, exports: object) =>
  mock.module(specifier, { exports } as unknown as Parameters<typeof mock.module>[1]);

mockModule('react-relay', { ...Relay, graphql: () => PostMediaViewerThreadQueryNode });
mockModule('react-native', { Platform: { OS: 'web' } });
mockModule('@/components/ui/StateView', {
  StateView: (props: object) => createElement('StateView', props),
});
mockModule(new URL('./PostDetailThread.tsx', import.meta.url), {
  PostDetailThread: ({
    onReplyCreated,
    post: thread,
  }: {
    onReplyCreated: () => void;
    post: PostDetailThread_post$key;
  }) => {
    const { replyDescendants } = Relay.useFragment(PostDetailThreadFragment, thread);
    return createElement(
      'Thread',
      { testID: 'viewer-reply-thread', replyCount: replyDescendants.edges.length },
      createElement('Button', { accessibilityLabel: '답글 작성 완료', onPress: onReplyCreated }),
    );
  },
});

before(async () => {
  ({ PostMediaViewerThread } = await import('./PostMediaViewerThread'));
});

beforeEach(() => mock.timers.enable({ apis: ['setTimeout'] }));

afterEach(async () => {
  await act(async () => renderer?.unmount());
  await act(async () => mock.timers.tick(300_001));
  mock.timers.reset();
  renderer = null;
  requests.length = 0;
});

describe('PostMediaViewerThread', () => {
  it('refreshes the media owner’s replies after a reply is created', async () => {
    await render();
    assert.equal(requests[0]?.mediaOwnerPostId, 'post-1');
    await act(async () => requests[0]?.respond(threadResponse()));
    assert.equal(thread().props.replyCount, 0);

    await act(async () =>
      thread().findByProps({ accessibilityLabel: '답글 작성 완료' }).props.onPress(),
    );
    assert.equal(requests[1]?.mediaOwnerPostId, 'post-1');
    await act(async () => requests[1]?.respond(threadResponse({ includeReply: true })));
    assert.equal(thread().props.replyCount, 1);
  });

  it('hides the thread when the response belongs to a different content revision', async () => {
    await render();
    assert.ok(requests[0]);
    await act(async () => requests[0].respond(threadResponse({ contentId: 'content-other' })));

    assert.equal(renderer!.root.findAllByProps({ testID: 'viewer-reply-thread' }).length, 0);
    assert.equal(renderer!.root.findAll((node) => String(node.type) === 'StateView').length, 0);
  });
});

function thread() {
  assert.ok(renderer);
  return renderer.root.findByProps({ testID: 'viewer-reply-thread' });
}

async function render() {
  const environment = new Environment({
    network: Network.create((_request, variables) =>
      Observable.create<GraphQLResponse>((sink) => {
        requests.push({
          mediaOwnerPostId: variables.mediaOwnerPostId,
          respond: (data) => {
            sink.next({ data });
            sink.complete();
          },
        });
      }),
    ),
    store: new Store(new RecordSource()),
  });

  await act(async () => {
    renderer = create(
      createElement(Relay.RelayEnvironmentProvider, {
        environment,
        children: createElement(PostMediaViewerThread, {
          contentId: 'content-post-1',
          mediaOwnerPostId: 'post-1',
          replyAvailable: true,
          replySurfacePostId: 'post-1',
        }),
      }),
    );
  });
}

function threadResponse({
  contentId = 'content-post-1',
  includeReply = false,
}: { contentId?: string; includeReply?: boolean } = {}) {
  const mediaOwner = post({ id: 'post-1' });
  const reply = post({
    id: 'reply-1',
    replyParent: { __typename: 'Post', id: mediaOwner.id, profile: mediaOwner.profile },
  });
  return {
    currentSession: null,
    node: {
      ...mediaOwner,
      content: { ...mediaOwner.content, id: contentId },
      viewerReactions: [],
      replyAncestors: [],
      replyDescendants: {
        edges: includeReply ? [{ cursor: 'reply-1', node: { ...reply, viewerReactions: [] } }] : [],
        pageInfo: { endCursor: includeReply ? 'reply-1' : null, hasNextPage: false },
      },
    },
  };
}
