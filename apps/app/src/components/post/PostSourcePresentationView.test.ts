import assert from 'node:assert/strict';
import { afterEach, before, describe, it, mock } from 'node:test';
import { createElement } from 'react';
import { act, create } from 'react-test-renderer';
import type { ReactElement, ReactNode } from 'react';
import type { ReactTestRenderer } from 'react-test-renderer';
import type {
  PostSourcePresentationView as PostSourcePresentationViewComponent,
  PostSourcePreview as PostSourcePreviewComponent,
} from './PostSourcePresentationView';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const mockModule = (specifier: string | URL, exports: object) =>
  mock.module(specifier, {
    exports,
  } as unknown as Parameters<typeof mock.module>[1]);

const platform = { OS: 'web' };

function MockPressable({ children, ...props }: { children?: ReactNode; [key: string]: unknown }) {
  return createElement('Pressable', props, children);
}

function findHoverOverlay() {
  assert.ok(renderer);
  return renderer.root.findAll((node) => (node.type as unknown) === 'AnimatedView')[0];
}

mockModule('expo-router', {
  usePathname: () => '/home',
  Link: ({ children }: { children?: unknown }) => children,
  useRouter: () => ({ push: () => undefined }),
});
mockModule('react-native', {
  Animated: { View: 'AnimatedView' },
  findNodeHandle: () => null,
  Platform: platform,
  Pressable: MockPressable,
  StyleSheet: { create: <T>(styles: T) => styles, flatten: flattenStyle },
  Text: 'Text',
  View: 'View',
});
mockModule('react-relay', {
  graphql: () => ({}),
  useFragment: (_fragment: unknown, key: unknown) => key,
});
mockModule('@/components/profile/ProfileNameBlock', {
  ProfileNameBlock: 'ProfileNameBlock',
});
mockModule('@/components/ui/Avatar', { Avatar: 'Avatar' });
mockModule('@/components/ui/useAnimatedColorTransition', {
  useAnimatedColorTransition: ({ color }: { color: string }) => color,
  useAnimatedOpacityTransition: ({ opacity }: { opacity: number }) => opacity,
});
mockModule('@/lib/date', { formatTimelineTimestamp: () => '방금' });
mockModule('@/theme/ThemeProvider', {
  useReducedMotion: () => false,
  useTheme: () => ({
    borderDefault: '#ddd',
    foregroundSecondary: '#777',
    stateHover: '#eee',
  }),
});
mockModule('./PostContentRenderer', {
  PostContentRenderer: (props: Record<string, unknown>) =>
    createElement('PostContentRenderer', props),
});

let PostSourcePresentationView: typeof PostSourcePresentationViewComponent;
let PostSourcePreview: typeof PostSourcePreviewComponent;
let renderer: ReactTestRenderer | null = null;

before(async () => {
  ({ PostSourcePresentationView, PostSourcePreview } =
    await import('./PostSourcePresentationView'));
});

afterEach(async () => {
  if (renderer) {
    await act(async () => renderer?.unmount());
    renderer = null;
  }
  platform.OS = 'web';
  mock.restoreAll();
});

