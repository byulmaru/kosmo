import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { afterEach, before, mock, test } from 'node:test';
import { createElement } from 'react';
import { act, create } from 'react-test-renderer';
import type { ReactNode } from 'react';
import type { ReactTestInstance, ReactTestRenderer } from 'react-test-renderer';
import type { PostActionBar as PostActionBarExport } from './PostActionBar';
import type { PostActionControl as PostActionControlExport } from './PostActionControl';
import type { PostListItem as PostListItemExport } from './PostListItem';
import type { PostThreadLayout as PostThreadLayoutExport } from './PostThreadLayout';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const platform = { OS: 'web' };
const theme = { borderSubtle: 'border', primary: 'primary', textSecondary: 'secondary' };
const require = createRequire(import.meta.url);
const nativePlatforms = [
  ['ios', 44],
  ['android', 48],
] as const;
const threadPlatforms = [
  ['web', 32],
  ['ios', 40],
  ['android', 40],
] as const;

const StubIcon = (props: { color: string; fill?: string; size: number; strokeWidth?: number }) =>
  createElement('Icon', props);

const renderedPost = {
  actionSurface: {},
  content: {
    bodyText: '본문',
    contentWarning: null,
    document: null,
    id: 'content',
    media: [],
  },
  createdAt: '2026-09-12T00:00:00Z',
  id: 'post',
  profile: {
    avatar: null,
    displayName: '코스모',
    handle: 'kosmo',
    id: 'profile',
    relativeHandle: '@kosmo',
  },
  replyParent: null,
  repostSource: null,
};

const mockModule = (specifier: string | URL, exports: object) =>
  mock.module(specifier, { exports } as unknown as Parameters<typeof mock.module>[1]);

type PressableProps = {
  children?: ReactNode | ((state: { pressed: boolean }) => ReactNode);
  [key: string]: unknown;
};

function MockPressable({ children, ...props }: PressableProps) {
  return createElement(
    'Pressable',
    props,
    typeof children === 'function' ? children({ pressed: false }) : children,
  );
}

mockModule('react-native', {
  ActivityIndicator: 'ActivityIndicator',
  Platform: platform,
  Pressable: MockPressable,
  StyleSheet: { create: <T>(styles: T) => styles },
  Text: 'Text',
  View: 'View',
});
mockModule('react-relay', {
  graphql: () => ({}),
  useFragment: () => renderedPost,
});
mockModule('expo-router', {
  Link: ({ children }: { children: ReactNode }) => children,
  useRouter: () => ({ push: () => undefined }),
});
mockModule(require.resolve('lucide-react-native'), {
  Bookmark: StubIcon,
  HeartPlus: StubIcon,
  MessageCircle: StubIcon,
  MoreHorizontal: StubIcon,
  Pin: StubIcon,
});
mockModule('@/theme/ThemeProvider', { useTheme: () => theme });
mockModule('@/theme/tokens', {
  fontFamilies: { ui: 'ui' },
  radii: { full: 999 },
  spacing: { lg: 16, md: 12, sm: 8, xs: 4, xxl: 32, xxxl: 48 },
  typography: { md: { fontSize: 16 }, sm: { fontSize: 14, lineHeight: 20 } },
});
mockModule(new URL('./PostBookmarkAction.tsx', import.meta.url), {
  usePostBookmarkAction: () => null,
});
mockModule(new URL('./PostDeletionAction.tsx', import.meta.url), {
  PostDeletionAction: 'PostDeletionAction',
});
mockModule(new URL('./ReactionAction.tsx', import.meta.url), { ReactionAction: 'ReactionAction' });
mockModule(new URL('./RepostAction.tsx', import.meta.url), { RepostAction: 'RepostAction' });
mockModule('@/components/profile/ProfileNameBlock', {
  ProfileNameBlock: 'ProfileNameBlock',
});
mockModule('@/components/ui/Avatar', { Avatar: 'Avatar' });
mockModule(new URL('./PostActionSurface.tsx', import.meta.url), {
  PostActionSurface: 'PostActionSurface',
});
mockModule(new URL('./PostBody.tsx', import.meta.url), { PostBody: 'PostBody' });
mockModule(new URL('./PostComposerCoordinator.tsx', import.meta.url), {
  usePostComposerBinding: () => undefined,
});
mockModule(new URL('./PostMediaViewerHost.tsx', import.meta.url), {
  usePostMediaViewerHost: () => () => undefined,
});
mockModule(new URL('./PostReplySurface.tsx', import.meta.url), {
  usePostReplySurface: () => ({
    binding: null,
    owner: 'list',
    reply: undefined,
    replySurface: null,
  }),
});
mockModule(new URL('./PostSourcePresentationView.tsx', import.meta.url), {
  PostSourcePresentationView: 'PostSourcePresentationView',
});
mockModule(new URL('./ReplyComposerSurface.tsx', import.meta.url), {
  ReplyComposerSurface: 'ReplyComposerSurface',
});
mockModule('@/lib/date', { formatTimelineTimestamp: () => '방금 전' });

