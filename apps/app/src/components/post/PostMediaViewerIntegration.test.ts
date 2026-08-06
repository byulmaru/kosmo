import assert from 'node:assert/strict';
import { afterEach, before, describe, it, mock } from 'node:test';
import { createElement } from 'react';
import { act, create } from 'react-test-renderer';
import type { ReactTestRenderer } from 'react-test-renderer';
import type { PostLayout_post$key } from './__generated__/PostLayout_post.graphql';
import type { PostListItem_post$key } from './__generated__/PostListItem_post.graphql';
import type { PostLayout as PostLayoutComponent } from './PostLayout';
import type { PostListItem as PostListItemComponent } from './PostListItem';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
(
  globalThis as unknown as { requestAnimationFrame: (callback: FrameRequestCallback) => number }
).requestAnimationFrame = (callback) => {
  callback(0);
  return 1;
};

const replyBinding = {
  expanded: false,
  onPostCreated: () => undefined,
  onPress: () => undefined,
  onRequestClose: () => undefined,
  owner: 'list',
  profile: null,
  surfaceRef: { current: null },
};
let actorRevision = 0;

mock.module('expo-router', {
  exports: {
    Link: ({ children }: { children?: unknown }) => children,
    useRouter: () => ({ push: () => undefined }),
  },
} as unknown as Parameters<typeof mock.module>[1]);

mock.module('react-native', {
  exports: {
    Pressable: 'Pressable',
    StyleSheet: { create: <T>(styles: T) => styles },
    Text: 'Text',
    View: 'View',
  },
} as unknown as Parameters<typeof mock.module>[1]);

mock.module('react-relay', {
  exports: {
    graphql: () => ({}),
    useFragment: (_fragment: unknown, key: unknown) => key,
  },
} as unknown as Parameters<typeof mock.module>[1]);

mock.module(require.resolve('lucide-react-native'), {
  exports: { MessageCircle: 'MessageCircle' },
} as unknown as Parameters<typeof mock.module>[1]);

mock.module('@/components/profile/ProfileNameBlock', {
  exports: {
    ProfileNameBlock: (props: Record<string, unknown>) =>
      createElement('ProfileNameBlock', { ...props, testID: 'profile-name-block' }),
  },
} as unknown as Parameters<typeof mock.module>[1]);

mock.module('@/components/ui/Avatar', {
  exports: {
    Avatar: (props: Record<string, unknown>) =>
      createElement('Avatar', { ...props, testID: 'avatar' }),
  },
} as unknown as Parameters<typeof mock.module>[1]);

mock.module('@/lib/date', {
  exports: {
    formatPostDate: () => '2026. 8. 4.',
    formatTimelineTimestamp: () => '방금',
  },
} as unknown as Parameters<typeof mock.module>[1]);

mock.module('@/relay/RelayActorProvider', {
  exports: { useRelayActor: () => ({ revision: actorRevision }) },
} as unknown as Parameters<typeof mock.module>[1]);

mock.module('@/theme/ThemeProvider', {
  exports: {
    useTheme: () => ({ divider: '#dddddd', text: '#111111', textSecondary: '#666666' }),
  },
} as unknown as Parameters<typeof mock.module>[1]);

mock.module('@/theme/tokens', {
  exports: {
    radii: { md: 12, sm: 8 },
    spacing: { lg: 24, md: 16, sm: 12, xs: 8, xxs: 4 },
    typography: { sm: { fontSize: 14, lineHeight: 20 } },
  },
} as unknown as Parameters<typeof mock.module>[1]);

mock.module('./PostActionAuthentication', {
  exports: {
    usePostActionAuthentication: (enabled: boolean) => ({
      execution: { kind: enabled ? 'enabled' : 'disabled' },
      resolve: () => undefined,
    }),
  },
} as unknown as Parameters<typeof mock.module>[1]);

mock.module('./PostActionSurface', {
  exports: {
    PostActionSurface: (props: Record<string, unknown>) =>
      createElement('PostActionSurface', { ...props, testID: 'post-action-surface' }),
  },
} as unknown as Parameters<typeof mock.module>[1]);

mock.module('./PostBody', {
  exports: {
    PostBody: (props: Record<string, unknown>) =>
      createElement('PostBody', { ...props, testID: 'post-body' }),
  },
} as unknown as Parameters<typeof mock.module>[1]);

