import assert from 'node:assert/strict';
import { afterEach, before, describe, it, mock } from 'node:test';
import { createElement, useState } from 'react';
import { act, create } from 'react-test-renderer';
import type { ElementType } from 'react';
import type { ReactTestRenderer } from 'react-test-renderer';
import type { PostComposerCreatedPost } from './PostComposer';
import type { PostComposerHost as PostComposerHostComponent } from './PostComposerHost';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const platform = { OS: 'web' };
let composerProps:
  | {
      body: string;
      onBodyChange: (body: string) => void;
      onPostCreated?: (post: PostComposerCreatedPost) => void;
      onSubmittingChange?: (submitting: boolean) => void;
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
mockModule(require.resolve('./PostComposer'), {
  PostComposer: (props: Omit<NonNullable<typeof composerProps>, 'body' | 'onBodyChange'>) => {
    const [body, setBody] = useState('');
    composerProps = { ...props, body, onBodyChange: setBody };
    return createElement('PostComposer', composerProps);
  },
});
mockModule('@/components/ui/IconButton', {
  IconButton: ({ children, ...props }: { children?: unknown; [key: string]: unknown }) =>
    createElement('Pressable', props, children as never),
});
mockModule('@/components/ui/useSafeAreaPadding', { useSafeAreaPadding: () => ({}) });
mockModule('@/theme/ThemeProvider', {
  useElevation: () => ({ overlay: {} }),
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
      onRequestClose: () => undefined,
      open: true,
      profile: {} as never,
    };
    await act(async () => {
      renderer = create(createElement(PostComposerHost, props));
    });
    await act(async () => composerProps?.onBodyChange('유지할 draft'));
    await act(async () => {
      renderer?.update(createElement(PostComposerHost, { ...props, mode: 'overlay' }));
    });

    assert.equal(composerProps?.body, '유지할 draft');
  });

  it('작성 성공을 먼저 알린 뒤 열린 surface를 닫는다', async () => {
    const events: string[] = [];
    await act(async () => {
      renderer = create(
        createElement(PostComposerHost, {
          mode: 'mobile',
          onPostCreated: () => events.push('created'),
          onRequestClose: () => events.push('close'),
          open: true,
          profile: {} as never,
        }),
      );
    });
    await act(async () => composerProps?.onPostCreated?.({ id: 'post-1' }));

    assert.deepEqual(events, ['created', 'close']);
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
});
