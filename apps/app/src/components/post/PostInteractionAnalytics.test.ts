import assert from 'node:assert/strict';
import { after, before, beforeEach, describe, it, mock } from 'node:test';
import { createElement } from 'react';
import { act, create } from 'react-test-renderer';
import type { ReactNode } from 'react';
import type { ReactTestRenderer } from 'react-test-renderer';
import type { usePostBookmarkAction as usePostBookmarkActionExport } from './PostBookmarkAction';
import type {
  PostReactionController as PostReactionControllerExport,
  usePostReactionController as usePostReactionControllerExport,
} from './PostReactionController';
import type { RepostAction as RepostActionExport } from './RepostAction';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

type MutationError = Readonly<{
  message: string;
  path?: ReadonlyArray<string | number>;
}>;
type MutationRequest = {
  onCompleted?: (response: unknown, errors?: ReadonlyArray<MutationError> | null) => void;
  onError?: (error: Error) => void;
};

type Session = {
  selectedProfileId: string | null;
  status: 'guest' | 'valid';
};

const session: Session = {
  selectedProfileId: 'profile-a',
  status: 'valid',
};
const analyticsCalls: unknown[][] = [];
const mutationRequests: MutationRequest[] = [];
const relayEnvironment = {};
let fragmentData: unknown;
let renderer: ReactTestRenderer | null = null;

const mockModule = (specifier: string | URL, exports: object) =>
  mock.module(specifier, { exports } as unknown as Parameters<typeof mock.module>[1]);

function MockActionMenu({
  items,
  renderTrigger,
}: {
  items: ReadonlyArray<{ onSelect: () => void }>;
  renderTrigger: (props: {
    expanded: boolean;
    focusTrigger: () => void;
    onPress: () => void;
    ref: null;
  }) => ReactNode;
}) {
  return createElement(
    'ActionMenu',
    { items },
    renderTrigger({
      expanded: false,
      focusTrigger: () => undefined,
      onPress: () => undefined,
      ref: null,
    }),
  );
}

function MockPostActionControl(props: Record<string, unknown>) {
  return createElement('PostActionControl', props);
}

mockModule('lucide-react-native', {
  Quote: 'Quote',
  Repeat2: 'Repeat2',
});
mockModule('react-native', {
  ActivityIndicator: 'ActivityIndicator',
  Platform: { OS: 'web' },
  Pressable: 'Pressable',
  StyleSheet: { create: <T>(styles: T) => styles },
  Text: 'Text',
  Touchable: { Mixin: {} },
  View: 'View',
});
mockModule('react-native-svg', {
  Circle: 'Circle',
  Line: 'Line',
  Path: 'Path',
  Polyline: 'Polyline',
  Polygon: 'Polygon',
  Rect: 'Rect',
  Svg: 'Svg',
});
mockModule('react-relay', {
  graphql: () => ({}),
  useFragment: () => fragmentData,
  useMutation: () => [(request: MutationRequest) => mutationRequests.push(request), false],
  useRelayEnvironment: () => relayEnvironment,
});
mockModule('relay-runtime', {
  ConnectionHandler: {
    getConnectionID: (parentId: string, key: string) => `${parentId}:${key}`,
  },
});
mockModule('@/analytics/client', {
  trackAnalytics: (...args: unknown[]) => analyticsCalls.push(args),
});
mockModule('@/components/ui/ActionMenu', { ActionMenu: MockActionMenu });
mockModule('@/components/ui/ToastProvider', {
  useToast: () => ({ showToast: () => undefined }),
});
mockModule('@/session/SessionProvider', { useSession: () => session });
mockModule('@/theme/ThemeProvider', {
  useTheme: () => ({ actionRepostBase: '#16794A' }),
});
mockModule('./PostActionControl', { PostActionControl: MockPostActionControl });

let RepostAction: typeof RepostActionExport;
let usePostBookmarkAction: typeof usePostBookmarkActionExport;
let usePostReactionController: typeof usePostReactionControllerExport;

function BookmarkHarness() {
  const config = usePostBookmarkAction({} as never);
  assert.ok(config);
  return createElement('BookmarkHarness', config);
}

function ReactionHarness() {
  const controller: PostReactionControllerExport = usePostReactionController({} as never, true);
  return createElement('ReactionHarness', controller);
}

