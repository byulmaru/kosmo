import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { afterEach, before, mock, test } from 'node:test';
import { createElement } from 'react';
import { act, create } from 'react-test-renderer';
import type { ElementType, ReactNode } from 'react';
import type { ReactTestRenderer } from 'react-test-renderer';
import type { ReplyComposerSurface as ReplyComposerSurfaceComponent } from './ReplyComposerSurface';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const platform = { OS: 'android' };
const safeAreaInsets = { bottom: 0, left: 0, right: 0, top: 0 };
let composerProps:
  | {
      initialBodyText?: string;
      onRequestClose?: (event?: unknown) => void;
      onPostCreated?: (post: { id: string; slug: string }) => void;
      onPostRequestAccepted?: () => void;
      onSubmittingChange?: (submitting: boolean) => void;
      registerNativeBackHandler?: (handler: (() => void) | null) => void;
      replyParentId?: string;
      replyParentVisibility?: 'DIRECT' | 'FOLLOWERS' | 'PUBLIC' | 'UNLISTED' | null;
      repostSourceId?: string;
      editorRef?: { current: unknown };
      renderSurface?: (props: { form: ReactNode; mediaEditorOpen: boolean }) => ReactNode;
    }
  | undefined;
let renderer: ReactTestRenderer | null = null;
const require = createRequire(import.meta.url);
const toastEvents: {
  action?: { label: string; onPress: () => void };
  message: string;
  tone?: string;
}[] = [];
const pushedRoutes: string[] = [];
let storeReviewCalls = 0;

const mockModule = (specifier: string | URL, exports: object) =>
  mock.module(specifier, { exports } as unknown as Parameters<typeof mock.module>[1]);

mockModule('expo-router', {
  useRouter: () => ({
    push: (href: string) => pushedRoutes.push(href),
  }),
});
mockModule(require.resolve('lucide-react-native'), { XIcon: 'XIcon' });
mockModule('react-native', {
  KeyboardAvoidingView: 'KeyboardAvoidingView',
  Modal: 'Modal',
  Platform: platform,
  Pressable: 'Pressable',
  StyleSheet: { create: <T>(styles: T) => styles },
  Text: 'Text',
  View: 'View',
  useWindowDimensions: () => ({ width: 360 }),
});
mockModule('react-native-safe-area-context', {
  useSafeAreaInsets: () => safeAreaInsets,
});
mockModule('react-relay', {
  graphql: () => ({}),
  useFragment: (_fragment: unknown, value: unknown) => value,
  useRelayEnvironment: () => ({}),
});
mockModule('relay-runtime', {
  getDataIDsFromFragment: (_fragment: unknown, value: { id?: string }) => value.id,
  getFragment: () => ({}),
});
mockModule('@/components/profile/ProfileNameBlock', { ProfileNameBlock: 'ProfileNameBlock' });
mockModule('@/components/ui/Avatar', { Avatar: 'Avatar' });
mockModule('@/components/ui/Button', { Button: 'Button' });
mockModule('@/components/ui/IconButton', { IconButton: 'IconButton' });
mockModule('@/components/ui/ToastProvider', {
  ToastProvider: ({ children }: { children: unknown }) => children,
  useToast: () => ({
    showToast: (
      message: string,
      options: { action?: { label: string; onPress: () => void }; tone?: string },
    ) => {
      toastEvents.push({ action: options.action, message, tone: options.tone });
    },
  }),
});
mockModule('@/lib/storeReview', {
  requestStoreReview: async () => {
    storeReviewCalls += 1;
  },
});
mockModule('@/components/ui/useSafeAreaPadding', { useSafeAreaPadding: () => ({}) });
mockModule('@/lib/date', { formatTimelineTimestamp: () => '방금 전' });
mockModule('@/relay/RelayEnvironmentBoundary', { useRelayEnvironmentGeneration: () => null });
mockModule('@/theme/ThemeProvider', {
  useElevation: () => ({ overlay: {} }),
  useTheme: () => ({
    backgroundElevated: '#elevated',
    backgroundSurface: '#surface',
    borderDefault: '#border',
    foregroundPrimary: '#primary',
    foregroundSecondary: '#secondary',
    overlayScrim: '#scrim',
  }),
});
mockModule('@/theme/tokens', {
  fontFamilies: { ui: 'ui' },
  layoutRecipes: {},
  radii: { lg: 16 },
  spacing: { lg: 24, md: 12, sm: 8, xs: 4 },
  typography: { lg: {}, md: {}, sm: {} },
});
mockModule(new URL('./PostBody.tsx', import.meta.url), { PostBody: 'PostBody' });
mockModule(new URL('./PostComposerController.tsx', import.meta.url), {
  PostComposerController: (props: NonNullable<typeof composerProps>) => {
    composerProps = props;
    const form = createElement('PostComposer');
    return props.renderSurface?.({ form, mediaEditorOpen: false }) ?? form;
  },
});
mockModule('@/components/ui/ModalOverlay', {
  ModalOverlay: ({ children, ...props }: { children?: ReactNode; [key: string]: unknown }) =>
    createElement('ModalOverlay', props, children),
});
mockModule(new URL('./PostSourcePresentationView.tsx', import.meta.url), {
  PostSourcePreview: 'PostSourcePreview',
});
mockModule(new URL('./PostThreadConnector.tsx', import.meta.url), {
  PostThreadConnector: 'PostThreadConnector',
});
mockModule(new URL('./replySurface.ts', import.meta.url), {
  getReplySurfacePresentation: () => 'fullscreen',
});

