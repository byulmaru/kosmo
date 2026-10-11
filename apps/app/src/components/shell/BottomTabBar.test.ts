import assert from 'node:assert/strict';
import { afterEach, before, describe, it, mock } from 'node:test';
import { createElement } from 'react';
import { act, create } from 'react-test-renderer';
import type { ReactNode } from 'react';
import type { ReactTestRenderer } from 'react-test-renderer';
import type {
  BottomTabBarRenderControlProps,
  BottomTabDestination,
} from '@/components/ui/navigationChrome';
import type { BottomTabBar as Component } from './BottomTabBar';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
const platform = { OS: 'ios' };
let pathname = '/home';
let renderer: ReactTestRenderer | undefined;
const calls: string[] = [];
const destinations: BottomTabDestination[] = [
  'home',
  'search',
  'compose',
  'notifications',
  'profile',
];
const mockModule = (path: string | URL, exports: object) =>
  mock.module(path, { exports } as unknown as Parameters<typeof mock.module>[1]);
mockModule('expo-router', { usePathname: () => pathname });
mockModule('react-native', { Platform: platform });
mockModule('react-native-safe-area-context', { useSafeAreaInsets: () => ({ bottom: 0 }) });
mockModule('react-relay', {
  graphql: () => ({}),
  useFragment: (_fragment: unknown, key: unknown) => key,
});
mockModule(new URL('../ui/BottomTabBar.tsx', import.meta.url), {
  BottomTabBar: (props: {
    currentDestination: BottomTabDestination;
    renderControl: (props: BottomTabBarRenderControlProps) => ReactNode;
  }) =>
    createElement(
      'TabBar',
      {},
      destinations.map((destination) =>
        createElement(
          'Control',
          { key: destination, destination },
          props.renderControl({
            children: createElement('Button', { destination }),
            destination,
            selected: destination === props.currentDestination,
          } as BottomTabBarRenderControlProps),
        ),
      ),
    ),
});
mockModule(new URL('./NavigationLink.tsx', import.meta.url), {
  NavigationLink: (props: { children: ReactNode }) =>
    createElement('NavigationLink', props, props.children),
});
mockModule(new URL('./ShellChromeContext.tsx', import.meta.url), {
  useShellChrome: () => ({
    reselectHome: () => calls.push('refresh-home'),
    reselectNativeTab: (destination: string) => calls.push(`scroll-${destination}`),
  }),
});
let BottomTabBar: typeof Component;
before(async () => {
  ({ BottomTabBar } = await import('./BottomTabBar'));
});
afterEach(async () => {
  await act(async () => renderer?.unmount());
  renderer = undefined;
  calls.length = 0;
});
async function render(os: string, path: string) {
  platform.OS = os;
  pathname = path;
  await act(async () => {
    renderer = create(
      createElement(BottomTabBar, {
        profile: { relativeHandle: '@me', displayName: 'Me' } as never,
        onHomeReselect: () => calls.push('web-home'),
        onComposeOpen: () => calls.push('compose'),
      }),
    );
  });
}
function link(destination: BottomTabDestination) {
  return renderer!.root
    .findAll((node) => (node.type as unknown) === 'Control')
    .find((node) => node.props.destination === destination)!
    .find((node) => (node.type as unknown) === 'NavigationLink');
}
describe('bottom navigation reselection', () => {
  for (const [destination, path] of [
    ['home', '/home'],
    ['home', '/local'],
    ['search', '/search'],
    ['notifications', '/notifications'],
    ['profile', '/@me'],
  ] as const) {
    it(`iOS ${path} keeps its route and invokes only its scroll/refresh actions`, async () => {
      await render('ios', path);
      const current = link(destination).props;
      assert.equal(current.current, true);
      assert.equal(current.navigationMode, 'switch');
      current.onCurrentNavigate();
      assert.deepEqual(
        calls,
        destination === 'home' ? ['scroll-home', 'refresh-home'] : [`scroll-${destination}`],
      );
      if (path === '/local') {
        assert.equal(current.href, '/home');
      }
      assert.equal(
        link(destination === 'search' ? 'notifications' : 'search').props.current,
        false,
      );
    });
  }
  it('Web keeps the existing Home action and other link behavior', async () => {
    await render('web', '/home');
    link('home').props.onCurrentNavigate();
    assert.deepEqual(calls, ['web-home']);
    assert.equal(link('search').props.onCurrentNavigate, undefined);
  });
  it('Android does not install native reselection actions', async () => {
    await render('android', '/search');
    assert.equal(link('search').props.onCurrentNavigate, undefined);
    assert.deepEqual(calls, []);
  });
  it('compose still opens the shared composer', async () => {
    await render('ios', '/search');
    const control = renderer!.root
      .findAll((node) => (node.type as unknown) === 'Control')
      .find((node) => node.props.destination === 'compose')!;
    control.find((node) => (node.type as unknown) === 'Button').props.onPress();
    assert.deepEqual(calls, ['compose']);
  });
});
