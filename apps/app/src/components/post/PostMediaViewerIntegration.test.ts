import assert from 'node:assert/strict';
import { afterEach, before, describe, it, mock } from 'node:test';
import { createElement } from 'react';
import { act, create } from 'react-test-renderer';
import type { ReactElement } from 'react';
import type { ReactTestRenderer } from 'react-test-renderer';
import type { PostLayout_post$key } from './__generated__/PostLayout_post.graphql';
import type { PostListItem_post$key } from './__generated__/PostListItem_post.graphql';
import type { PostLayout as PostLayoutComponent } from './PostLayout';
import type { PostListItem as PostListItemComponent } from './PostListItem';
import type { PostMediaViewerHostProvider as HostProviderComponent } from './PostMediaViewerHost';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let actorRevision = 0;
let animationFrames: FrameRequestCallback[] = [];
let queriedSurfacePostId: string | null = null;
let queryPosts = new Map<string, ReturnType<typeof hostPost>>();
let replyPostIds: string[] = [];
let renderer: ReactTestRenderer | null = null;
let viewportWidth = 767;

Object.assign(globalThis, {
  cancelAnimationFrame: () => undefined,
  requestAnimationFrame: (callback: FrameRequestCallback) => {
    animationFrames.push(callback);
    return animationFrames.length;
  },
});

mock.module('expo-router', {
  exports: {
    Link: ({ children }: { children?: unknown }) => children,
    useRouter: () => ({ push: () => undefined }),
  },
} as unknown as Parameters<typeof mock.module>[1]);

mock.module('react-native', {
  exports: {
    Image: 'Image',
    Modal: 'Modal',
    PanResponder: { create: () => ({ panHandlers: {} }) },
    Platform: { OS: 'web' },
    Pressable: 'Pressable',
    ScrollView: 'ScrollView',
    StyleSheet: { create: <T>(styles: T) => styles },
    Text: 'Text',
    View: 'View',
    useWindowDimensions: () => ({ height: 800, width: viewportWidth }),
  },
} as unknown as Parameters<typeof mock.module>[1]);

mock.module('react-relay', {
  exports: {
    graphql: () => ({}),
    useFragment: (_fragment: unknown, key: unknown) => key,
    useLazyLoadQuery: (_query: unknown, variables: { surfacePostId: string }) => {
      queriedSurfacePostId = variables.surfacePostId;
      return queryPosts.get(variables.surfacePostId) ?? { surface: null };
    },
  },
} as unknown as Parameters<typeof mock.module>[1]);

mock.module(require.resolve('lucide-react-native'), {
  exports: {
    ChevronLeftIcon: 'ChevronLeftIcon',
    ChevronRightIcon: 'ChevronRightIcon',
    MessageCircle: 'MessageCircle',
    XIcon: 'XIcon',
  },
} as unknown as Parameters<typeof mock.module>[1]);

mock.module('@/components/RouteBoundary', {
  exports: { RouteBoundary: ({ children }: { children?: unknown }) => children },
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
  exports: { formatPostDate: () => '2026. 8. 4.', formatTimelineTimestamp: () => '방금' },
} as unknown as Parameters<typeof mock.module>[1]);

mock.module('@/relay/RelayActorProvider', {
  exports: { useRelayActor: () => ({ revision: actorRevision }) },
} as unknown as Parameters<typeof mock.module>[1]);

mock.module('@/theme/ThemeProvider', {
  exports: {
    useTheme: () => ({
      background: '#ffffff',
      border: '#dddddd',
      card: '#fafafa',
      divider: '#dddddd',
      surface: '#111111',
      text: '#111111',
      textSecondary: '#666666',
    }),
  },
} as unknown as Parameters<typeof mock.module>[1]);

