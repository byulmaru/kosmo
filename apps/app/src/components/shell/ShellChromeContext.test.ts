import assert from 'node:assert/strict';
import { before, mock, test } from 'node:test';
import { createElement, memo } from 'react';
import { act, create } from 'react-test-renderer';
import { ShellChromeProvider, useShellChrome, useShellChromeActions } from './ShellChromeContext';
import type * as PostActionAuthenticationModule from '../post/PostActionAuthentication';

const testRouter = { push: () => undefined };
const mockModule = (specifier: string, exports: object) =>
  mock.module(specifier, { exports } as unknown as Parameters<typeof mock.module>[1]);
mockModule('expo-router', { useRouter: () => testRouter });
mockModule('react-native', { Platform: { OS: 'ios' } });
mockModule('@/auth/webLogin', { startWebLogin: () => undefined });
mockModule('@/session/SessionProvider', {
  useSession: () => ({ selectedProfileId: null, status: 'guest' }),
});

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let PostActionAuthenticationProvider: typeof PostActionAuthenticationModule.PostActionAuthenticationProvider;
let usePostActionAuthentication: typeof PostActionAuthenticationModule.usePostActionAuthentication;
before(async () => {
  ({ PostActionAuthenticationProvider, usePostActionAuthentication } =
    await import('../post/PostActionAuthentication'));
});

test('경로만 바뀐 shell 갱신은 chrome 소비자를 다시 렌더링하지 않고 실제 drawer 변경은 전달한다', async () => {
  let renders = 0;
  const Consumer = memo(function Consumer() {
    renders += 1;
    return createElement('drawer-state', { open: useShellChrome()?.navigationDrawerOpen });
  });
  const actions = {
    openNavigationDrawer: () => {},
    openProfileSwitcher: () => {},
    registerHomeReselection: () => () => {},
    reselectHome: () => {},
  };
  const render = (open: boolean) =>
    createElement(ShellChromeProvider, {
      ...actions,
      navigationDrawerOpen: open,
      children: createElement(Consumer),
    });
  let renderer: ReturnType<typeof create>;
  await act(async () => {
    renderer = create(render(false));
  });
  try {
    const initialRenders = renders;
    await act(async () => {
      renderer.update(render(false));
    });
    assert.equal(renders, initialRenders);
    await act(async () => {
      renderer.update(render(true));
    });
    assert.equal(
      renderer!.root.find((node) => (node.type as unknown) === 'drawer-state').props.open,
      true,
    );
    assert.equal(renders, initialRenders + 1);
  } finally {
    await act(async () => {
      renderer!.unmount();
    });
  }
});

test('drawer 변경은 tab 재선택 전용 소비자를 다시 렌더링하지 않는다', async () => {
  let drawerRenders = 0;
  let tabRenders = 0;
  const DrawerConsumer = memo(function DrawerConsumer() {
    drawerRenders += 1;
    return createElement('drawer-state', { open: useShellChrome()?.navigationDrawerOpen });
  });
  const TabConsumer = memo(function TabConsumer() {
    tabRenders += 1;
    return createElement('tab-state', {
      register: useShellChromeActions()?.registerTabReselection,
    });
  });
  const actions = {
    openNavigationDrawer: () => {},
    openProfileSwitcher: () => {},
    registerHomeReselection: () => () => {},
    registerTabReselection: () => () => {},
    reselectTab: () => {},
    reselectHome: () => {},
  };
  const render = (open: boolean) =>
    createElement(
      ShellChromeProvider,
      {
        ...actions,
        navigationDrawerOpen: open,
      },
      createElement(DrawerConsumer),
      createElement(TabConsumer),
    );
  let renderer: ReturnType<typeof create>;
  await act(async () => {
    renderer = create(render(false));
  });
  try {
    assert.equal(drawerRenders, 1);
    assert.equal(tabRenders, 1);
    await act(async () => {
      renderer.update(render(true));
    });
    assert.equal(drawerRenders, 2);
    assert.equal(tabRenders, 1);
    await act(async () => {
      renderer.update(render(false));
    });
    assert.equal(drawerRenders, 3);
    assert.equal(tabRenders, 1);
  } finally {
    await act(async () => {
      renderer.unmount();
    });
  }
});

test('drawer 변경은 PostActionAuthentication의 profile action 소비자를 다시 렌더링하지 않는다', async () => {
  let consumerRenders = 0;
  let resolveProfile: (() => void) | undefined;
  let profileSwitcherCalls = 0;
  const Consumer = memo(function Consumer() {
    consumerRenders += 1;
    resolveProfile = usePostActionAuthentication(true).resolve.bind(null, 'profile');
    return createElement('post-action');
  });
  const actions = {
    openNavigationDrawer: () => {},
    openProfileSwitcher: () => {
      profileSwitcherCalls += 1;
    },
    registerHomeReselection: () => () => {},
    registerTabReselection: () => () => {},
    reselectTab: () => {},
    reselectHome: () => {},
  };
  const render = (open: boolean) =>
    createElement(
      ShellChromeProvider,
      { ...actions, navigationDrawerOpen: open },
      createElement(PostActionAuthenticationProvider, null, createElement(Consumer)),
    );
  let renderer: ReturnType<typeof create>;
  await act(async () => {
    renderer = create(render(false));
  });
  try {
    assert.equal(consumerRenders, 1);
    await act(async () => {
      renderer.update(render(true));
    });
    assert.equal(consumerRenders, 1);
    await act(async () => {
      resolveProfile?.();
    });
    assert.equal(profileSwitcherCalls, 1);
  } finally {
    await act(async () => {
      renderer.unmount();
    });
  }
});