let PostActionControl: typeof PostActionControlExport;
let PostActionBar: typeof PostActionBarExport;
let PostListItem: typeof PostListItemExport;
let PostThreadLayout: typeof PostThreadLayoutExport;
let renderer: ReactTestRenderer | null = null;

before(async () => {
  ({ PostActionControl } = await import('./PostActionControl'));
  ({ PostActionBar } = await import('./PostActionBar'));
  ({ PostListItem } = await import('./PostListItem'));
  ({ PostThreadLayout } = await import('./PostThreadLayout'));
});

afterEach(async () => {
  await act(async () => renderer?.unmount());
  renderer = null;
  platform.OS = 'web';
});

function flattenStyle(style: unknown): Record<string, unknown> {
  if (!Array.isArray(style)) {
    return style && typeof style === 'object' ? (style as Record<string, unknown>) : {};
  }
  return Object.assign({}, ...style.flat(Infinity).filter(Boolean));
}

function findByTestID(root: ReactTestInstance, testID: string) {
  return root.findByProps({ testID });
}

function findByType(root: ReactTestInstance, type: string) {
  const match = root.findAll((node) => (node.type as unknown) === type)[0];
  assert.ok(match, `${type} must be rendered`);
  return match;
}

async function renderControl(props: Parameters<typeof PostActionControlExport>[0]) {
  await act(async () => {
    renderer?.unmount();
    renderer = create(createElement(PostActionControl, props));
  });
  assert.ok(renderer);
  return renderer.root;
}

async function renderBar(props: Parameters<typeof PostActionBarExport>[0]) {
  await act(async () => {
    renderer?.unmount();
    renderer = create(createElement(PostActionBar, props));
  });
  assert.ok(renderer);
  return renderer.root;
}

async function renderListItem(props: Parameters<typeof PostListItemExport>[0]) {
  await act(async () => {
    renderer?.unmount();
    renderer = create(createElement(PostListItem, props));
  });
  assert.ok(renderer);
  return renderer.root;
}

async function renderThreadLayout() {
  await act(async () => {
    renderer?.unmount();
    renderer = create(
      createElement(PostThreadLayout, {
        ancestors: [
          { connectedToPrevious: false, id: 'ancestor-root', post: {} },
          { connectedToPrevious: true, id: 'ancestor-child', post: {} },
        ],
        current: { connectedToPrevious: true, id: 'current', post: {} },
        descendants: [],
        renderPost: ({ role }) => createElement('Post', { role }),
      }),
    );
  });
  assert.ok(renderer);
  return renderer.root;
}

