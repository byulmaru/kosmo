import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { afterEach, before, mock, test } from 'node:test';
import { createElement } from 'react';
import { act, create } from 'react-test-renderer';
import type { ElementType } from 'react';
import type { ReactTestRenderer } from 'react-test-renderer';
import type { ReplyComposerSurface as ReplyComposerSurfaceComponent } from './ReplyComposerSurface';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let composerProps:
  | {
      onRequestClose?: (event?: unknown) => void;
      registerNativeBackHandler?: (handler: (() => void) | null) => void;
    }
  | undefined;
let renderer: ReactTestRenderer | null = null;
const require = createRequire(import.meta.url);

const mockModule = (specifier: string | URL, exports: object) =>
  mock.module(specifier, { exports } as unknown as Parameters<typeof mock.module>[1]);

mockModule('expo-router', { useRouter: () => ({ push: () => undefined }) });
mockModule(require.resolve('lucide-react-native'), { XIcon: 'XIcon' });
mockModule('react-native', {
  KeyboardAvoidingView: 'KeyboardAvoidingView',
  Modal: 'Modal',
  Platform: { OS: 'android' },
  Pressable: 'Pressable',
  StyleSheet: { create: <T>(styles: T) => styles },
  Text: 'Text',
  View: 'View',
  useWindowDimensions: () => ({ width: 360 }),
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
  useToast: () => ({ showToast: () => undefined }),
});
mockModule('@/components/ui/useSafeAreaPadding', { useSafeAreaPadding: () => ({}) });
mockModule('@/lib/date', { formatTimelineTimestamp: () => '방금 전' });
mockModule('@/relay/RelayEnvironmentBoundary', { useRelayEnvironmentGeneration: () => null });
mockModule('@/theme/ThemeProvider', {
  useElevation: () => ({ overlay: {} }),
  useTheme: () => ({ border: '#ddd', card: '#fff', overlayScrim: '#000', text: '#111' }),
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
    return createElement('PostComposer');
  },
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
  await act(async () => composerProps?.registerNativeBackHandler?.(() => editorBackCount++));

  const modal = renderer?.root.findByType('Modal' as ElementType);
  assert.ok(modal);
  await act(async () => modal.props.onRequestClose());

  assert.equal(editorBackCount, 1);
});

test('닫기 버튼 이벤트는 작성 취소 후 실행할 콜백으로 취급하지 않는다', async () => {
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

  await act(async () => composerProps?.onRequestClose?.({ type: 'press' }));
  const discard = renderer?.root
    .findAllByType('Button' as ElementType)
    .find((button) => button.props.tone === 'danger');
  assert.ok(discard);
  await act(async () => discard.props.onPress());

  assert.equal(closeCount, 1);
});
