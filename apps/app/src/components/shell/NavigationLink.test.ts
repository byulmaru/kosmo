import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { afterEach, before, describe, it, mock } from 'node:test';
import { createElement, createRef, useEffect, useImperativeHandle } from 'react';
import { act, create } from 'react-test-renderer';
import type { Href, LinkProps } from 'expo-router';
import type { ReactElement, ReactNode, Ref } from 'react';
import type { View } from 'react-native';
import type { ReactTestRenderer } from 'react-test-renderer';
import type {
  GuardedNavigationAction,
  NavigationGuardProvider as NavigationGuardProviderExport,
  NavigationRequestHandler,
  useNavigationGuard as useNavigationGuardExport,
} from './NavigationGuardContext';
import type { NavigationLink as NavigationLinkExport } from './NavigationLink';
import type {
  PrimaryNavigationScrollProvider as PrimaryNavigationScrollProviderExport,
  usePrimaryNavigationScroll as usePrimaryNavigationScrollExport,
} from './PrimaryNavigationScrollContext';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

type LinkPressEvent = {
  altKey?: boolean;
  button?: number;
  ctrlKey?: boolean;
  currentTarget?: { target?: string | null };
  defaultPrevented?: boolean;
  metaKey?: boolean;
  preventDefault: ReturnType<typeof mock.fn>;
  shiftKey?: boolean;
};

type LinkPress = NonNullable<LinkProps['onPress']>;

type RenderedLinkProps = {
  children: ReactElement<{ onPress?: LinkPress }>;
  href: string;
  onPress?: LinkPress;
};

const require = createRequire(import.meta.url);
const { Slot } = createRequire(require.resolve('expo-router/build/ui/Slot'))(
  '@radix-ui/react-slot',
);

const navigations: string[] = [];
const routerActions: Array<{ href: string; mode: 'navigate' | 'push' | 'replace' }> = [];
const platform: { OS: 'web' | 'ios' } = { OS: 'web' };
let currentPathname = '/home';
let consumeIntent: ((pathname: string) => boolean) | undefined;
let linkPress: LinkPress | undefined;
let composedLinkPress: LinkPress | undefined;
let renderer: ReactTestRenderer | null = null;

const mockModule = (specifier: string | URL, exports: object) =>
  mock.module(specifier, {
    exports,
  } as unknown as Parameters<typeof mock.module>[1]);

mockModule('expo-router', {
  Link: (props: RenderedLinkProps & { children: ReactNode }) => {
    const navigate = (event: LinkPressEvent) => {
      if (shouldHandleNavigation(event)) {
        event.preventDefault();
        navigations.push(props.href);
      }
    };
    const handlePress = (event: Parameters<LinkPress>[0]) => {
      props.onPress?.(event);
      navigate(event as unknown as LinkPressEvent);
    };
    return createElement(
      Slot,
      {
        href: props.href,
        style: undefined,
        ...(platform.OS === 'web'
          ? { onClick: handlePress, onPress: props.onPress ?? navigate }
          : { onPress: handlePress }),
      },
      props.children,
    );
  },
  useRouter: () => ({
    navigate: (href: string) => {
      routerActions.push({ href, mode: 'navigate' });
      navigations.push(href);
    },
    push: (href: string) => routerActions.push({ href, mode: 'push' }),
    replace: (href: string) => routerActions.push({ href, mode: 'replace' }),
  }),
  usePathname: () => currentPathname,
});
mockModule('react-native', {
  Platform: platform,
});

let NavigationLink: typeof NavigationLinkExport;
let NavigationGuardProvider: typeof NavigationGuardProviderExport;
let useNavigationGuard: typeof useNavigationGuardExport;
let PrimaryNavigationScrollProvider: typeof PrimaryNavigationScrollProviderExport;
let usePrimaryNavigationScroll: typeof usePrimaryNavigationScrollExport;

before(async () => {
  ({ NavigationLink } = await import('./NavigationLink'));
  ({ NavigationGuardProvider, useNavigationGuard } = await import('./NavigationGuardContext'));
  ({ PrimaryNavigationScrollProvider, usePrimaryNavigationScroll } =
    await import('./PrimaryNavigationScrollContext'));
});