test('Native action controls use platform targets and keep the 28px visual layer', async () => {
  for (const [os, targetSize] of nativePlatforms) {
    platform.OS = os;
    const root = await renderControl({
      accessibilityLabel: '저장',
      active: true,
      alignVisualToEnd: true,
      icon: StubIcon,
      onPress: () => undefined,
      testID: 'bookmark',
    });
    const slot = findByType(root, 'View');
    const button = findByTestID(root, 'post-action-bookmark');
    const visual = findByTestID(root, 'post-action-bookmark-icon');
    const glyph = findByTestID(root, 'post-action-bookmark-glyph');
    const icon = findByType(root, 'Icon');

    assert.equal(flattenStyle(slot.props.style).height, targetSize);
    assert.equal(flattenStyle(slot.props.style).width, 50);
    assert.equal(button.props.disabled, false);
    assert.deepEqual(button.props.accessibilityState, {
      busy: false,
      disabled: false,
      selected: true,
    });
    const buttonStyle = flattenStyle(button.props.style({ pressed: false }));
    assert.equal(buttonStyle.justifyContent, 'flex-end');
    assert.equal(buttonStyle.top, 0);
    assert.equal(buttonStyle.bottom, 0);
    assert.equal(button.props.hitSlop, undefined);
    assert.equal(flattenStyle(visual.props.style).height, 28);
    assert.equal(flattenStyle(visual.props.style).width, 28);
    assert.equal(flattenStyle(glyph.props.style).height, 16);
    assert.equal(flattenStyle(glyph.props.style).width, 16);
    assert.equal(icon.props.size, 16);
  }
});

test('Native More targets expand and preserve expanded state', async () => {
  for (const [os, targetSize] of nativePlatforms) {
    platform.OS = os;
    const root = await renderControl({
      accessibilityLabel: '더 보기',
      alignToEnd: true,
      icon: StubIcon,
      menuExpanded: true,
      onPress: () => undefined,
      popupRole: 'menu',
      testID: 'more',
    });
    const slot = findByType(root, 'View');
    const button = findByTestID(root, 'post-action-more');
    const visual = findByTestID(root, 'post-action-more-icon');

    assert.equal(flattenStyle(slot.props.style).height, targetSize);
    assert.equal(flattenStyle(slot.props.style).width, targetSize);
    assert.equal(flattenStyle(visual.props.style).height, 28);
    assert.equal(flattenStyle(visual.props.style).width, 28);
    const buttonStyle = flattenStyle(button.props.style({ pressed: false }));
    assert.equal(buttonStyle.justifyContent, 'flex-end');
    assert.equal(buttonStyle.top, 0);
    assert.equal(buttonStyle.bottom, 0);
    assert.equal(button.props.hitSlop, undefined);
    assert.deepEqual(button.props.accessibilityState, {
      busy: false,
      disabled: false,
      expanded: true,
    });
  }
});

test('Native count actions keep the compact 16px icon slot inside the social target', async () => {
  platform.OS = 'android';
  const root = await renderControl({
    accessibilityLabel: '재게시',
    count: 12_345,
    icon: StubIcon,
    onPress: () => undefined,
    testID: 'repost',
  });
  const slot = findByType(root, 'View');
  const visual = findByTestID(root, 'post-action-repost-icon');
  const glyph = findByTestID(root, 'post-action-repost-glyph');

  assert.equal(flattenStyle(slot.props.style).width, 50);
  assert.equal(flattenStyle(visual.props.style).width, 16);
  assert.equal(flattenStyle(visual.props.style).height, 16);
  assert.equal(
    flattenStyle(findByTestID(root, 'post-action-repost').props.style({ pressed: false }))
      .justifyContent,
    'center',
  );
  assert.equal(flattenStyle(glyph.props.style).width, 16);
  assert.equal(findByType(root, 'Text').children[0], '12.3K');
});

