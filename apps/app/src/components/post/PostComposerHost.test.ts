import assert from 'node:assert/strict';
import { afterEach, before, describe, it, mock } from 'node:test';
import { createElement, useState } from 'react';
import { act, create } from 'react-test-renderer';
import type { ElementType } from 'react';
import type { ReactTestRenderer } from 'react-test-renderer';
import type { PostComposerCreatedPost } from './PostComposerController';
import type { PostComposerHost as PostComposerHostComponent } from './PostComposerHost';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const platform = { OS: 'web' };
let composerProps:
  | {
      body: string;
      onBodyChange: (body: string) => void;
      onPostCreated?: (post: PostComposerCreatedPost) => void;
      onSubmittingChange?: (submitting: boolean) => void;
      registerNativeBackHandler?: (handler: (() => void) | null) => void;
    }
  | undefined;
let renderer: ReactTestRenderer | null = null;

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
  StyleSheet: { create: <T>(styles: T) => styles },
  Text: 'Text',
  View: 'View',
});
mockModule(require.resolve('./PostComposerController'), {
  PostComposerController: (
    props: Omit<NonNullable<typeof composerProps>, 'body' | 'onBodyChange'>,
  ) => {
    const [body, setBody] = useState('');
    composerProps = { ...props, body, onBodyChange: setBody };
    return createElement('PostComposer', composerProps);
  },
});
mockModule('@/components/ui/IconButton', {
  IconButton: ({ children, ...props }: { children?: unknown; [key: string]: unknown }) =>
    createElement('Pressable', props, children as never),
});
mockModule('@/components/ui/ToastProvider', {
  ToastProvider: ({ children }: { children?: unknown }) => children,
});
mockModule('@/components/ui/useSafeAreaPadding', { useSafeAreaPadding: () => ({}) });
mockModule('@/theme/ThemeProvider', {
  useElevation: () => ({ overlay: { shadowOpacity: 1 } }),
  useTheme: () => ({ border: '#ddd', card: '#fff', overlayScrim: '#000', text: '#111' }),
});
mockModule('@/theme/tokens', {
  fontFamilies: { ui: 'ui' },
  radii: { lg: 16 },
  spacing: { lg: 24, sm: 8 },
  textStyles: { uiHeadingS: {} },
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

    const modal = renderer?.root.findByType('Modal' as ElementType);
    const dialog = renderer?.root.findByProps({ testID: 'post-composer-dialog' });
    const dialogStyles = (dialog?.props.style as Array<Record<string, unknown>>).filter(Boolean);

    assert.equal(modal?.props.transparent, false);
    assert.equal(renderer?.root.findAllByProps({ testID: 'post-composer-backdrop' }).length, 0);
    assert.equal(
      dialogStyles.some((style) => style.shadowOpacity === 1),
      false,
    );
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
    assert.equal(dialog?.props['aria-modal'], undefined);
    assert.equal(dialog?.props.role, undefined);
  });

  it('Rail에서 Overlay로 바꿔도 같은 Composer draft owner를 유지한다', async () => {
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

  it('작성 성공 reason으로 열린 surface를 닫는다', async () => {
    const events: string[] = [];
    await act(async () => {
      renderer = create(
        createElement(PostComposerHost, {
          mode: 'mobile',
          onRequestClose: (reason) => events.push(reason),
          open: true,
          profile: {} as never,
        }),
      );
    });
    await act(async () => composerProps?.onPostCreated?.({ id: 'post-1' }));

    assert.deepEqual(events, ['created']);
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
    const modal = renderer?.root.findByType('Modal' as ElementType);
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
    const modal = renderer?.root.findByType('Modal' as ElementType);
    assert.ok(modal);
    await act(async () => modal.props.onRequestClose());

    assert.equal(editorBackCount, 1);
    assert.equal(closeCount, 0);
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
    Object.defineProperty(globalThis, 'document', {
      configurable: true,
      value: documentMock,
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
        .findAllByType('Pressable' as ElementType)
        .find((pressable) => {
          const styles = Array.isArray(pressable.props.style)
            ? pressable.props.style
            : [pressable.props.style];
          return styles.some(
            (style: { position?: string } | null) => style?.position === 'absolute',
          );
        });
      assert.ok(backdrop);
      await act(async () => backdrop?.props.onPress());

      const closeButton = renderer?.root.findByProps({ accessibilityLabel: '글쓰기 닫기' });
      await act(async () => closeButton?.props.onPress());

      assert.equal(closeCount, 0);
    } finally {
      if (renderer) {
        await act(async () => renderer?.unmount());
        renderer = null;
      }
      Object.defineProperty(globalThis, 'document', {
        configurable: true,
        value: previousDocument,
      });
    }
  });
});