let ReplyComposerSurface: typeof ReplyComposerSurfaceComponent;

before(async () => {
  ({ ReplyComposerSurface } = await import('./ReplyComposerSurface'));
});

afterEach(async () => {
  await act(async () => renderer?.unmount());
  renderer = null;
  composerProps = undefined;
  platform.OS = 'android';
  safeAreaInsets.top = 0;
  toastEvents.length = 0;
  pushedRoutes.length = 0;
  storeReviewCalls = 0;
});

test('답글 본문은 direct Parent 작성자와 저장된 mention을 미리 채운다', async () => {
  const parent = {
    content: {
      bodyText: 'Parent 본문',
      contentWarning: null,
      mentionedProfiles: [
        { id: 'profile-writing', relativeHandle: '@writing' },
        { id: 'profile-remote', relativeHandle: '@remote@remote.example' },
        { id: 'profile-parent', relativeHandle: '@parent' },
      ],
    },
    createdAt: '2026-10-08T00:00:00.000Z',
    id: 'post-parent',
    visibility: 'FOLLOWERS',
    profile: {
      avatar: null,
      displayName: 'Parent',
      handle: 'parent',
      id: 'profile-parent',
      relativeHandle: '@parent',
    },
    repostSource: null,
  };
  const profile = { composer: {}, id: 'profile-writing', relativeHandle: '@writing' };
  const props = {
    onRequestClose: () => undefined,
    open: true,
    parent: parent as never,
    profile: profile as never,
  };

  await act(async () => {
    renderer = create(createElement(ReplyComposerSurface, props));
  });

  assert.deepEqual(composerProps?.initialBodyText?.trim().split(/\s+/).sort(), [
    '@parent',
    '@remote@remote.example',
  ]);
  assert.equal(composerProps?.replyParentId, parent.id);
  assert.equal(composerProps?.replyParentVisibility, parent.visibility);

  await act(async () => {
    renderer?.update(
      createElement(ReplyComposerSurface, {
        ...props,
        mode: 'quote',
      }),
    );
  });

  assert.equal(composerProps?.initialBodyText, undefined);
  assert.equal(composerProps?.replyParentVisibility, undefined);
  assert.equal(composerProps?.repostSourceId, parent.id);

  await act(async () => {
    renderer?.update(
      createElement(ReplyComposerSurface, {
        ...props,
        parent: { ...parent, content: null } as never,
      }),
    );
  });

  assert.equal(composerProps?.initialBodyText, '@parent ');

  await act(async () => {
    renderer?.update(
      createElement(ReplyComposerSurface, {
        ...props,
        parent: {
          ...parent,
          content: { bodyText: 'Parent 본문', contentWarning: null, mentionedProfiles: [] },
          profile: { ...parent.profile, id: 'profile-writing', relativeHandle: '@writing' },
        } as never,
      }),
    );
  });

  assert.equal(composerProps?.initialBodyText, '');
});