describe('PostSourcePresentationView mention relation wiring', () => {
  it('forwards mentionedProfiles from an ordinary post content relation', async () => {
    const mentionedProfiles = [mentionedProfile('profile-mentioned')];

    await render(
      createElement(PostSourcePresentationView, {
        post: postWithContent(mentionedProfiles) as never,
      }),
    );

    const contentRenderer = renderer?.root.findAll(
      (node) => (node.type as unknown) === 'PostContentRenderer',
    )[0];
    assert.equal(contentRenderer?.props.mentionedProfiles, mentionedProfiles);
  });

  it('forwards mentionedProfiles through the non-interactive source preview path', async () => {
    const mentionedProfiles = [mentionedProfile('profile-source-mentioned')];

    await render(
      createElement(PostSourcePreview, {
        interactive: false,
        source: postWithContent(mentionedProfiles) as never,
      }),
    );

    const contentRenderer = renderer?.root.findAll(
      (node) => (node.type as unknown) === 'PostContentRenderer',
    )[0];
    assert.equal(contentRenderer?.props.interactive, false);
    assert.equal(contentRenderer?.props.mentionedProfiles, mentionedProfiles);
  });

  it('uses a Pressable only for interactive Web hover feedback', async () => {
    const source = postWithContent([]);

    await render(createElement(PostSourcePreview, { source: source as never }));

    let preview = findRenderedPreview();
    assert.ok(preview);
    assert.equal(preview.type as unknown, 'Pressable');
    assert.equal(preview.props.accessible, false);
    assert.equal(preview.props.focusable, false);
    assert.equal(preview.props.tabIndex, -1);
    assert.equal(preview.props.onPress, undefined);
    assert.equal(flattenStyle(preview.props.style).backgroundColor, undefined);

    const pointerEnter = async (pointerType: 'mouse' | 'pen' | 'touch') => {
      const handler = findRenderedPreview()?.props.onPointerEnter as
        | ((event: { nativeEvent: { pointerType: 'mouse' | 'pen' | 'touch' } }) => void)
        | undefined;
      assert.equal(typeof handler, 'function');
      await act(async () => handler?.({ nativeEvent: { pointerType } }));
    };
    const pointerLeave = async (pointerType: 'mouse' | 'pen' | 'touch') => {
      const handler = findRenderedPreview()?.props.onPointerLeave as
        | ((event: { nativeEvent: { pointerType: 'mouse' | 'pen' | 'touch' } }) => void)
        | undefined;
      assert.equal(typeof handler, 'function');
      await act(async () => handler?.({ nativeEvent: { pointerType } }));
    };

    await pointerEnter('mouse');
    preview = findRenderedPreview();
    assert.ok(preview);
    assert.equal(flattenStyle(findHoverOverlay()?.props.style).backgroundColor, '#eee');

    await pointerEnter('touch');
    preview = findRenderedPreview();
    assert.ok(preview);
    assert.equal(flattenStyle(findHoverOverlay()?.props.style).backgroundColor, '#eee');

    await pointerLeave('touch');
    preview = findRenderedPreview();
    assert.ok(preview);
    assert.equal(flattenStyle(findHoverOverlay()?.props.style).backgroundColor, '#eee');

    await pointerLeave('mouse');
    preview = findRenderedPreview();
    assert.ok(preview);
    assert.equal(flattenStyle(findHoverOverlay()?.props.style).backgroundColor, 'transparent');

    await pointerEnter('pen');
    preview = findRenderedPreview();
    assert.ok(preview);
    assert.equal(flattenStyle(findHoverOverlay()?.props.style).backgroundColor, '#eee');

    await pointerEnter('touch');
    preview = findRenderedPreview();
    assert.ok(preview);
    assert.equal(flattenStyle(findHoverOverlay()?.props.style).backgroundColor, '#eee');

    await pointerLeave('touch');
    preview = findRenderedPreview();
    assert.ok(preview);
    assert.equal(flattenStyle(findHoverOverlay()?.props.style).backgroundColor, '#eee');

    await pointerLeave('pen');
    preview = findRenderedPreview();
    assert.ok(preview);
    assert.equal(flattenStyle(findHoverOverlay()?.props.style).backgroundColor, 'transparent');

    await pointerEnter('touch');
    preview = findRenderedPreview();
    assert.ok(preview);
    assert.equal(flattenStyle(findHoverOverlay()?.props.style).backgroundColor, 'transparent');

    await pointerLeave('touch');
    preview = findRenderedPreview();
    assert.ok(preview);
    assert.equal(flattenStyle(findHoverOverlay()?.props.style).backgroundColor, 'transparent');

    await pointerEnter('mouse');
    preview = findRenderedPreview();
    assert.ok(preview);
    assert.equal(flattenStyle(findHoverOverlay()?.props.style).backgroundColor, '#eee');

    platform.OS = 'ios';
    await update(createElement(PostSourcePreview, { source: source as never }));
    preview = findRenderedPreview();
    assert.ok(preview);
    assert.equal(preview.type as unknown, 'View');
    assert.equal(flattenStyle(preview.props.style).backgroundColor, undefined);

    platform.OS = 'web';
    await update(createElement(PostSourcePreview, { interactive: false, source: source as never }));
    preview = findRenderedPreview();
    assert.ok(preview);
    assert.equal(preview.type as unknown, 'View');
    assert.equal(flattenStyle(preview.props.style).backgroundColor, undefined);

    await update(createElement(PostSourcePreview, { source: source as never }));
    preview = findRenderedPreview();
    assert.ok(preview);
    assert.equal(preview.type as unknown, 'Pressable');
    assert.equal(flattenStyle(preview.props.style).backgroundColor, undefined);
  });
});

async function render(element: ReactElement) {
  await act(async () => {
    renderer = create(element);
  });
}

async function update(element: ReactElement) {
  await act(async () => {
    assert.ok(renderer);
    renderer.update(element);
  });
}

function findRenderedPreview() {
  return renderer?.root.findAll(
    (node) =>
      ((node.type as unknown) === 'Pressable' || (node.type as unknown) === 'View') &&
      node.props.testID === 'source-post-preview',
  )[0];
}

function flattenStyle(style: unknown): Record<string, unknown> {
  if (!Array.isArray(style)) {
    return style && typeof style === 'object' ? (style as Record<string, unknown>) : {};
  }
  return Object.assign({}, ...style.flat(Infinity).filter(Boolean));
}

function mentionedProfile(id: string) {
  return {
    displayName: 'Mentioned Profile',
    id,
    relativeHandle: '@mentioned-profile',
  };
}

function postWithContent(mentionedProfiles: ReturnType<typeof mentionedProfile>[]) {
  return {
    content: {
      bodyText: '@mentioned-profile',
      contentWarning: null,
      document: null,
      media: [],
      mentionedProfiles,
    },
    createdAt: '2026-09-14T00:00:00.000Z',
    id: 'post-source-presentation',
    profile: {
      avatar: null,
      displayName: 'Author',
      handle: 'author',
      id: 'profile-author',
      relativeHandle: '@author',
    },
    repostSource: null,
  };
}