afterEach(async () => {
  if (renderer) {
    await act(async () => renderer?.unmount());
    renderer = null;
  }
  linkPress = undefined;
  composedLinkPress = undefined;
  consumeIntent = undefined;
  currentPathname = '/home';
  navigations.length = 0;
  routerActions.length = 0;
  platform.OS = 'web';
  mock.restoreAll();
});

function GuardRegistrar({ handler }: { handler: NavigationRequestHandler }) {
  const { register } = useNavigationGuard();
  useEffect(() => register(handler), [handler, register]);
  return null;
}

function TestPressable(props: { onPress?: LinkPress }) {
  return createElement('Pressable', props);
}

function PrimaryNavigationProbe() {
  consumeIntent = usePrimaryNavigationScroll().consume;
  return null;
}

function createPressEvent(overrides: Omit<LinkPressEvent, 'preventDefault'> = {}) {
  const event = {
    ...overrides,
    preventDefault: mock.fn(() => {
      event.defaultPrevented = true;
    }),
  } as LinkPressEvent;
  return event;
}

function shouldHandleNavigation(event: LinkPressEvent) {
  return (
    !event.defaultPrevented &&
    !event.metaKey &&
    !event.altKey &&
    !event.ctrlKey &&
    !event.shiftKey &&
    (event.button == null || event.button === 0) &&
    [undefined, null, '', 'self'].includes(event.currentTarget?.target)
  );
}

const renderLink = async (
  handler: NavigationRequestHandler,
  onNavigate?: () => void,
  options: {
    child?: Parameters<typeof NavigationLinkExport>[0]['children'];
    current?: boolean;
    href?: Href;
    navigationMode?: 'push' | 'switch';
    onCurrentNavigate?: () => void;
    primary?: boolean;
  } = {},
) => {
  await act(async () => {
    renderer = create(
      createElement(
        PrimaryNavigationScrollProvider,
        null,
        createElement(
          NavigationGuardProvider,
          null,
          createElement(PrimaryNavigationProbe),
          createElement(GuardRegistrar, { handler }),
          createElement(NavigationLink, {
            current: options.current,
            children: options.child ?? createElement(TestPressable),
            href: options.href ?? '/timeline',
            navigationMode: options.navigationMode,
            onNavigate,
            onCurrentNavigate: options.onCurrentNavigate,
            primary: options.primary,
          }),
        ),
      ),
    );
  });
  const control = renderer!.root.findAll((node) => (node.type as unknown) === 'Pressable')[0]!;
  linkPress = control.props.onPress;
  composedLinkPress = control.props.onClick ?? control.props.onPress;
  assert.ok(linkPress);
  assert.ok(composedLinkPress);
};

