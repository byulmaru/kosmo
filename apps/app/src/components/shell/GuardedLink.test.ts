import assert from 'node:assert/strict';
import { afterEach, before, describe, it, mock } from 'node:test';
import { createElement, useEffect } from 'react';
import { act, create } from 'react-test-renderer';
import type { ReactNode } from 'react';
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
  button?: number;
  defaultPrevented?: boolean;
  metaKey?: boolean;
  preventDefault: ReturnType<typeof mock.fn>;
};

type RenderedLinkProps = {
  onPress: (event: LinkPressEvent) => void;
};

const navigations: string[] = [];
let linkProps: RenderedLinkProps | null = null;
let renderer: ReactTestRenderer | null = null;

const mockModule = (specifier: string | URL, exports: object) =>
  mock.module(specifier, {
    exports,
  } as unknown as Parameters<typeof mock.module>[1]);

mockModule('expo-router', {
  Link: (props: RenderedLinkProps & { children: ReactNode }) => {
    linkProps = props;
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
  linkProps = null;
  navigations.length = 0;
  mock.restoreAll();
});

function GuardRegistrar({ handler }: { handler: NavigationRequestHandler }) {
  const { register } = useNavigationGuard();
  useEffect(() => register(handler), [handler, register]);
  return null;
}

const renderLink = async (handler: NavigationRequestHandler, onNavigate?: () => void) => {
  await act(async () => {
    renderer = create(
      createElement(
        NavigationGuardProvider,
        null,
        createElement(GuardRegistrar, { handler }),
        createElement(GuardedLink, { href: '/timeline', onNavigate }, createElement('Pressable')),
      ),
    );
  });
  assert.ok(linkProps);
};

describe('GuardedLink', () => {
  it('guard가 이탈을 보류하면 기본 Link를 막고 승인된 action만 실행한다', async () => {
    let pendingAction: GuardedNavigationAction | null = null;
    await renderLink((action) => {
      pendingAction = action;
      return true;
    });
    const event: LinkPressEvent = { preventDefault: mock.fn() };

    await act(async () => linkProps?.onPress(event));

    assert.equal(event.preventDefault.mock.callCount(), 1);
    assert.deepEqual(navigations, []);
    const approvedAction = pendingAction as GuardedNavigationAction | null;
    assert.ok(approvedAction);
    approvedAction();
    assert.deepEqual(navigations, ['/timeline']);
  });

  it('guard가 없으면 Link 기본 navigation과 surface 닫기를 유지한다', async () => {
    const onNavigate = mock.fn();
    await renderLink(() => false, onNavigate);
    const event: LinkPressEvent = { preventDefault: mock.fn() };

    await act(async () => linkProps?.onPress(event));

    assert.equal(event.preventDefault.mock.callCount(), 0);
    assert.equal(onNavigate.mock.callCount(), 1);
    assert.deepEqual(navigations, []);
  });

  it('Web modifier click은 현재 편집 route를 떠나지 않으므로 guard가 가로채지 않는다', async () => {
    const handler = mock.fn(() => true);
    const onNavigate = mock.fn();
    await renderLink(handler, onNavigate);
    const event: LinkPressEvent = { metaKey: true, preventDefault: mock.fn() };

    await act(async () => linkProps?.onPress(event));

    assert.equal(handler.mock.callCount(), 0);
    assert.equal(onNavigate.mock.callCount(), 0);
    assert.equal(event.preventDefault.mock.callCount(), 0);
  });
});