mock.module('./PostMediaViewer', {
  exports: {
    PostMediaViewer: (props: Record<string, unknown>) =>
      createElement('PostMediaViewer', { ...props, testID: 'post-media-viewer' }),
  },
} as unknown as Parameters<typeof mock.module>[1]);

mock.module('./PostReplyCoordinator', {
  exports: { usePostReplyBinding: () => replyBinding },
} as unknown as Parameters<typeof mock.module>[1]);

mock.module('./PostSourcePresentationView', {
  exports: {
    PostSourcePresentationView: (props: Record<string, unknown>) =>
      createElement('PostSourcePresentationView', {
        ...props,
        testID: 'post-source-presentation',
      }),
    PostSourcePreview: (props: Record<string, unknown>) =>
      createElement('PostSourcePreview', { ...props, testID: 'post-source-preview' }),
  },
} as unknown as Parameters<typeof mock.module>[1]);

mock.module('./ReplyComposerSurface', {
  exports: {
    ReplyComposerSurface: (props: Record<string, unknown>) =>
      createElement('ReplyComposerSurface', { ...props, testID: 'reply-composer-surface' }),
  },
} as unknown as Parameters<typeof mock.module>[1]);

mock.module('./replySurface', {
  exports: { getReplyProcessingState: (execution: { kind: string }) => execution.kind },
} as unknown as Parameters<typeof mock.module>[1]);

let PostLayout: typeof PostLayoutComponent;
let PostListItem: typeof PostListItemComponent;
let renderer: ReactTestRenderer | null = null;

before(async () => {
  ({ PostLayout } = await import('./PostLayout'));
  ({ PostListItem } = await import('./PostListItem'));
});

afterEach(async () => {
  if (renderer) {
    await act(async () => renderer?.unmount());
    renderer = null;
  }
  actorRevision = 0;
});

describe('Post Media Viewer production surface wiring', () => {
  it('Relay actor generation이 바뀌면 열린 Viewer를 닫는다', async () => {
    const originControl = { current: { focus: () => undefined } };
    const post = storyPost('post-actor', 'profile-author', 'content-actor');

    await render(createElement(PostLayout, { post: asLayoutKey(post) }));
    await openViewerFromBody(originControl);
    assert.equal(viewers().length, 1);

    actorRevision = 1;
    await update(createElement(PostLayout, { post: asLayoutKey(post) }));

    assert.equal(viewers().length, 0);
  });

  it('목록과 상세에서 identity·Sensitive unavailable·삭제 lifecycle로 열린 Viewer를 닫는다', async () => {
    const originControl = { current: { focus: () => undefined } };
    const first = storyPost('post-1', 'profile-1', 'content-1');

    await render(createElement(PostListItem, { post: asListItemKey(first) }));
    await openViewerFromBody(originControl);
    assert.equal(viewers().length, 1);

    const changedProfile = storyPost('post-1', 'profile-2', 'content-1');
    await update(createElement(PostListItem, { post: asListItemKey(changedProfile) }));
    assert.equal(viewers().length, 0);

    await openViewerFromBody(originControl);
    await act(async () => currentBody().props.onMediaUnavailable());
    assert.equal(viewers().length, 0);

    await openViewerFromBody(originControl);
    const listViewer = currentViewer();
    await act(async () => listViewer.props.actionBar.props.onDeleted());
    assert.equal(renderer?.toJSON(), null);

    let detailDeleted = 0;
    await render(
      createElement(PostLayout, {
        onDeleted: () => detailDeleted++,
        post: asLayoutKey(first),
      }),
    );
    await openViewerFromBody(originControl);
    assert.equal(viewers().length, 1);

    const changedContent = storyPost('post-1', 'profile-1', 'content-2');
    await update(
      createElement(PostLayout, {
        onDeleted: () => detailDeleted++,
        post: asLayoutKey(changedContent),
      }),
    );
    assert.equal(viewers().length, 0);

    await openViewerFromBody(originControl);
    await act(async () => currentViewer().props.actionBar.props.onDeleted());
    assert.equal(viewers().length, 0);
    assert.equal(detailDeleted, 1);
  });

  it('일반·Quote·pure Repost Viewer가 각 production surface의 기존 action target을 유지한다', async () => {
    const originControl = { current: { focus: () => undefined } };
    const ordinary = storyPost('ordinary', 'ordinary-profile', 'ordinary-content');

    await render(createElement(PostListItem, { post: asListItemKey(ordinary) }));
    await openViewerFromBody(originControl, 1);
    assertViewerPost(ordinary);
    assertViewerTarget('action-ordinary');
    assertViewerWideDetail('ordinary', 'ordinary-content');
    assert.equal(currentViewer().props.selectedIndex, 1);

    const source = storyPost('source', 'source-profile', 'source-content');
    const quote = {
      ...storyPost('quote', 'quote-profile', 'quote-content'),
      repostSource: source,
    };
    await update(createElement(PostListItem, { post: asListItemKey(quote) }));
    const quotePresentation = renderer!.root.findByProps({ testID: 'post-source-presentation' });
    await act(async () => quotePresentation.props.onMediaOpen(0, originControl));
    assertViewerPost(quote);
    assertViewerTarget('action-quote');
    assertViewerWideDetail('quote', 'quote-content');

    const pureRepost = {
      ...storyPost('repost', 'reposter-profile', null),
      repostSource: source,
    };
    await update(createElement(PostListItem, { post: asListItemKey(pureRepost) }));
    await openViewerFromBody(originControl);
    assertViewerPost(source);
    assertViewerTarget('action-source');
    assertViewerWideDetail('source', 'source-content');
    assert.equal(currentViewer().props.actionBar.props.reply.processing, 'disabled');
  });
});