describe('NavigationLink', () => {
  it('Web inline link는 Slot의 click에서도 자식의 전파 차단 후 목적지로 한 번만 이동한다', async () => {
    const stopPropagation = mock.fn();
    await renderLink(() => false, undefined, {
      child: createElement('Pressable', {
        onPress: (event: { stopPropagation: () => void }) => event.stopPropagation(),
      }),
      href: '/@mentioned-profile',
    });
    const event = { ...createPressEvent(), stopPropagation };
    await act(async () => composedLinkPress?.(event as unknown as Parameters<LinkPress>[0]));
    assert.equal(stopPropagation.mock.callCount(), 1);
    assert.deepEqual(navigations, ['/@mentioned-profile']);
  });

  it('Slot을 거쳐도 자식 ref로 포커스를 복원하고 unmount 시 해제한다', async () => {
    const focus = mock.fn();
    const childRef = createRef<View>();
    function FocusableChild(props: { ref?: Ref<View>; onPress?: LinkPress }) {
      useImperativeHandle(props.ref, () => ({ focus }) as unknown as View, []);
      return createElement('Pressable', { onPress: props.onPress });
    }
    await renderLink(() => false, undefined, {
      child: createElement(FocusableChild, { ref: childRef }),
    });
    assert.ok(childRef.current);
    childRef.current.focus();
    assert.equal(focus.mock.callCount(), 1);
    await act(async () => renderer!.unmount());
    renderer = null;
    assert.equal(childRef.current, null);
  });

  it('실제 Slot을 거친 링크도 자식의 기본·pressed 스타일을 유지한다', async () => {
    await renderLink(() => false, undefined, {
      child: createElement('Pressable', {
        style: ({ pressed }: { pressed: boolean }) => ({
          backgroundColor: '#141414',
          borderWidth: 1,
          opacity: pressed ? 0.85 : 1,
        }),
      }),
    });
    const control = renderer!.root.findAll((node) => (node.type as unknown) === 'Pressable')[0]!;
    assert.equal(control.props.href, '/timeline');
    for (const pressed of [false, true]) {
      assert.deepEqual(Object.assign({}, ...control.props.style({ pressed })), {
        backgroundColor: '#141414',
        borderWidth: 1,
        opacity: pressed ? 0.85 : 1,
      });
    }
  });

  it('guard가 이탈을 보류하면 기본 Link를 막고 승인된 action만 실행한다', async () => {
    let pendingAction: GuardedNavigationAction | null = null;
    const onNavigate = mock.fn();
    await renderLink((action) => {
      pendingAction = action;
      return true;
    }, onNavigate);
    const event = createPressEvent();

    await act(async () => composedLinkPress?.(event as unknown as Parameters<LinkPress>[0]));

    assert.equal(event.preventDefault.mock.callCount(), 1);
    assert.equal(onNavigate.mock.callCount(), 0);
    assert.deepEqual(navigations, []);
    const approvedAction = pendingAction as GuardedNavigationAction | null;
    assert.ok(approvedAction);
    await act(async () => approvedAction());
    assert.equal(onNavigate.mock.callCount(), 1);
    assert.deepEqual(navigations, ['/timeline']);
  });

  it('guard가 없으면 Link 기본 navigation과 surface 닫기를 유지한다', async () => {
    const onNavigate = mock.fn();
    await renderLink(() => false, onNavigate);
    const event = createPressEvent();

    await act(async () => composedLinkPress?.(event as unknown as Parameters<LinkPress>[0]));

    assert.equal(event.preventDefault.mock.callCount(), 1);
    assert.equal(onNavigate.mock.callCount(), 1);
    assert.deepEqual(navigations, ['/timeline']);
  });

  it('Native 최상위 전환은 router.replace를 실행한다', async () => {
    let pendingAction: GuardedNavigationAction | null = null;
    platform.OS = 'ios';
    await renderLink(
      (action) => {
        pendingAction = action;
        return true;
      },
      undefined,
      {
        href: '/search',
        navigationMode: 'switch',
      },
    );

    await act(async () => linkPress?.(createPressEvent() as unknown as Parameters<LinkPress>[0]));
    assert.ok(pendingAction);
    await act(async () => pendingAction?.());

    assert.deepEqual(routerActions, [{ href: '/search', mode: 'replace' }]);
  });

  it('Native 계층 이동은 기본 router.push를 실행한다', async () => {
    let pendingAction: GuardedNavigationAction | null = null;
    platform.OS = 'ios';
    await renderLink(
      (action) => {
        pendingAction = action;
        return true;
      },
      undefined,
      { href: '/post/1' },
    );

    await act(async () => linkPress?.(createPressEvent() as unknown as Parameters<LinkPress>[0]));
    assert.ok(pendingAction);
    await act(async () => pendingAction?.());

    assert.deepEqual(routerActions, [{ href: '/post/1', mode: 'push' }]);
  });

  it('실제 무guard primary navigation에서만 scroll intent를 기록한다', async () => {
    currentPathname = '/home';
    await renderLink(() => false, undefined, { href: '/search', primary: true });
    const event: LinkPressEvent = { preventDefault: mock.fn() };

    await act(async () => linkPress?.(event as unknown as Parameters<LinkPress>[0]));

    assert.equal(consumeIntent?.('/search'), true);
  });

  it('guard 승인 action에서 scroll intent를 기록하고 취소 시에는 기록하지 않는다', async () => {
    let pendingAction: GuardedNavigationAction | null = null;
    await renderLink(
      (action) => {
        pendingAction = action;
        return true;
      },
      undefined,
      { href: '/timeline', primary: true },
    );
    const event: LinkPressEvent = { preventDefault: mock.fn() };

    await act(async () => linkPress?.(event as unknown as Parameters<LinkPress>[0]));
    assert.equal(consumeIntent?.('/timeline'), false);

    const approvedAction = pendingAction as GuardedNavigationAction | null;
    assert.ok(approvedAction);
    approvedAction();
    assert.equal(consumeIntent?.('/timeline'), true);

    await act(async () => renderer?.unmount());
    renderer = null;
    pendingAction = null;
    await renderLink(() => true, undefined, { href: '/notifications', primary: true });
    await act(async () => linkPress?.(event as unknown as Parameters<LinkPress>[0]));
    assert.equal(consumeIntent?.('/notifications'), false);
  });

  it('현재 primary route 재선택은 scroll intent를 기록하지 않는다', async () => {
    currentPathname = '/home';
    await renderLink(() => false, undefined, { href: '/home', primary: true });
    const event: LinkPressEvent = { preventDefault: mock.fn() };

    await act(async () => linkPress?.(event as unknown as Parameters<LinkPress>[0]));

    assert.equal(consumeIntent?.('/home'), false);
  });

  it('현재 Home 재선택은 route guard와 navigation 없이 surface close와 local action을 실행한다', async () => {
    const guard = mock.fn(() => true);
    const onNavigate = mock.fn();
    const onCurrentNavigate = mock.fn();
    currentPathname = '/home';
    await renderLink(guard, onNavigate, {
      href: '/home',
      onCurrentNavigate,
      primary: true,
    });
    const event = createPressEvent();

    await act(async () => composedLinkPress?.(event as unknown as Parameters<LinkPress>[0]));

    assert.equal(event.preventDefault.mock.callCount(), 1);
    assert.equal(guard.mock.callCount(), 0);
    assert.equal(onNavigate.mock.callCount(), 1);
    assert.equal(onCurrentNavigate.mock.callCount(), 1);
    assert.deepEqual(navigations, []);
    assert.equal(consumeIntent?.('/home'), false);
  });

  it('현재 Local 화면군은 /home link를 유지하면서 재선택 callback을 실행한다', async () => {
    const guard = mock.fn(() => true);
    const onNavigate = mock.fn();
    const onCurrentNavigate = mock.fn();
    currentPathname = '/local';
    await renderLink(guard, onNavigate, {
      current: true,
      href: '/home',
      onCurrentNavigate,
      primary: true,
    });
    const event = createPressEvent();

    await act(async () => composedLinkPress?.(event as unknown as Parameters<LinkPress>[0]));

    assert.equal(event.preventDefault.mock.callCount(), 1);
    assert.equal(guard.mock.callCount(), 0);
    assert.equal(onNavigate.mock.callCount(), 1);
    assert.equal(onCurrentNavigate.mock.callCount(), 1);
    assert.deepEqual(navigations, []);
  });

  it('Web modifier click은 현재 편집 route를 떠나지 않으므로 guard가 가로채지 않는다', async () => {
    const handler = mock.fn(() => true);
    const onNavigate = mock.fn();
    const onCurrentNavigate = mock.fn();
    await renderLink(handler, onNavigate, { onCurrentNavigate });
    const event = createPressEvent({ metaKey: true });

    await act(async () => composedLinkPress?.(event as unknown as Parameters<LinkPress>[0]));

    assert.equal(handler.mock.callCount(), 0);
    assert.equal(onNavigate.mock.callCount(), 0);
    assert.equal(onCurrentNavigate.mock.callCount(), 0);
    assert.equal(event.preventDefault.mock.callCount(), 0);
  });

  it('defaultPrevented와 middle click은 surface를 닫거나 guard를 실행하지 않는다', async () => {
    const handler = mock.fn(() => true);
    const onNavigate = mock.fn();
    await renderLink(handler, onNavigate);

    await act(async () =>
      composedLinkPress?.(
        createPressEvent({ defaultPrevented: true }) as unknown as Parameters<LinkPress>[0],
      ),
    );
    await act(async () =>
      composedLinkPress?.(createPressEvent({ button: 1 }) as unknown as Parameters<LinkPress>[0]),
    );

    assert.equal(handler.mock.callCount(), 0);
    assert.equal(onNavigate.mock.callCount(), 0);
  });
});
