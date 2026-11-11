import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { afterEach, before, describe, it, mock } from 'node:test';
import { createElement, useState } from 'react';
import { act, create } from 'react-test-renderer';
import type { ElementType, ReactNode } from 'react';
import type { ReactTestRenderer } from 'react-test-renderer';
import type { PostComposerCreatedPost } from './PostComposerController';
import type { PostComposerHost as PostComposerHostComponent } from './PostComposerHost';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const platform = { OS: 'web' };
const safeAreaInsets = { bottom: 0, left: 0, right: 0, top: 0 };
let composerProps:
  | {
      body: string;
      onBodyChange: (body: string) => void;
      onRequestClose?: () => void;
      onPostCreated?: (post: PostComposerCreatedPost) => void;
      onPostRequestAccepted?: () => void;
      onSubmittingChange?: (submitting: boolean) => void;
      registerNativeBackHandler?: (handler: (() => void) | null) => void;
      renderSurface?: (props: { form: ReactNode; mediaEditorOpen: boolean }) => ReactNode;
    }
  | undefined;
let renderer: ReactTestRenderer | null = null;
const require = createRequire(import.meta.url);
let storeReviewCalls = 0;
const toastMessages: string[] = [];

const mockModule = (specifier: string | URL, exports: object) =>
  mock.module(specifier, {
    exports,
  } as unknown as Parameters<typeof mock.module>[1]);

mockModule(require.resolve('lucide-react-native'), { XIcon: 'XIcon' });
mockModule('react-native', {
  KeyboardAvoidingView: 'KeyboardAvoidingView',
  Modal: 'Modal',
  Platform: platform,
  Pressable: 'Pressable',
  ScrollView: 'ScrollView',
  StyleSheet: {
    absoluteFillObject: { bottom: 0, left: 0, position: 'absolute', right: 0, top: 0 },
    absoluteFill: { bottom: 0, left: 0, position: 'absolute', right: 0, top: 0 },
    create: <T>(styles: T) => styles,
  },
  Text: 'Text',
  View: 'View',
});
mockModule('react-native-safe-area-context', {
  useSafeAreaInsets: () => safeAreaInsets,
});
mockModule(require.resolve('./PostComposerController'), {
  PostComposerController: (
    props: Omit<NonNullable<typeof composerProps>, 'body' | 'onBodyChange'>,
  ) => {
    const [body, setBody] = useState('');
    composerProps = { ...props, body, onBodyChange: setBody };
    const form = createElement('PostComposer', composerProps);
    return props.renderSurface?.({ form, mediaEditorOpen: false }) ?? form;
  },
});
mockModule('@/components/ui/ModalOverlay', {
  ModalOverlay: ({ children, ...props }: { children?: ReactNode; [key: string]: unknown }) =>
    createElement('ModalOverlay', props, children),
});
mockModule('@/components/ui/IconButton', {
  IconButton: ({ children, ...props }: { children?: unknown; [key: string]: unknown }) =>
    createElement('Pressable', props, children as never),
});
mockModule('@/components/ui/Button', {
  Button: ({ children, ...props }: { children?: unknown; [key: string]: unknown }) =>
    createElement('Pressable', props, children as never),
});
mockModule('@/components/ui/ToastProvider', {
  ToastProvider: ({ children }: { children?: unknown }) => children,
  useToast: () => ({
    showToast: (message: string) => {
      toastMessages.push(message);
    },
  }),
});
mockModule('@/lib/storeReview', {
  requestStoreReview: async () => {
    storeReviewCalls += 1;
  },
});
mockModule('@/components/ui/useSafeAreaPadding', { useSafeAreaPadding: () => ({}) });
mockModule('@/theme/ThemeProvider', {
  useElevation: () => ({ overlay: { shadowOpacity: 1 } }),
  useTheme: () => ({
    backgroundCanvas: '#canvas',
    backgroundElevated: '#elevated',
    backgroundSurface: '#surface',
    borderSubtle: '#subtle',
    borderDefault: '#border',
    foregroundPrimary: '#primary',
    foregroundSecondary: '#secondary',
    overlayScrim: '#scrim',
  }),
});
mockModule('@/theme/tokens', {
  fontFamilies: { ui: 'ui' },
  radii: { lg: 16 },
  spacing: { lg: 24, md: 12, sm: 8, xl: 32 },
  textStyles: { uiCopyM: {}, uiHeadingS: {} },
  typography: { lg: {} },
});