test('iOS Reply와 Quote는 키보드 회피에 safe-area 화면 offset을 사용한다', async () => {
  platform.OS = 'ios';
  safeAreaInsets.top = 59;
  const props = {
    onRequestClose: () => undefined,
    open: true,
    parent: {
      content: { bodyText: 'Parent 본문', contentWarning: null, mentionedProfiles: [] },
      createdAt: '2026-10-08T00:00:00.000Z',
      id: 'post-parent',
      profile: {
        avatar: null,
        displayName: 'Parent',
        handle: 'parent',
        id: 'profile-parent',
        relativeHandle: '@parent',
      },
      repostSource: null,
    } as never,
    profile: { composer: {}, id: 'profile-writing', relativeHandle: '@writing' } as never,
  };

  await act(async () => {
    renderer = create(createElement(ReplyComposerSurface, props));
  });

  let keyboardAvoidingView = renderer?.root.findByType('KeyboardAvoidingView' as ElementType);
  assert.equal(keyboardAvoidingView?.props.behavior, 'height');
  assert.equal(keyboardAvoidingView?.props.keyboardVerticalOffset, 59);

  await act(async () => {
    renderer?.update(createElement(ReplyComposerSurface, { ...props, mode: 'quote' }));
  });

  keyboardAvoidingView = renderer?.root.findByType('KeyboardAvoidingView' as ElementType);
  assert.equal(keyboardAvoidingView?.props.behavior, 'height');
  assert.equal(keyboardAvoidingView?.props.keyboardVerticalOffset, 59);
});

test('미디어 편집 중 Native back은 작성 surface 대신 편집기만 닫는다', async () => {
  let editorBackCount = 0;
  await act(async () => {
    renderer = create(
      createElement(ReplyComposerSurface, {
        mode: 'quote',
        onRequestClose: () => undefined,
        open: true,
        parent: { id: 'post-1' } as never,
        profile: { composer: {}, id: 'profile-1', relativeHandle: '@kosmo' } as never,
      }),
    );
  });
  const surface = renderer?.root.findByProps({ testID: 'quote-composer-dialog-surface' });
  assert.equal(surface?.props.style.at(-1).backgroundColor, '#elevated');
  assert.equal(surface?.props.style.at(-1).borderColor, '#border');
  await act(async () => composerProps?.registerNativeBackHandler?.(() => editorBackCount++));

  const modal = renderer?.root.findByType('ModalOverlay' as ElementType);
  assert.ok(modal);
  await act(async () => modal.props.onRequestClose());

  assert.equal(editorBackCount, 1);
});

test('닫기 버튼 이벤트는 작성 취소 후 실행할 콜백으로 취급하지 않는다', async () => {
  let closeCount = 0;
  const props = {
    mode: 'quote' as const,
    onRequestClose: () => closeCount++,
    open: true,
    parent: { id: 'post-1' } as never,
    profile: { composer: {}, id: 'profile-1', relativeHandle: '@kosmo' } as never,
  };
  await act(async () => {
    renderer = create(createElement(ReplyComposerSurface, props));
  });

  await act(async () => composerProps?.onRequestClose?.({ type: 'press' }));
  const discard = renderer?.root
    .findAllByType('Button' as ElementType)
    .find((button) => button.props.tone === 'danger');
  assert.ok(discard);
  await act(async () => discard.props.onPress());

  assert.equal(closeCount, 1);
  const onDismiss = renderer?.root.findByType('ModalOverlay' as ElementType).props.onDismiss as
    | (() => void)
    | undefined;
  await act(async () => {
    renderer?.update(createElement(ReplyComposerSurface, { ...props, open: false }));
  });
  const modal = renderer?.root.findByType('ModalOverlay' as ElementType);
  assert.equal(modal?.props.visible, false);
  await act(async () => onDismiss?.());
  assert.equal(storeReviewCalls, 0);
});