test('Native PostActionBar wiring keeps target sizes and the zero-gap trailing group', async () => {
  for (const [os, targetSize] of nativePlatforms) {
    platform.OS = os;
    const root = await renderBar({
      bookmark: {
        accessibilityLabel: '북마크',
        hasBookmarked: false,
        onPress: () => undefined,
        processing: 'default',
      },
      more: {
        accessibilityLabel: '더 보기',
        menuExpanded: false,
        onPress: () => undefined,
        popupRole: 'menu',
      },
      post: null,
    });
    const toolbar = root.findByProps({ accessibilityRole: 'toolbar' });
    const bookmark = findByTestID(root, 'post-action-bookmark');
    const more = findByTestID(root, 'post-action-more');
    const bookmarkSlot = bookmark.parent;
    const moreSlot = more.parent;
    assert.ok(bookmarkSlot);
    assert.ok(moreSlot);
    assert.equal(flattenStyle(toolbar.props.style).height, targetSize);
    assert.equal(flattenStyle(bookmarkSlot.props.style).height, targetSize);
    assert.equal(flattenStyle(bookmarkSlot.props.style).width, 50);
    assert.equal(flattenStyle(moreSlot.props.style).height, targetSize);
    assert.equal(flattenStyle(moreSlot.props.style).width, targetSize);
    assert.equal(flattenStyle(bookmark.props.style({ pressed: false })).justifyContent, 'flex-end');
    assert.equal(flattenStyle(more.props.style({ pressed: false })).justifyContent, 'flex-end');
    assert.equal(bookmark.props.hitSlop, undefined);
    assert.equal(more.props.hitSlop, undefined);
    assert.ok(
      root.findAll((node) => flattenStyle(node.props.style).gap === 0).length > 0,
      'Native trailing group must use zero gap',
    );
  }
});

test('PostListItem Native production cards use the mobile 16px inset while Web stays at 8px', async () => {
  for (const [os, expectedPadding, expectedBottom] of [
    ['ios', 16, 4],
    ['android', 16, 4],
    ['web', 8, 8],
  ] as const) {
    platform.OS = os;
    const root = await renderListItem({ post: {} as never, showDivider: false });
    const card = root.findByProps({ role: 'article' });
    assert.equal(flattenStyle(card.props.style).paddingHorizontal, expectedPadding);
    assert.equal(flattenStyle(card.props.style).paddingBottom, expectedBottom);
  }
});

test('PostThreadLayout aligns every connector to the platform-specific avatar axis', async () => {
  for (const [os, expectedConnectorLeft] of threadPlatforms) {
    platform.OS = os;
    const root = await renderThreadLayout();
    const currentPost = findByType(
      root.findByProps({ testID: 'post-thread-current-current' }),
      'Post',
    );

    assert.equal(flattenStyle(currentPost.parent?.props.style).paddingLeft, os === 'web' ? 8 : 16);
    assert.equal(
      flattenStyle(
        findByTestID(root, 'post-thread-connector-ancestor-root-ancestor-child-before').props.style,
      ).left,
      expectedConnectorLeft,
    );
    assert.equal(
      flattenStyle(
        findByTestID(root, 'post-thread-connector-ancestor-child-current-before').props.style,
      ).left,
      expectedConnectorLeft,
    );
    assert.equal(
      flattenStyle(
        findByTestID(root, 'post-thread-connector-ancestor-child-current-after').props.style,
      ).left,
      expectedConnectorLeft,
    );
  }
});

test('Native pending and disabled controls expose blocking state to the host', async () => {
  platform.OS = 'android';

  const pending = await renderControl({
    accessibilityLabel: '재게시',
    icon: StubIcon,
    onPress: () => undefined,
    processing: 'pending',
    testID: 'repost',
  });
  const pendingButton = findByTestID(pending, 'post-action-repost');
  assert.equal(pendingButton.props.disabled, true);
  assert.deepEqual(pendingButton.props.accessibilityState, {
    busy: true,
    disabled: true,
  });
  assert.ok(findByTestID(pending, 'post-action-repost-spinner'));

  const disabled = await renderControl({
    accessibilityLabel: '반응',
    icon: StubIcon,
    onPress: () => undefined,
    processing: 'disabled',
    testID: 'reaction',
  });
  const disabledButton = findByTestID(disabled, 'post-action-reaction');
  assert.equal(disabledButton.props.disabled, true);
  assert.deepEqual(disabledButton.props.accessibilityState, {
    busy: false,
    disabled: true,
  });
});