let PostComposerHost: typeof PostComposerHostComponent;

before(async () => {
  ({ PostComposerHost } = await import('./PostComposerHost'));
});

afterEach(async () => {
  if (renderer) {
    await act(async () => renderer?.unmount());
    renderer = null;
  }
  composerProps = undefined;
  platform.OS = 'web';
  safeAreaInsets.top = 0;
  storeReviewCalls = 0;
  toastMessages.length = 0;
  mock.restoreAll();
});

describe('PostComposerHost', () => {
  it('Native mobile composer는 scrim과 overlay elevation 없이 fullscreen surface를 표시한다', async () => {
    platform.OS = 'ios';
    await act(async () => {
      renderer = create(
        createElement(PostComposerHost, {
          mode: 'mobile',
          onRequestClose: () => undefined,
          open: true,
          profile: {} as never,
        }),
      );
    });

    const modal = renderer?.root.findByType('ModalOverlay' as ElementType);
    const dialog = renderer?.root.findByProps({ testID: 'post-composer-dialog' });
    const dialogStyles = (dialog?.props.style as Array<Record<string, unknown>>).filter(Boolean);

    assert.equal(modal?.props.presentation, 'fullscreen');
    assert.equal(modal?.props.iosPresentationStyle, 'fullScreen');
    assert.equal(renderer?.root.findAllByProps({ testID: 'post-composer-backdrop' }).length, 0);
    assert.equal(dialogStyles.at(-1)?.backgroundColor, '#canvas');
    assert.equal(
      dialogStyles.some((style) => style.shadowOpacity === 1),
      false,
    );
  });

  it('Android fullscreen composer keeps its opaque themed surface', async () => {
    platform.OS = 'android';
    await act(async () => {
      renderer = create(
        createElement(PostComposerHost, {
          mode: 'mobile',
          onRequestClose: () => undefined,
          open: true,
          profile: {} as never,
        }),
      );
    });

    const modal = renderer?.root.findByType('ModalOverlay' as ElementType);
    const mobileSurface = renderer?.root.findAllByType('View' as ElementType).find((view) => {
      const style = view.props.style as Array<Record<string, unknown>>;
      return style.at(-1)?.backgroundColor === '#canvas';
    });
    const mobileSurfaceStyles = mobileSurface?.props.style as Array<Record<string, unknown>>;

    assert.equal(modal?.props.presentation, 'fullscreen');
    assert.equal(renderer?.root.findAllByProps({ testID: 'post-composer-backdrop' }).length, 0);
    assert.equal(mobileSurfaceStyles[0]?.flex, 1);
    assert.equal(mobileSurfaceStyles.at(-1)?.backgroundColor, '#canvas');
  });

  it('Native mobile KeyboardAvoidingView는 safe-area screen offset을 받는다', async () => {
    platform.OS = 'ios';
    safeAreaInsets.top = 59;
    await act(async () => {
      renderer = create(
        createElement(PostComposerHost, {
          mode: 'mobile',
          onRequestClose: () => undefined,
          open: true,
          profile: {} as never,
        }),
      );
    });

    const keyboardAvoidingView = renderer?.root.findByType('KeyboardAvoidingView' as ElementType);
    assert.equal(keyboardAvoidingView?.props.behavior, 'height');
    assert.equal(keyboardAvoidingView?.props.keyboardVerticalOffset, 59);
  });

  it('모바일 Web surface는 공용 dialog modal host를 사용한다', async () => {
    platform.OS = 'web';
    await act(async () => {
      renderer = create(
        createElement(PostComposerHost, {
          mode: 'mobile',
          onRequestClose: () => undefined,
          open: true,
          profile: {} as never,
        }),
      );
    });

    const modal = renderer?.root.findByType('Modal' as ElementType);
    assert.equal(modal?.props.accessibilityLabel, '글쓰기');
    assert.equal(modal?.props.animationType, 'none');
    assert.equal(modal?.props.role, 'dialog');
    assert.equal(modal?.props.transparent, true);
    assert.equal(modal?.props.visible, true);
    assert.ok(renderer?.root.findByProps({ testID: 'post-composer-backdrop' }));
  });

  it('닫힌 Overlay를 modal로 노출하지 않는다', async () => {
    await act(async () => {
      renderer = create(
        createElement(PostComposerHost, {
          mode: 'overlay',
          onRequestClose: () => undefined,
          open: false,
          profile: {} as never,
        }),
      );
    });

    const dialog = renderer?.root.findByProps({ testID: 'post-composer-dialog' });
    const modal = renderer?.root.findByType('Modal' as ElementType);
    assert.equal(dialog?.props['aria-modal'], undefined);
    assert.equal(dialog?.props.role, undefined);
    assert.equal(modal?.props.visible, false);
  });

  it('Rail, Overlay, Mobile 전환에서도 같은 Composer draft owner를 유지한다', async () => {
    const props = {
      mode: 'rail' as const,
      onExpand: () => undefined,
      onRequestClose: () => undefined,
      open: true,
      profile: {} as never,
    };
    await act(async () => {
      renderer = create(createElement(PostComposerHost, props));
    });
    assert.ok(renderer);
    const rail = renderer.root.findByProps({ testID: 'post-composer-rail' });
    assert.equal(rail.props.style.at(-1).backgroundColor, '#surface');
    await act(async () => composerProps?.onBodyChange('유지할 draft'));
    await act(async () => {
      renderer?.update(
        createElement(PostComposerHost, {
          mode: 'overlay',
          onRequestClose: props.onRequestClose,
          open: props.open,
          profile: props.profile,
        }),
      );
    });
    assert.ok(renderer);

    const overlay = renderer.root.findByProps({ testID: 'post-composer-dialog' });
    assert.equal(overlay.props.style.at(-1).backgroundColor, '#elevated');
    assert.equal(composerProps?.body, '유지할 draft');

    await act(async () => {
      renderer?.update(
        createElement(PostComposerHost, {
          mode: 'mobile',
          onRequestClose: props.onRequestClose,
          open: props.open,
          profile: props.profile,
        }),
      );
    });
    const mobile = renderer.root.findByProps({ testID: 'post-composer-dialog' });
    assert.equal(mobile.props.style.at(-1).backgroundColor, '#canvas');
    assert.equal(composerProps?.body, '유지할 draft');

    await act(async () => {
      renderer?.update(createElement(PostComposerHost, props));
    });
    const railAfterOverlay = renderer.root.findByProps({ testID: 'post-composer-rail' });
    assert.equal(railAfterOverlay.props.style.at(-1).backgroundColor, '#surface');

    assert.equal(composerProps?.body, '유지할 draft');
  });

  it('기존 trigger가 사라지면 shell fallback으로 포커스를 복원한다', async () => {
    let fallbackFocusCount = 0;
    const body = { style: { overflow: '' } };
    const fallback = { focus: () => fallbackFocusCount++ };
    const previousDocument = globalThis.document;
    const previousRequestAnimationFrame = globalThis.requestAnimationFrame;
    Object.assign(globalThis, {
      document: {
        activeElement: body,
        addEventListener: () => undefined,
        body,
        contains: (element: unknown) => element === fallback,
        removeEventListener: () => undefined,
      },
      requestAnimationFrame: (callback: FrameRequestCallback) => {
        callback(0);
        return 0;
      },
    });

    try {
      await act(async () => {
        renderer = create(
          createElement(PostComposerHost, {
            fallbackFocusRef: { current: fallback } as never,
            mode: 'overlay',
            onRequestClose: () => undefined,
            open: true,
            profile: {} as never,
            triggerFocusRef: { current: { focus: () => undefined } } as never,
          }),
        );
      });
      await act(async () => {
        renderer?.update(
          createElement(PostComposerHost, {
            fallbackFocusRef: { current: fallback } as never,
            mode: 'overlay',
            onRequestClose: () => undefined,
            open: false,
            profile: {} as never,
            triggerFocusRef: { current: { focus: () => undefined } } as never,
          }),
        );
      });

      assert.equal(fallbackFocusCount, 1);
    } finally {
      Object.assign(globalThis, {
        document: previousDocument,
        requestAnimationFrame: previousRequestAnimationFrame,
      });
    }
  });

  it('접수된 게시 요청은 닫고 Store Review는 요청하지 않는다', async () => {
    const events: string[] = [];
    platform.OS = 'android';
    const props = {
      mode: 'mobile' as const,
      onRequestClose: (reason: string) => events.push(reason),
      open: true,
      profile: {} as never,
    };
    await act(async () => {
      renderer = create(createElement(PostComposerHost, props));
    });
    await act(async () => composerProps?.onPostRequestAccepted?.());

    assert.deepEqual(events, ['created']);
    await act(async () => {
      renderer?.update(createElement(PostComposerHost, { ...props, open: false }));
    });
    const modal = renderer?.root.findByType('ModalOverlay' as ElementType);
    await act(async () => modal?.props.onDismiss?.());
    assert.equal(storeReviewCalls, 0);
  });

  it('실제 Native 게시물은 modal dismissal 뒤 닫고 Store Review를 요청한다', async () => {
    platform.OS = 'android';
    const events: string[] = [];
    const props = {
      mode: 'mobile' as const,
      onRequestClose: (reason: string) => events.push(reason),
      open: true,
      profile: {} as never,
    };
    await act(async () => {
      renderer = create(createElement(PostComposerHost, props));
    });
    await act(async () =>
      composerProps?.onPostCreated?.({ id: 'post-published', slug: 'AbCdEf123456' }),
    );

    let modal = renderer?.root.findByType('ModalOverlay' as ElementType);
    assert.equal(modal?.props.visible, false);
    assert.deepEqual(events, []);
    assert.deepEqual(toastMessages, []);
    assert.equal(storeReviewCalls, 0);

    await act(async () => modal?.props.onDismiss?.());
    assert.deepEqual(events, ['created']);
    assert.deepEqual(toastMessages, ['게시했어요']);
    assert.equal(storeReviewCalls, 1);

    await act(async () => {
      renderer?.update(createElement(PostComposerHost, { ...props, open: false }));
    });
    await act(async () => {
      renderer?.update(createElement(PostComposerHost, props));
    });
    modal = renderer?.root.findByType('ModalOverlay' as ElementType);
    assert.equal(modal?.props.visible, true);
  });

  it('Native 사용자 취소는 Store Review를 요청하지 않는다', async () => {
    platform.OS = 'android';
    const events: string[] = [];
    const props = {
      mode: 'mobile' as const,
      onRequestClose: (reason: string) => events.push(reason),
      open: true,
      profile: {} as never,
    };
    await act(async () => {
      renderer = create(createElement(PostComposerHost, props));
    });
    const modal = renderer?.root.findByType('ModalOverlay' as ElementType);
    await act(async () => modal?.props.onRequestClose?.());

    assert.deepEqual(events, ['dismiss']);
    await act(async () => {
      renderer?.update(createElement(PostComposerHost, { ...props, open: false }));
    });
    const dismissedModal = renderer?.root.findByType('ModalOverlay' as ElementType);
    await act(async () => dismissedModal?.props.onDismiss?.());
    assert.equal(storeReviewCalls, 0);
  });

  it('Native back은 제출 중에는 닫지 않는다', async () => {
    platform.OS = 'android';
    let closeCount = 0;
    await act(async () => {
      renderer = create(
        createElement(PostComposerHost, {
          mode: 'mobile',
          onRequestClose: () => closeCount++,
          open: true,
          profile: {} as never,
        }),
      );
    });
    await act(async () => composerProps?.onSubmittingChange?.(true));
    const modal = renderer?.root.findByType('ModalOverlay' as ElementType);
    assert.ok(modal);
    await act(async () => modal.props.onRequestClose());

    assert.equal(closeCount, 0);
  });

  it('미디어 편집 중 Native back은 작성 surface 대신 편집기만 닫는다', async () => {
    platform.OS = 'android';
    let closeCount = 0;
    let editorBackCount = 0;
    await act(async () => {
      renderer = create(
        createElement(PostComposerHost, {
          mode: 'mobile',
          onRequestClose: () => closeCount++,
          open: true,
          profile: {} as never,
        }),
      );
    });
    await act(async () => composerProps?.registerNativeBackHandler?.(() => editorBackCount++));
    const modal = renderer?.root.findByType('ModalOverlay' as ElementType);
    assert.ok(modal);
    await act(async () => modal.props.onRequestClose());

    assert.equal(editorBackCount, 1);
    assert.equal(closeCount, 0);
  });

  it('iOS VoiceOver Escape는 nested editor를 먼저 닫고 제출 중에는 부모를 유지한다', async () => {
    platform.OS = 'ios';
    let closeCount = 0;
    let editorBackCount = 0;
    await act(async () => {
      renderer = create(
        createElement(PostComposerHost, {
          mode: 'mobile',
          onRequestClose: () => closeCount++,
          open: true,
          profile: {} as never,
        }),
      );
    });
    await act(async () => composerProps?.registerNativeBackHandler?.(() => editorBackCount++));
    const dialog = renderer?.root
      .findAllByType('View' as ElementType)
      .find((view) => view.props.role === 'dialog' && view.props.accessibilityLabel === '글쓰기');
    assert.ok(dialog);
    await act(async () => dialog.props.onAccessibilityEscape());
    assert.equal(editorBackCount, 1);
    assert.equal(closeCount, 0);

    await act(async () => composerProps?.registerNativeBackHandler?.(null));
    await act(async () => composerProps?.onSubmittingChange?.(true));
    await act(async () => dialog.props.onAccessibilityEscape());
    assert.equal(closeCount, 0);

    await act(async () => composerProps?.onSubmittingChange?.(false));
    await act(async () => dialog.props.onAccessibilityEscape());
    assert.equal(closeCount, 1);
  });

  it('Web pending은 Escape·backdrop·닫기 버튼을 공용 dismiss guard에서 차단한다', async () => {
    platform.OS = 'web';
    let closeCount = 0;
    let escapeListener: ((event: KeyboardEvent) => void) | undefined;
    const previousDocument = globalThis.document;
    const documentMock = {
      activeElement: null,
      addEventListener: (type: string, listener: (event: KeyboardEvent) => void) => {
        if (type === 'keydown') {
          escapeListener = listener;
        }
      },
      body: { style: { overflow: '' } },
      contains: () => false,
      removeEventListener: (type: string, listener: (event: KeyboardEvent) => void) => {
        if (type === 'keydown' && escapeListener === listener) {
          escapeListener = undefined;
        }
      },
    };
    const previousRequestAnimationFrame = globalThis.requestAnimationFrame;
    Object.defineProperty(globalThis, 'document', {
      configurable: true,
      value: documentMock,
    });
    Object.defineProperty(globalThis, 'requestAnimationFrame', {
      configurable: true,
      value: (callback: FrameRequestCallback) => {
        callback(0);
        return 0;
      },
    });

    try {
      await act(async () => {
        renderer = create(
          createElement(PostComposerHost, {
            mode: 'overlay',
            onRequestClose: () => closeCount++,
            open: true,
            profile: {} as never,
          }),
        );
      });
      await act(async () => composerProps?.onSubmittingChange?.(true));

      let prevented = 0;
      escapeListener?.({
        key: 'Escape',
        preventDefault: () => prevented++,
      } as unknown as KeyboardEvent);
      assert.equal(prevented, 1);
      assert.equal(closeCount, 0);

      const backdrop = renderer?.root
        .findAllByProps({ testID: 'post-composer-backdrop' })
        .find((element) => typeof element.props.onPress === 'function');
      assert.ok(backdrop);
      await act(async () => backdrop?.props.onPress());
      assert.equal(closeCount, 0);

      const closeButton = renderer?.root.findByProps({ accessibilityLabel: '글쓰기 닫기' });
      await act(async () => closeButton?.props.onPress());

      assert.equal(closeCount, 0);
      await act(async () => composerProps?.onSubmittingChange?.(false));
      await act(async () => backdrop?.props.onPress());
      assert.equal(closeCount, 1);
    } finally {
      if (renderer) {
        await act(async () => renderer?.unmount());
        renderer = null;
      }
      Object.defineProperty(globalThis, 'document', {
        configurable: true,
        value: previousDocument,
      });
      Object.defineProperty(globalThis, 'requestAnimationFrame', {
        configurable: true,
        value: previousRequestAnimationFrame,
      });
    }
  });
});