test('게시 요청 접수는 작성 취소 확인 없이 답글/인용 surface를 닫는다', async () => {
  let closeCount = 0;
  const props = {
    mode: 'quote' as const,
    onRequestClose: () => closeCount++,
    open: true,
    parent: { id: 'post-1' } as never,
    profile: { composer: {}, id: 'profile-1', relativeHandle: '@kosmo' } as never,
  };
  await act(async () => {
    renderer = create(createElement(ReplyComposerSurface, props));
  });

  await act(async () => composerProps?.onPostRequestAccepted?.());

  assert.equal(closeCount, 1);
  assert.equal(renderer?.root.findAllByProps({ role: 'alertdialog' }).length, 0);
  const onDismiss = renderer?.root.findByType('ModalOverlay' as ElementType).props.onDismiss as
    | (() => void)
    | undefined;
  await act(async () => {
    renderer?.update(createElement(ReplyComposerSurface, { ...props, open: false }));
  });
  const modal = renderer?.root.findByType('ModalOverlay' as ElementType);
  assert.equal(modal?.props.visible, false);
  await act(async () => onDismiss?.());
  assert.equal(storeReviewCalls, 0);
});

test('iOS VoiceOver Escape는 확인창을 먼저 닫고 부모 Quote를 유지한다', async () => {
  platform.OS = 'ios';
  let closeCount = 0;
  let editorFocusCount = 0;
  const dismissRequestAnimationFrame = globalThis.requestAnimationFrame;
  Object.assign(globalThis, {
    requestAnimationFrame: (callback: FrameRequestCallback) => {
      callback(0);
      return 0;
    },
  });
  await act(async () => {
    renderer = create(
      createElement(ReplyComposerSurface, {
        mode: 'quote',
        onRequestClose: () => closeCount++,
        open: true,
        parent: { id: 'post-1' } as never,
        profile: { composer: {}, id: 'profile-1', relativeHandle: '@kosmo' } as never,
      }),
    );
  });

  const dialog = renderer?.root.findByProps({ testID: 'quote-composer-dialog-surface' });
  assert.ok(dialog);
  const editorTarget = { focus: () => editorFocusCount++ };
  if (composerProps?.editorRef) {
    composerProps.editorRef.current = editorTarget;
  }
  await act(async () => dialog.props.onAccessibilityEscape());
  assert.equal(closeCount, 0);
  const confirm = renderer?.root.findByProps({ role: 'alertdialog' });
  assert.ok(confirm);
  await act(async () => confirm.props.onAccessibilityEscape());
  assert.equal(closeCount, 0);
  assert.equal(editorFocusCount, 1);
  assert.equal(renderer?.root.findAllByProps({ role: 'alertdialog' }).length, 0);

  await act(async () => dialog.props.onAccessibilityEscape());
  const confirmAgain = renderer?.root.findByProps({ role: 'alertdialog' });
  const discard = renderer?.root
    .findAllByType('Button' as ElementType)
    .find((button) => button.props.tone === 'danger');
  assert.ok(confirmAgain);
  assert.ok(discard);
  await act(async () => discard.props.onPress());
  Object.assign(globalThis, { requestAnimationFrame: dismissRequestAnimationFrame });
  assert.equal(closeCount, 1);
});

test('iOS VoiceOver Escape는 제출 중 Quote를 닫지 않는다', async () => {
  platform.OS = 'ios';
  let closeCount = 0;
  await act(async () => {
    renderer = create(
      createElement(ReplyComposerSurface, {
        mode: 'quote',
        onRequestClose: () => closeCount++,
        open: true,
        parent: { id: 'post-1' } as never,
        profile: { composer: {}, id: 'profile-1', relativeHandle: '@kosmo' } as never,
      }),
    );
  });
  await act(async () => composerProps?.onSubmittingChange?.(true));
  const dialog = renderer?.root.findByProps({ testID: 'quote-composer-dialog-surface' });
  assert.ok(dialog);
  await act(async () => dialog.props.onAccessibilityEscape());
  assert.equal(closeCount, 0);
  assert.equal(renderer?.root.findAllByProps({ role: 'alertdialog' }).length, 0);
});

