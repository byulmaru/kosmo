import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { after, afterEach, before, mock, test } from 'node:test';
import { act, createElement, Fragment } from 'react';
import type { TestContext } from 'node:test';
import type { ComponentType, ReactNode } from 'react';
import type { ActionMenu as ActionMenuExport } from '../ui/ActionMenu';
import type { PostListItem_post$key } from './__generated__/PostListItem_post.graphql';
import type { PostListItem as PostListItemExport } from './PostListItem';

type HostProps = Record<string, unknown> & { style?: unknown };
type ActionMenuComponent = typeof ActionMenuExport;
type PostListItemComponent = typeof PostListItemExport;
type NativeHarness = {
  cleanup(): void;
  modalDidDismiss(): void;
  nativeExports: Record<string, unknown> & {
    Pressable: ComponentType<Record<string, unknown>>;
    Text: ComponentType<Record<string, unknown>>;
  };
  render(element: ReactNode): void;
  responderTag(): number | undefined;
  tagByAccessibilityLabel(label: string): number | undefined;
  tagByTestID(testID: string): number | undefined;
  tagByViewName(name: string): number | undefined;
  touchCancel(): void;
  touchEnd(): void;
  touchStart(tag: number): void;
  unmount(): void;
  viewProps(tag: number): HostProps | undefined;
};

const nativeHarness = createRequire(import.meta.url)(
  './PostListItem.native.harness.cjs',
) as NativeHarness;
const native = nativeHarness.nativeExports;
const pressedColor = 'post-list-item-pressed-marker';
let ActionMenu: ActionMenuComponent;
let PostListItem: PostListItemComponent;
let selections: string[] = [];

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const mockModule = (specifier: string | URL, exports: object) =>
  mock.module(specifier, { exports } as unknown as Parameters<typeof mock.module>[1]);

mockModule('react-native', native);
mockModule('react-native-svg', {
  Circle: () => null,
  G: () => null,
  Path: () => null,
  Svg: () => null,
});
mockModule('react-native-safe-area-context', {
  useSafeAreaInsets: () => ({ bottom: 0, left: 0, right: 0, top: 0 }),
});
mockModule('expo-router', {
  Link: ({ children }: { children?: ReactNode }) => createElement(Fragment, null, children),
  useRouter: () => ({ push: () => undefined }),
});
mockModule('lucide-react-native', { MessageCircle: () => null, Pin: () => null });
mockModule('react-relay', {
  graphql: () => ({}),
  useFragment: (_fragment: unknown, key: unknown) => key,
});

const theme = {
  backgroundCanvas: 'canvas',
  backgroundElevated: 'elevated',
  borderDefault: 'border-default',
  borderSubtle: 'border-subtle',
  borderStrong: 'border-strong',
  danger: 'danger',
  feedbackDangerOnSubtle: 'danger-on-subtle',
  foregroundPrimary: 'foreground-primary',
  overlayScrim: 'scrim',
  stateHover: 'hover',
  statePressed: 'pressed',
  statePressedSubtle: pressedColor,
  textSecondary: 'text-secondary',
};

mockModule('@/theme/ThemeProvider', {
  useElevation: () => ({ floating: { boxShadow: 'none' }, overlay: {} }),
  useReducedMotion: () => true,
  useTheme: () => theme,
});
mockModule('@/theme/tokens', {
  borderWidths: { 1: 1 },
  fontFamilies: { content: 'content', ui: 'ui' },
  iconSizes: { 18: 18, 20: 20 },
  layoutRecipes: { actionMenuSurface: {} },
  motion: {
    duration: { fast: 0, standard: 0 },
    easingPoints: { exit: [0, 0, 1, 1], standard: [0, 0, 1, 1] },
  },
  radii: { full: 999, md: 8, sm: 4 },
  radius: { 12: 12, 16: 16, full: 999 },
  space: { 4: 4, 8: 8, 12: 12, 16: 16 },
  spacing: { lg: 16, md: 12, sm: 8, xs: 4, xxxl: 24 },
  textStyles: { uiCopyM: {}, uiCopyS: {}, uiHeadingS: {}, uiLabelL: {} },
  typography: { sm: {} },
});

