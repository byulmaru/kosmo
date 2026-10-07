import assert from 'node:assert/strict';
import { afterEach, before, describe, it, mock } from 'node:test';
import { createElement } from 'react';
import { act, create } from 'react-test-renderer';
import type { PropsWithChildren } from 'react';
import type { ReactTestRenderer } from 'react-test-renderer';
import type ProtectedLayoutComponent from './_layout';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const platform = { OS: 'web' };
function MockSlot({ children }: PropsWithChildren) {
  return createElement('div', null, children);
}
function MockSplash(props: { label: string }) {
  return createElement('div', { 'data-label': props.label });
}
let pathname = '/notifications';
let status = 'valid';
const replace = mock.fn();
let renderer: ReactTestRenderer | null = null;
let ProtectedLayout: typeof ProtectedLayoutComponent;

const mockModule = (specifier: string | URL, exports: object) =>
  mock.module(specifier, { exports } as unknown as Parameters<typeof mock.module>[1]);

mockModule('expo-router', {
  Slot: MockSlot,
  Stack: 'Stack',
  usePathname: () => pathname,
  useRouter: () => ({ replace }),
});
mockModule('react-native', { Platform: platform });
mockModule('@/components/Splash', {
  Splash: MockSplash,
});
mockModule('@/session/SessionProvider', { useSession: () => ({ status }) });

before(async () => {
  ({ default: ProtectedLayout } = await import('./_layout'));
});

afterEach(async () => {
  if (renderer) {
    await act(async () => renderer?.unmount());
    renderer = null;
  }
  pathname = '/notifications';
  status = 'valid';
  replace.mock.resetCalls();
  mock.restoreAll();
});

describe('ProtectedLayout operational-only route access', () => {
  it('renders only the notifications route for an operational-only session', async () => {
    status = 'operational';

    await act(async () => {
      renderer = create(createElement(ProtectedLayout));
    });

    assert.equal(renderer?.root.findAllByType(MockSlot).length, 1);
    assert.equal(replace.mock.callCount(), 0);
  });

  it('redirects other protected routes before mounting their screens', async () => {
    status = 'operational';
    pathname = '/home';

    await act(async () => {
      renderer = create(createElement(ProtectedLayout));
    });

    assert.deepEqual(
      replace.mock.calls.map(({ arguments: args }) => args),
      [['/notifications']],
    );
    assert.equal(renderer?.root.findAllByType(MockSplash).length, 1);
    assert.equal(renderer?.root.findAllByType(MockSlot).length, 0);
  });
});