function lastMutationRequest(): MutationRequest {
  const request = mutationRequests.at(-1);
  assert.ok(request);
  return request;
}

function reactionAddResponse(type: string, id: string) {
  return {
    addReaction: {
      post: {
        id: 'post-id',
        reactionCounts: [{ count: 1, type }],
        viewerReactions: [{ id, type }],
      },
      reaction: { id, type },
    },
  };
}

before(async () => {
  ({ RepostAction } = await import('./RepostAction'));
  ({ usePostBookmarkAction } = await import('./PostBookmarkAction'));
  ({ usePostReactionController } = await import('./PostReactionController'));
});

beforeEach(() => {
  session.selectedProfileId = 'profile-a';
  session.status = 'valid';
  analyticsCalls.length = 0;
  mutationRequests.length = 0;
  fragmentData = undefined;
});

after(async () => {
  await act(async () => renderer?.unmount());
});

describe('Post interaction analytics callbacks', () => {
  it('재게시 생성·취소는 각 성공 payload 뒤 한 번씩 기록한다', async () => {
    fragmentData = { content: null, id: 'post-id', repostCount: 0, viewerRepost: null };

    await act(async () => {
      renderer = create(createElement(RepostAction, { post: {} as never }));
    });
    const menu = renderer!.root.findByType(MockActionMenu);
    await act(async () => menu.props.items[0].onSelect());
    await act(async () => menu.props.items[0].onSelect());
    assert.equal(mutationRequests.length, 1);

    const request = lastMutationRequest();
    await act(async () =>
      request.onCompleted?.({ repostPost: { repost: { id: 'repost-id', repostSource: null } } }, [
        {
          message: 'repost source projection failed',
          path: ['repostPost', 'repost', 'repostSource', 'repostCount'],
        },
      ]),
    );

    fragmentData = {
      content: null,
      id: 'post-id',
      repostCount: 1,
      viewerRepost: { id: 'repost-id' },
    };
    await act(async () => renderer?.update(createElement(RepostAction, { post: {} as never })));
    const cancelMenu = renderer!.root.findByType(MockActionMenu);
    await act(async () => cancelMenu.props.items[0].onSelect());
    const cancelRequest = lastMutationRequest();
    await act(async () =>
      cancelRequest.onCompleted?.({ deletePost: { postId: 'repost-id', repostSource: null } }, [
        {
          message: 'repost source projection failed',
          path: ['deletePost', 'repostSource', 'viewerRepost'],
        },
      ]),
    );

    assert.deepEqual(analyticsCalls, [
      ['repost_succeeded', { result: 'created' }],
      ['repost_succeeded', { result: 'removed' }],
    ]);
  });

  it('재게시의 success payload 누락은 기록하지 않는다', async () => {
    fragmentData = { content: null, id: 'post-id', repostCount: 0, viewerRepost: null };

    await act(async () => {
      renderer = create(createElement(RepostAction, { post: {} as never }));
    });
    const menu = renderer!.root.findByType(MockActionMenu);
    await act(async () => menu.props.items[0].onSelect());
    const missingPayloadRequest = lastMutationRequest();
    await act(async () => missingPayloadRequest.onCompleted?.({ repostPost: null }));

    assert.deepEqual(analyticsCalls, []);
  });

  it('북마크 생성은 bookmark id가 확인될 때 기록하고, 취소는 대상 ID 확인을 우선한다', async () => {
    fragmentData = { id: 'post-id', viewerBookmark: null };

    await act(async () => {
      renderer = create(createElement(BookmarkHarness));
    });
    const createConfig = renderer!.root.findByType('BookmarkHarness' as never).props;
    await act(async () => createConfig.onPress());
    await act(async () => createConfig.onPress());
    assert.equal(mutationRequests.length, 1);
    const createRequest = lastMutationRequest();
    await act(async () =>
      createRequest.onCompleted?.(
        { createBookmark: { bookmark: { id: 'bookmark-id', post: null } } },
        [
          {
            message: 'bookmark post projection failed',
            path: ['createBookmark', 'bookmark', 'post', 'viewerBookmark'],
          },
        ],
      ),
    );

    fragmentData = { id: 'post-id', viewerBookmark: { id: 'bookmark-id' } };
    await act(async () => renderer?.update(createElement(BookmarkHarness)));
    const deleteConfig = renderer!.root.findByType('BookmarkHarness' as never).props;
    await act(async () => deleteConfig.onPress());
    const deleteRequest = lastMutationRequest();
    await act(async () =>
      deleteRequest.onCompleted?.(
        { deleteBookmark: { post: null, requestedBookmarkId: 'bookmark-id' } },
        [
          {
            message: 'bookmark post projection failed',
            path: ['deleteBookmark', 'post', 'viewerBookmark'],
          },
        ],
      ),
    );

    assert.deepEqual(analyticsCalls, [
      ['bookmark_added', {}],
      ['bookmark_removed', {}],
    ]);
  });

  it('Reaction은 성공 payload에서만 분류된 reaction_type을 기록하고 원문은 보내지 않는다', async () => {
    fragmentData = {
      id: 'post-id',
      profile: { relativeHandle: '@author@example.test' },
      reactionCounts: [],
      viewerReactions: [],
    };

    await act(async () => {
      renderer = create(createElement(ReactionHarness));
    });
    const controller = renderer!.root.findByType('ReactionHarness' as never).props;
    await act(async () => controller.toggleReaction({ nextSelected: true, optionId: '❤️' }));
    await act(async () => controller.toggleReaction({ nextSelected: true, optionId: '❤️' }));
    assert.equal(mutationRequests.length, 1);
    const addRequest = lastMutationRequest();
    await act(async () => addRequest.onCompleted?.(reactionAddResponse('❤️', 'reaction-heart')));

    await act(async () => controller.toggleReaction({ nextSelected: true, optionId: '🎉' }));
    const customRequest = lastMutationRequest();
    await act(async () => customRequest.onCompleted?.(reactionAddResponse('🎉', 'reaction-party')));

    await act(async () => controller.toggleReaction({ nextSelected: false, optionId: '❤️' }));
    const removeRequest = lastMutationRequest();
    await act(async () =>
      removeRequest.onCompleted?.({ deleteReaction: { post: null, reactionId: null } }, [
        {
          message: 'reaction projection failed',
          path: ['deleteReaction', 'post', 'viewerReactions'],
        },
      ]),
    );

    assert.deepEqual(analyticsCalls, [
      ['reaction_added', { reaction_type: 'default' }],
      ['reaction_added', { reaction_type: 'custom' }],
      ['reaction_removed', { reaction_type: 'default' }],
    ]);
  });

  it('network 오류와 성공 payload 누락·불일치는 이벤트를 기록하지 않는다', async () => {
    fragmentData = { content: null, id: 'post-id', repostCount: 0, viewerRepost: null };
    await act(async () => {
      renderer = create(createElement(RepostAction, { post: {} as never }));
    });
    const repostMenu = renderer!.root.findByType(MockActionMenu);
    await act(async () => repostMenu.props.items[0].onSelect());
    await act(async () => lastMutationRequest().onError?.(new Error('network failure')));

    fragmentData = { id: 'post-id', viewerBookmark: null };
    await act(async () => renderer?.update(createElement(BookmarkHarness)));
    let bookmarkConfig = renderer!.root.findByType('BookmarkHarness' as never).props;
    await act(async () => bookmarkConfig.onPress());
    await act(async () => lastMutationRequest().onError?.(new Error('network failure')));
    await act(async () => bookmarkConfig.onPress());
    await act(async () => lastMutationRequest().onCompleted?.({ createBookmark: null }));

    fragmentData = { id: 'post-id', viewerBookmark: { id: 'bookmark-id' } };
    await act(async () => renderer?.update(createElement(BookmarkHarness)));
    bookmarkConfig = renderer!.root.findByType('BookmarkHarness' as never).props;
    await act(async () => bookmarkConfig.onPress());
    await act(async () =>
      lastMutationRequest().onCompleted?.({
        deleteBookmark: { requestedBookmarkId: 'different-bookmark-id' },
      }),
    );

    fragmentData = {
      id: 'post-id',
      profile: { relativeHandle: '@author@example.test' },
      reactionCounts: [],
      viewerReactions: [],
    };
    await act(async () => renderer?.update(createElement(ReactionHarness)));
    const reactionController = renderer!.root.findByType('ReactionHarness' as never).props;
    await act(async () =>
      reactionController.toggleReaction({ nextSelected: true, optionId: '❤️' }),
    );
    await act(async () => lastMutationRequest().onError?.(new Error('network failure')));

    assert.deepEqual(analyticsCalls, []);
  });
});