mockModule('@/theme/useOverlayMotion', {
  useOverlayMotion: (visible: boolean) => ({
    mounted: visible,
    progress: { interpolate: () => 1 },
  }),
});
mockModule('@/components/profile/ProfileNameBlock', { ProfileNameBlock: () => null });
mockModule('@/components/ui/Avatar', { Avatar: () => null });
mockModule('@/components/ui/TimestampText', { TimestampText: () => null });
mockModule('@/lib/date', { formatTimelineTimestamp: () => 'timestamp' });
mockModule('./PostBody', { PostBody: () => null });
mockModule('./PostMediaViewerHost', { usePostMediaViewerHost: () => () => undefined });
mockModule('./PostReplySurface', {
  usePostReplySurface: () => ({ reply: undefined, replySurface: null }),
});
mockModule('./PostSourcePresentationView', {
  PostSourcePresentationView: () => null,
  PostSourcePreview: () => null,
});
mockModule('./PostActionSurface', {
  PostActionSurface: () =>
    createElement(ActionMenu, {
      accessibilityLabel: 'Post actions',
      items: [
        {
          accessibilityLabel: 'Active menu item',
          key: 'active',
          label: 'Active item',
          onSelect: () => selections.push('active'),
        },
        {
          accessibilityLabel: 'Disabled menu item',
          disabled: true,
          key: 'disabled',
          label: 'Disabled item',
          onSelect: () => selections.push('disabled'),
        },
      ],
      renderTrigger: ({ onPress }: { onPress: () => void }) =>
        createElement(
          native.Pressable,
          { accessibilityLabel: 'Open post actions', onPress, testID: 'post-action-menu-trigger' },
          createElement(native.Text, null, 'More'),
        ),
    }),
});

before(async () => {
  ({ ActionMenu } = await import('../ui/ActionMenu'));
  ({ PostListItem } = await import('./PostListItem'));
});

afterEach(async () => {
  await act(async () => nativeHarness.unmount());
  selections = [];
});

after(() => nativeHarness.cleanup());

const postData = {
  actionSurface: {},
  content: {
    bodyText: 'Post body',
    contentWarning: null,
    document: null,
    id: 'content-1',
    media: [],
  },
  createdAt: '2026-10-14T00:00:00.000Z',
  id: 'post-1',
  profile: {
    avatar: null,
    displayName: 'Profile',
    handle: 'profile',
    id: 'profile-1',
    relativeHandle: '@profile',
    viewerState: { profileBlock: null },
  },
  replyParent: null,
  repostSource: null,
};
const post = postData as unknown as PostListItem_post$key;

function feedbackIsPressed(): boolean {
  const tag = nativeHarness.tagByTestID('post-list-item-feedback');
  assert.ok(tag, 'PostListItem should render its feedback host');
  const props = nativeHarness.viewProps(tag);
  assert.ok(props, 'PostListItem feedback host should retain its native props');
  const style = props.style;
  const entries = Array.isArray(style) ? style.flat(Infinity) : [style];
  return entries.some(
    (entry) =>
      entry !== null &&
      typeof entry === 'object' &&
      'backgroundColor' in entry &&
      entry.backgroundColor === pressedColor,
  );
}

function assertFeedbackRest() {
  assert.equal(feedbackIsPressed(), false);
}

function requiredTag(tag: number | undefined, description: string): number {
  assert.ok(tag, `Expected rendered native host: ${description}`);
  return tag;
}

async function mountPost(t: TestContext, postKey = post) {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  await renderPost(postKey);
}

async function renderPost(postKey = post) {
  assert.ok(PostListItem);
  await act(async () =>
    nativeHarness.render(
      createElement(PostListItem, { post: postKey, presentation: 'mobile', showDivider: false }),
    ),
  );
}

async function touchDown(tag: number) {
  await act(async () => nativeHarness.touchStart(tag));
}