test('Native 실제 Reply와 Quote는 modal dismissal 뒤 toast·callback·Store Review를 처리한다', async () => {
  const previousRequestAnimationFrame = globalThis.requestAnimationFrame;
  const frames: FrameRequestCallback[] = [];
  Object.assign(globalThis, {
    requestAnimationFrame: (callback: FrameRequestCallback) => {
      frames.push(callback);
      return frames.length;
    },
  });

  try {
    for (const mode of ['reply', 'quote'] as const) {
      toastEvents.length = 0;
      pushedRoutes.length = 0;
      storeReviewCalls = 0;
      const closeEvents: (boolean | undefined)[] = [];
      const createdPosts: string[] = [];
      const post = {
        id: `post-${mode}`,
        slug: mode === 'reply' ? 'ReplyAb12345' : 'QuoteAbc1234',
      };
      await act(async () => {
        renderer = create(
          createElement(ReplyComposerSurface, {
            mode,
            onPostCreated: (created) => createdPosts.push(created.id),
            onRequestClose: (willContinue) => closeEvents.push(willContinue),
            open: true,
            parent: {
              content: { bodyText: 'Parent', contentWarning: null, mentionedProfiles: [] },
              createdAt: '2026-10-08T00:00:00.000Z',
              id: 'post-parent',
              profile: {
                avatar: null,
                displayName: 'Parent',
                id: 'profile-parent',
                relativeHandle: '@parent',
              },
              repostSource: null,
              visibility: 'PUBLIC',
            } as never,
            profile: { composer: {}, id: 'profile-writing', relativeHandle: '@writing' } as never,
          }),
        );
      });

      await act(async () => composerProps?.onPostCreated?.(post));
      const modal = renderer?.root.findByType('ModalOverlay' as ElementType);
      assert.equal(modal?.props.visible, false);
      assert.deepEqual(closeEvents, []);
      assert.equal(toastEvents.length, 0);
      assert.equal(storeReviewCalls, 0);

      await act(async () => modal?.props.onDismiss?.());
      const composerName = mode === 'reply' ? '답글' : '인용 게시글';
      assert.deepEqual(closeEvents, [false]);
      assert.deepEqual(createdPosts, []);
      assert.equal(toastEvents.at(-1)?.message, `${composerName}을 게시했어요`);
      assert.equal(toastEvents.at(-1)?.action?.label, '보기');
      assert.equal(storeReviewCalls, 1);

      const routeAction = toastEvents.at(-1)?.action?.onPress;
      assert.ok(routeAction);
      await act(async () => routeAction());
      assert.deepEqual(pushedRoutes, [`/@writing/${post.slug}`]);

      const frame = frames.shift();
      assert.ok(frame);
      await act(async () => frame(0));
      assert.deepEqual(createdPosts, [post.id]);

      await act(async () => renderer?.unmount());
      renderer = null;
      composerProps = undefined;
    }
  } finally {
    Object.assign(globalThis, { requestAnimationFrame: previousRequestAnimationFrame });
  }
});

test('Web actual post keeps the immediate close and deferred callback without Store Review', async () => {
  platform.OS = 'web';
  const previousRequestAnimationFrame = globalThis.requestAnimationFrame;
  const frames: FrameRequestCallback[] = [];
  const closeEvents: (boolean | undefined)[] = [];
  const createdPosts: string[] = [];
  Object.assign(globalThis, {
    requestAnimationFrame: (callback: FrameRequestCallback) => {
      frames.push(callback);
      return frames.length;
    },
  });

  try {
    await act(async () => {
      renderer = create(
        createElement(ReplyComposerSurface, {
          onPostCreated: (post) => createdPosts.push(post.id),
          onRequestClose: (willContinue) => closeEvents.push(willContinue),
          open: true,
          parent: {
            content: { bodyText: 'Parent', contentWarning: null, mentionedProfiles: [] },
            createdAt: '2026-10-08T00:00:00.000Z',
            id: 'post-parent',
            profile: {
              avatar: null,
              displayName: 'Parent',
              id: 'profile-parent',
              relativeHandle: '@parent',
            },
            repostSource: null,
            visibility: 'PUBLIC',
          } as never,
          profile: { composer: {}, id: 'profile-writing', relativeHandle: '@writing' } as never,
        }),
      );
    });
    await act(async () => composerProps?.onPostCreated?.({ id: 'post-web', slug: 'WebPst001234' }));

    assert.deepEqual(closeEvents, [false]);
    assert.equal(toastEvents.at(-1)?.message, '답글을 게시했어요');
    assert.equal(storeReviewCalls, 0);
    assert.deepEqual(createdPosts, []);
    const frame = frames.shift();
    assert.ok(frame);
    await act(async () => frame(0));
    assert.deepEqual(createdPosts, ['post-web']);
  } finally {
    Object.assign(globalThis, { requestAnimationFrame: previousRequestAnimationFrame });
  }
});
