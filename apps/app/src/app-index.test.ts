import assert from 'node:assert/strict';
import { afterEach, before, describe, it, mock } from 'node:test';
import { createElement } from 'react';
import { act, create } from 'react-test-renderer';
import type { ComponentType, ReactNode } from 'react';
import type { ReactTestInstance, ReactTestRenderer } from 'react-test-renderer';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

type Platform = 'android' | 'ios' | 'web';

const mockModule = (specifier: string | URL, exports: object) =>
  mock.module(specifier, {
    exports,
  } as unknown as Parameters<typeof mock.module>[1]);

let platform: Platform = 'web';
let renderer: ReactTestRenderer | null = null;
let IndexScreen: ComponentType;

mockModule('expo-router', {
  Link: ({ children, href }: { children: ReactNode; href: string }) =>
    createElement('Link', { href }, children),
  useRouter: () => ({ replace: () => undefined }),
});
mockModule('react-native', {
  Platform: {
    get OS() {
      return platform;
    },
  },
  Pressable: 'Pressable',
  ScrollView: 'ScrollView',
  StyleSheet: { create: <T>(styles: T) => styles },
  Text: 'Text',
  useWindowDimensions: () => ({ width: 1_280 }),
  View: 'View',
});
mockModule('react-relay', {
  graphql: (parts: TemplateStringsArray) => parts.join(''),
  useMutation: () => [() => undefined],
});
mockModule('@/auth/login', {
  startNativeAuthorization: async () => null,
  startWebLoginFromPress: () => undefined,
});
mockModule('@/components/BrandLogo', {
  BrandLogo: () => createElement('BrandLogo'),
});
mockModule('@/components/settings/NativeChannelSettings', {
  NativeChannelSettings: () => createElement('NativeChannelSettings'),
});
mockModule('@/components/shell/NavigationLink', {
  NavigationLink: ({ children }: { children: ReactNode }) =>
    createElement('NavigationLink', null, children),
});
mockModule('@/components/ui/Button', {
  Button: ({ children, ...props }: { children?: ReactNode; [key: string]: unknown }) =>
    createElement('Button', props, children),
});
mockModule('@/relay/RelayActorProvider', {
  useRelayActor: () => ({ setNativeSession: async () => undefined }),
});
mockModule('@/session/SessionProvider', {
  useSession: () => ({ status: 'guest' }),
});
mockModule('@/theme/ThemeProvider', {
  useTheme: () => ({
    background: '#ffffff',
    danger: '#cc0000',
    text: '#111111',
    textSecondary: '#666666',
  }),
});

before(async () => {
  ({ default: IndexScreen } = await import('./app/index'));
});

afterEach(async () => {
  platform = 'web';
  if (renderer) {
    await act(async () => renderer?.unmount());
    renderer = null;
  }
});

describe('로그인 route', () => {
  it('Web 로그인 화면은 Native 채널 설정을 표시하지 않는다', async () => {
    await renderLoginScreen('web');

    assert.equal(rendered('Button').length, 1);
    assert.deepEqual(rendered('NativeChannelSettings'), []);
  });

  it('iOS 로그인 화면은 Native 채널 설정을 표시하지 않는다', async () => {
    await renderLoginScreen('ios');

    assert.equal(rendered('Button').length, 1);
    assert.deepEqual(rendered('NativeChannelSettings'), []);
  });

  it('Android 로그인 화면은 Native 채널 설정을 표시하지 않는다', async () => {
    await renderLoginScreen('android');

    assert.equal(rendered('Button').length, 1);
    assert.deepEqual(rendered('NativeChannelSettings'), []);
  });
});

async function renderLoginScreen(nextPlatform: Platform) {
  platform = nextPlatform;
  await act(async () => {
    renderer = create(createElement(IndexScreen));
  });
  assert.ok(renderer);
}

function rendered(type: string): ReactTestInstance[] {
  assert.ok(renderer);
  return renderer.root.findAll((node) => node.type === type);
}