async function release(t: TestContext) {
  await act(async () => {
    nativeHarness.touchEnd();
    t.mock.timers.runAll();
  });
}

async function cancel(t: TestContext) {
  await act(async () => {
    nativeHarness.touchCancel();
    t.mock.timers.runAll();
  });
}

async function openMenu(t: TestContext) {
  const triggerTag = requiredTag(
    nativeHarness.tagByTestID('post-action-menu-trigger'),
    'menu trigger',
  );
  await touchDown(triggerTag);
  assert.equal(nativeHarness.responderTag(), triggerTag);
  await release(t);
  const modalTag = nativeHarness.tagByViewName('RCTModalHostView');
  assert.ok(modalTag, 'ActionMenu should mount its native Modal host');
  assert.ok(nativeHarness.tagByAccessibilityLabel('Active menu item'));
  return modalTag;
}

test('the card pressed feedback follows direct touch and clears on release or cancel', async (t) => {
  await mountPost(t);
  assertFeedbackRest();

  const cardTag = requiredTag(nativeHarness.tagByTestID('post-list-item-card'), 'post card');
  await touchDown(cardTag);
  assert.equal(nativeHarness.responderTag(), cardTag);
  assert.ok(feedbackIsPressed());
  await release(t);
  assertFeedbackRest();

  await touchDown(cardTag);
  assert.equal(nativeHarness.responderTag(), cardTag);
  assert.ok(feedbackIsPressed());
  await cancel(t);
  assertFeedbackRest();
});

test('a blocked author or direct quote/repost source disappears from the current list', async (t) => {
  await mountPost(t);
  assert.ok(nativeHarness.tagByTestID('post-list-item-card'));

  const blockedAuthorPost = {
    ...postData,
    profile: { ...postData.profile, viewerState: { profileBlock: { id: 'block-1' } } },
  } as unknown as PostListItem_post$key;
  await renderPost(blockedAuthorPost);
  assert.equal(nativeHarness.tagByTestID('post-list-item-card'), undefined);

  const blockedSourcePost = {
    ...postData,
    repostSource: {
      id: 'source-1',
      profile: {
        relativeHandle: '@target',
        viewerState: { profileBlock: { id: 'block-1' } },
      },
    },
  } as unknown as PostListItem_post$key;
  await renderPost(blockedSourcePost);
  assert.equal(nativeHarness.tagByTestID('post-list-item-card'), undefined);

  await renderPost();
  assert.ok(nativeHarness.tagByTestID('post-list-item-card'));
});

test('an active ActionMenu row selects once without pressing its PostListItem ancestor', async (t) => {
  await mountPost(t);
  assertFeedbackRest();
  await openMenu(t);

  const activeRowTag = requiredTag(
    nativeHarness.tagByAccessibilityLabel('Active menu item'),
    'active menu row',
  );
  await touchDown(activeRowTag);
  assert.equal(nativeHarness.responderTag(), activeRowTag);
  assertFeedbackRest();
  assert.deepEqual(selections, []);

  await release(t);
  assert.deepEqual(selections, []);

  await act(async () => nativeHarness.modalDidDismiss());
  assert.deepEqual(selections, ['active']);
  assertFeedbackRest();
});

test('disabled rows and empty Modal surface leave card feedback at rest under the Modal responder', async (t) => {
  await mountPost(t);
  assertFeedbackRest();
  const modalTag = await openMenu(t);

  const disabledRowTag = requiredTag(
    nativeHarness.tagByAccessibilityLabel('Disabled menu item'),
    'disabled menu row',
  );
  await touchDown(disabledRowTag);
  assert.equal(nativeHarness.responderTag(), modalTag);
  assertFeedbackRest();
  await release(t);
  assert.deepEqual(selections, []);

  await touchDown(modalTag);
  assert.equal(nativeHarness.responderTag(), modalTag);
  assertFeedbackRest();
  await release(t);
  assert.deepEqual(selections, []);
  assert.ok(nativeHarness.tagByAccessibilityLabel('Active menu item'));
});
