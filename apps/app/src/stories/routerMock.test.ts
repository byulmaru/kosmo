import assert from 'node:assert/strict';
import { it, mock } from 'node:test';
import React, { createElement } from 'react';
import { act, create } from 'react-test-renderer';
import type { ReactTestRenderer } from 'react-test-renderer';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
mock.module('react-native', {
  exports: { Platform: { OS: 'web' }, Text: 'Text' },
} as unknown as Parameters<typeof mock.module>[1]);

it('uses the latest navigation observer and preserves back history', async () => {
  const previousReact = (globalThis as { React?: unknown }).React;
  Object.assign(globalThis, { React });
  const { RouterMockProvider, usePathname, useRouter } =
    await import('../../.storybook/mocks/expo-router');
  const params = {};
  const segments: readonly string[] = [];
  const oldCalls: unknown[] = [];
  const newCalls: unknown[] = [];
  const oldObserver = (href: unknown) => oldCalls.push(href);
  const newObserver = (href: unknown) => newCalls.push(href);
  function Probe() {
    const router = useRouter();
    return createElement('router-probe', { ...router, pathname: usePathname() });
  }
  const render = (onNavigate: (href: unknown) => void) =>
    createElement(RouterMockProvider, { onNavigate, params, segments }, createElement(Probe));
  let renderer: ReactTestRenderer | undefined;
  try {
    await act(async () => {
      renderer = create(render(oldObserver));
    });
    await act(async () => {
      renderer!.update(render(newObserver));
    });
    await act(async () => {
      renderer!.root.findByType('router-probe' as never).props.push('/next');
    });
    assert.deepEqual(oldCalls, []);
    assert.deepEqual(newCalls, ['/next']);
    assert.equal(renderer!.root.findByType('router-probe' as never).props.pathname, '/next');
    assert.equal(renderer!.root.findByType('router-probe' as never).props.canGoBack(), true);
    await act(async () => {
      renderer!.root.findByType('router-probe' as never).props.back();
    });
    assert.equal(renderer!.root.findByType('router-probe' as never).props.pathname, '/home');
    assert.equal(renderer!.root.findByType('router-probe' as never).props.canGoBack(), false);
    assert.deepEqual(newCalls, ['/next']);
  } finally {
    await act(async () => {
      renderer?.unmount();
    });
    Object.assign(globalThis, { React: previousReact });
  }
});
