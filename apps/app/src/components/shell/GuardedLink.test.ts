import assert from 'node:assert/strict';
import { afterEach, before, describe, it, mock } from 'node:test';
import { createElement, useEffect } from 'react';
import { act, create } from 'react-test-renderer';
import type { LinkProps } from 'expo-router';
import type { ReactElement, ReactNode } from 'react';
import type { ReactTestRenderer } from 'react-test-renderer';
import type { GuardedLink as GuardedLinkExport } from './GuardedLink';
import type {
  GuardedNavigationAction,
  NavigationGuardProvider as NavigationGuardProviderExport,
  NavigationRequestHandler,
  useNavigationGuard as useNavigationGuardExport,
} from './NavigationGuardContext';

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

const navigations: string[] = [];
let linkPress: LinkPress | undefined;
let composedLinkPress: LinkPress | undefined;
let rootLinkPress: LinkPress | undefined;
let renderer: ReactTestRenderer | null = null;

const mockModule = (specifier: string | URL, exports: object) =>
  mock.module(specifier, {
    exports,
  } as unknown as Parameters<typeof mock.module>[1]);

mockModule('expo-router', {
  Link: (props: RenderedLinkProps & { children: ReactNode }) => {
    const childPress = props.children.props.onPress;
    linkPress = childPress;
    composedLinkPress = (event) => {
      childPress?.(event as unknown as Parameters<LinkPress>[0]);
      if (shouldHandleNavigation(event as unknown as LinkPressEvent)) {
        event.preventDefault();
        navigations.push(props.href);
      }
    };
    rootLinkPress = props.onPress;
    return createElement('Link', props, props.children);
  },
  useRouter: () => ({
    navigate: (href: string) => navigations.push(href),
  }),
});
mockModule('react-native', {
  Platform: { OS: 'web' },
});

let GuardedLink: typeof GuardedLinkExport;
let NavigationGuardProvider: typeof NavigationGuardProviderExport;
let useNavigationGuard: typeof useNavigationGuardExport;

before(async () => {
  ({ GuardedLink } = await import('./GuardedLink'));
  ({ NavigationGuardProvider, useNavigationGuard } = await import('./NavigationGuardContext'));
});

afterEach(async () => {
  if (renderer) {
    await act(async () => renderer?.unmount());
    renderer = null;
  }
  linkPress = undefined;
  composedLinkPress = undefined;
  rootLinkPress = undefined;
  navigations.length = 0;
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

const renderLink = async (handler: NavigationRequestHandler, onNavigate?: () => void) => {
  await act(async () => {
    renderer = create(
      createElement(
        NavigationGuardProvider,
        null,
        createElement(GuardRegistrar, { handler }),
        createElement(GuardedLink, {
          children: createElement(TestPressable),
          href: '/timeline',
          onNavigate,
        }),
      ),
    );
  });
  assert.equal(rootLinkPress, undefined);
  assert.ok(linkPress);
  assert.ok(composedLinkPress);
};

describe('GuardedLink', () => {
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

  it('Web modifier click은 현재 편집 route를 떠나지 않으므로 guard가 가로채지 않는다', async () => {
    const handler = mock.fn(() => true);
    const onNavigate = mock.fn();
    await renderLink(handler, onNavigate);
    const event = createPressEvent({ metaKey: true });

    await act(async () => composedLinkPress?.(event as unknown as Parameters<LinkPress>[0]));

    assert.equal(handler.mock.callCount(), 0);
    assert.equal(onNavigate.mock.callCount(), 0);
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
