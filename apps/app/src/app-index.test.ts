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
let sessionStatus: 'error' | 'guest' | 'valid' = 'guest';
let renderer: ReactTestRenderer | null = null;
let IndexScreen: ComponentType;
const replace = mock.fn();
const resetSession = mock.fn();
const startNativeAuthorization = mock.fn(async () => null);

mockModule('expo-router', {
  Link: ({ children, href }: { children: ReactNode; href: string }) =>
    createElement('Link', { href }, children),
  useRouter: () => ({ replace }),
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
  startNativeAuthorization,
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
mockModule('@/components/shell/UniversalShell', {
  UniversalShell: ({ children }: { children: ReactNode }) =>
    createElement('UniversalShell', null, children),
});
mockModule('@/components/timeline/LocalTimelineScreen', {
  GuestLocalScreen: () => createElement('GuestLocalScreen'),
});
mockModule('@/components/ui/StateView', {
  StateView: (props: object) => createElement('StateView', props),
});
mockModule('@/components/ui/Button', {
  Button: ({ children, ...props }: { children?: ReactNode; [key: string]: unknown }) =>
    createElement('Button', props, children),
});
mockModule('@/relay/RelayActorProvider', {
  useRelayActor: () => ({ resetSession, setNativeSession: async () => undefined }),
});
mockModule('@/session/SessionProvider', {
  useSession: () => ({ status: sessionStatus }),
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
  sessionStatus = 'guest';
  replace.mock.resetCalls();
  resetSession.mock.resetCalls();
  startNativeAuthorization.mock.resetCalls();
  if (renderer) {
    await act(async () => renderer?.unmount());
    renderer = null;
  }
});

describe('로그인 route', () => {
  it('confirmed Web guest renders the shared public shell and Local content', async () => {
    await renderLoginScreen('web');

    assert.equal(rendered('UniversalShell').length, 1);
    assert.equal(rendered('GuestLocalScreen').length, 1);
    assert.deepEqual(rendered('Button'), []);
    assert.equal(startNativeAuthorization.mock.callCount(), 0);
  });

  it('iOS 로그인 화면은 Native 채널 설정을 표시하지 않는다', async () => {
    await renderLoginScreen('ios');

    assert.equal(rendered('Button').length, 1);
    assert.deepEqual(rendered('GuestLocalScreen'), []);
    await act(async () => rendered('Button')[0]?.props.onPress());
    assert.equal(startNativeAuthorization.mock.callCount(), 1);
  });

  it('Android 로그인 화면은 Native 채널 설정을 표시하지 않는다', async () => {
    await renderLoginScreen('android');

    assert.equal(rendered('Button').length, 1);
    assert.deepEqual(rendered('GuestLocalScreen'), []);
    await act(async () => rendered('Button')[0]?.props.onPress());
    assert.equal(startNativeAuthorization.mock.callCount(), 1);
  });
});

describe('session landing route', () => {
  it('keeps a session error separate from guest content and retries the session', async () => {
    sessionStatus = 'error';
    await renderLoginScreen('web');

    assert.deepEqual(rendered('GuestLocalScreen'), []);
    assert.deepEqual(rendered('UniversalShell'), []);
    assert.equal(rendered('StateView').length, 1);
    await act(async () => rendered('StateView')[0]?.props.onAction());
    assert.equal(resetSession.mock.callCount(), 1);
    assert.equal(replace.mock.callCount(), 0);

    sessionStatus = 'guest';
    await act(async () => renderer?.update(createElement(IndexScreen)));
    assert.equal(rendered('GuestLocalScreen').length, 1);
  });

  it('keeps active accounts on the existing Home route', async () => {
    sessionStatus = 'valid';
    await renderLoginScreen('web');

    assert.deepEqual(rendered('GuestLocalScreen'), []);
    assert.deepEqual(
      replace.mock.calls.map(({ arguments: args }) => args),
      [['/home']],
    );
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