mock.module('@/theme/tokens', {
  exports: {
    breakpoints: { compact: 768 },
    iconSizes: { 24: 24 },
    radii: { full: 999, lg: 16, md: 12, sm: 8 },
    spacing: { lg: 24, md: 16, sm: 12, xl: 32, xs: 8, xxl: 40, xxs: 4 },
    typography: {
      md: { fontSize: 16, lineHeight: 24 },
      sm: { fontSize: 14, lineHeight: 20 },
    },
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

const replyBinding = {
  expanded: false,
  onPostCreated: () => undefined,
  onPress: () => undefined,
  onRequestClose: () => undefined,
  owner: 'list',
  profile: null,
  surfaceRef: { current: null },
};

mock.module('./PostReplyCoordinator', {
  exports: {
    usePostReplyBinding: (postId: string) => {
      replyPostIds.push(postId);
      return replyBinding;
    },
  },
} as unknown as Parameters<typeof mock.module>[1]);

mock.module('./PostMediaViewerThread', {
  exports: {
    PostMediaViewerThread: (props: Record<string, unknown>) =>
      createElement('PostMediaViewerThread', {
        ...props,
        testID: 'post-media-viewer-thread',
      }),
  },
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

let HostProvider: typeof HostProviderComponent;
let PostLayout: typeof PostLayoutComponent;
let PostListItem: typeof PostListItemComponent;

before(async () => {
  ({ PostMediaViewerHostProvider: HostProvider } = await import('./PostMediaViewerHost'));
  ({ PostLayout } = await import('./PostLayout'));
  ({ PostListItem } = await import('./PostListItem'));
});

afterEach(async () => {
  if (renderer) {
    await act(async () => renderer?.unmount());
    renderer = null;
  }
  actorRevision = 0;
  animationFrames = [];
  queriedSurfacePostId = null;
  queryPosts = new Map();
  replyPostIds = [];
  viewportWidth = 767;
});

describe('Post Media Viewer Host production wiring', () => {
  it('ordinary·Quote·pure Repost launcher가 surface와 Media owner identity를 보존한다', async () => {
    const originControl = { current: { focus: () => undefined } };
    const ordinary = storyPost('ordinary', 'ordinary-content');
    queryPosts.set(ordinary.id, hostPost(ordinary));

    await renderHost(createElement(PostListItem, { post: asListItemKey(ordinary) }));
    await openFromBody(originControl, 1);
    assert.equal(queriedSurfacePostId, 'ordinary');
    assert.equal(currentImage().props.source.uri, 'https://media.example/ordinary-content-2.webp');
    await closeViewer();

    const source = storyPost('source', 'source-content');
    const quote = { ...storyPost('quote', 'quote-content'), repostSource: source };
    queryPosts.set(quote.id, hostPost(storyPost('quote', 'quote-content')));
    await updateHost(createElement(PostListItem, { post: asListItemKey(quote) }));
    await act(async () => byTestId('post-source-presentation').props.onMediaOpen(0, originControl));
    assert.equal(queriedSurfacePostId, 'quote');
    await closeViewer();

    const pureRepost = { ...storyPost('repost', null), repostSource: source };
    queryPosts.set(pureRepost.id, hostPost(pureRepost));
    queryPosts.set(source.id, hostPost(source));
    await updateHost(createElement(PostListItem, { post: asListItemKey(pureRepost) }));
    await openFromBody(originControl);
    assert.equal(queriedSurfacePostId, 'repost');
    assert.equal(currentImage().props.source.uri, 'https://media.example/source-content-1.webp');
    const viewerActionSurface = byTestId('post-media-viewer-dialog').findByProps({
      testID: 'post-action-surface',
    });
    assert.equal(viewerActionSurface.props.reply.processing, 'disabled');
    assert.equal(viewerActionSurface.props.socialActionTarget.id, 'action-source');
    assert.equal(replyPostIds.at(-1), 'repost');

    viewportWidth = 1024;
    await updateHost(createElement(PostListItem, { post: asListItemKey(pureRepost) }));
    const viewerThread = byTestId('post-media-viewer-thread');
    assert.equal(viewerThread.props.mediaOwnerPostId, 'source');
    assert.equal(viewerThread.props.replyAvailable, false);
    assert.equal(viewerThread.props.replySurfacePostId, 'repost');
  });

  it('Relay actor generation이 바뀌면 열린 Viewer와 이전 query projection을 닫는다', async () => {
    const post = storyPost('actor-post', 'actor-content');
    queryPosts.set(post.id, hostPost(post));
    await renderHost(createElement(PostLayout, { post: asLayoutKey(post) }));
    await openFromBody({ current: { focus: () => undefined } });
    assert.ok(byTestId('post-media-viewer-dialog'));

    actorRevision = 1;
    await updateHost(createElement(PostLayout, { post: asLayoutKey(post) }));
    assert.equal(findByTestId('post-media-viewer-dialog').length, 0);
  });

  it('같은 Content unavailable 복구는 state를 유지하고 다른 revision은 original index로 reset한다', async () => {
    const post = storyPost('revision-post', 'content-1');
    queryPosts.set(post.id, hostPost(post));
    await renderHost(createElement(PostLayout, { post: asLayoutKey(post) }));
    await openFromBody({ current: { focus: () => undefined } });
    await act(async () => pressable('다음 이미지').props.onPress());
    await act(async () => currentImage().props.onError());
    assert.ok(byTestId('post-media-viewer-error-media-content-1-2'));

    queryPosts.set(post.id, hostPost({ ...post, content: null }));
    await updateHost(createElement(PostLayout, { post: asLayoutKey(post) }));
    assert.ok(byTestId('post-media-viewer-unavailable'));

    queryPosts.set(post.id, hostPost(post));
    await updateHost(createElement(PostLayout, { post: asLayoutKey(post) }));
    assert.ok(byTestId('post-media-viewer-error-media-content-1-2'));

    const nextRevision = storyPost('revision-post', 'content-2');
    queryPosts.set(post.id, hostPost(nextRevision));
    await updateHost(createElement(PostLayout, { post: asLayoutKey(nextRevision) }));
    assert.equal(currentImage().props.source.uri, 'https://media.example/content-2-1.webp');
    assert.equal(findByTestId('post-media-viewer-error-media-content-1-2').length, 0);
  });
});

async function renderHost(child: ReactElement) {
  await act(async () => {
    renderer = create(createElement(HostProvider, null, child));
  });
}

async function updateHost(child: ReactElement) {
  assert.ok(renderer);
  await act(async () => renderer?.update(createElement(HostProvider, null, child)));
}

async function openFromBody(originControl: { current: { focus: () => void } }, selectedIndex = 0) {
  await act(async () => byTestId('post-body').props.onMediaOpen(selectedIndex, originControl));
}

async function closeViewer() {
  await act(async () => pressable('이미지 뷰어 닫기').props.onPress());
}

function byTestId(testID: string) {
  assert.ok(renderer);
  return renderer.root.findByProps({ testID });
}

function findByTestId(testID: string) {
  assert.ok(renderer);
  return renderer.root.findAllByProps({ testID });
}

function pressable(accessibilityLabel: string) {
  assert.ok(renderer);
  return renderer.root.find((node) => node.props.accessibilityLabel === accessibilityLabel);
}

function currentImage() {
  return byTestId('post-media-viewer-image');
}

function asListItemKey(value: unknown): PostListItem_post$key {
  return value as PostListItem_post$key;
}

function asLayoutKey(value: unknown): PostLayout_post$key {
  return value as PostLayout_post$key;
}

type StoryPostFixture = Omit<ReturnType<typeof storyPost>, 'repostSource'> & {
  repostSource: StoryPostFixture | null;
};

function hostPost(post: StoryPostFixture): { surface: Record<string, unknown> } {
  return { surface: hostPostNode(post) };
}

function hostPostNode(post: StoryPostFixture): Record<string, unknown> {
  return {
    __typename: 'Post',
    actionSurface: post.actionSurface,
    content: post.content ? { id: post.content.id } : null,
    id: post.id,
    repostSource: post.repostSource ? hostPostNode(post.repostSource) : null,
    state: 'ACTIVE',
    viewer: post,
  };
}

function storyPost(postId: string, contentId: string | null) {
  return {
    actionSurface: { id: `action-${postId}` },
    content: contentId
      ? {
          bodyText: `${postId} 본문`,
          contentWarning: null,
          document: { body: { attrs: { sensitiveMedia: false }, content: [], type: 'doc' } },
          id: contentId,
          media: [1, 2, 3].map((index) => ({
            altText: `${index}번째 이미지`,
            id: `media-${contentId}-${index}`,
            url: `https://media.example/${contentId}-${index}.webp`,
          })),
        }
      : null,
    createdAt: '2026-08-04T00:00:00.000Z',
    id: postId,
    profile: {
      avatar: null,
      displayName: postId,
      handle: postId,
      id: `profile-${postId}`,
      relativeHandle: `@${postId}`,
    },
    replyParent: null,
    replySurface: null,
    repostSource: null,
    visibility: 'PUBLIC',
  };
}