async function render(element: ReturnType<typeof createElement>) {
  await act(async () => {
    renderer?.unmount();
    renderer = create(element, { createNodeMock: () => ({ focus: () => undefined }) });
  });
  assert.ok(renderer);
}

async function update(element: ReturnType<typeof createElement>) {
  assert.ok(renderer);
  await act(async () => renderer?.update(element));
}

async function openViewerFromBody(
  originControl: { current: { focus: () => void } },
  selectedIndex = 0,
) {
  await act(async () => currentBody().props.onMediaOpen(selectedIndex, originControl));
}

function currentBody() {
  assert.ok(renderer);
  return renderer.root.findByProps({ testID: 'post-body' });
}

function viewers() {
  assert.ok(renderer);
  return renderer.root.findAllByProps({ testID: 'post-media-viewer' });
}

function currentViewer() {
  const matches = viewers();
  assert.equal(matches.length, 1);
  return matches[0]!;
}

function assertViewerTarget(expectedId: string) {
  assert.equal(currentViewer().props.actionBar.props.socialActionTarget.id, expectedId);
}

function assertViewerPost(expectedPost: unknown) {
  assert.equal(currentViewer().props.post, expectedPost);
  assert.equal('bodyText' in currentViewer().props, false);
  assert.equal('contentId' in currentViewer().props, false);
  assert.equal('media' in currentViewer().props, false);
  assert.equal('profile' in currentViewer().props, false);
}

function assertViewerWideDetail(postId: string, contentId: string) {
  assert.equal(currentViewer().props.wideDetail.props.postId, postId);
  assert.equal(currentViewer().props.wideDetail.props.contentId, contentId);
  assert.equal(typeof currentViewer().props.wideDetail.props.onUnavailable, 'function');
}

function asListItemKey(value: unknown): PostListItem_post$key {
  return value as PostListItem_post$key;
}

function asLayoutKey(value: unknown): PostLayout_post$key {
  return value as PostLayout_post$key;
}

function storyPost(postId: string, profileId: string, contentId: string | null) {
  return {
    actionSurface: { id: `action-${postId}` },
    content: contentId
      ? {
          bodyText: `${postId} 본문`,
          document: { body: { attrs: { sensitiveMedia: false }, content: [], type: 'doc' } },
          id: contentId,
          media: [
            {
              altText: `${postId} 이미지`,
              id: `media-${contentId}`,
              url: `https://media.example/${contentId}.webp`,
            },
          ],
        }
      : null,
    createdAt: '2026-08-04T00:00:00.000Z',
    id: postId,
    profile: {
      avatar: null,
      displayName: profileId,
      handle: profileId,
      id: profileId,
      relativeHandle: `@${profileId}`,
    },
    replyParent: null,
    replySurface: null,
    repostSource: null,
    visibility: 'PUBLIC',
  };
}
