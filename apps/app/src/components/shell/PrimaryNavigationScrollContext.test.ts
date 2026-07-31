import assert from 'node:assert/strict';
import { afterEach, before, describe, it, mock } from 'node:test';
import { createElement } from 'react';
import { act, create } from 'react-test-renderer';
import type { ReactTestRenderer } from 'react-test-renderer';
import type {
  PrimaryNavigationScrollProvider as PrimaryNavigationScrollProviderExport,
  PrimaryNavigationScrollReset as PrimaryNavigationScrollResetExport,
  usePrimaryNavigationScroll as usePrimaryNavigationScrollExport,
} from './PrimaryNavigationScrollContext';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const platform = { OS: 'web' };
const scrollTo = mock.fn();
let renderer: ReactTestRenderer | null = null;
let recordIntent: ((pathname: string) => void) | undefined;

const mockModule = (specifier: string | URL, exports: object) =>
  mock.module(specifier, {
    exports,
  } as unknown as Parameters<typeof mock.module>[1]);

mockModule('react-native', { Platform: platform });

let PrimaryNavigationScrollProvider: typeof PrimaryNavigationScrollProviderExport;
let PrimaryNavigationScrollReset: typeof PrimaryNavigationScrollResetExport;
let usePrimaryNavigationScroll: typeof usePrimaryNavigationScrollExport;

before(async () => {
  ({ PrimaryNavigationScrollProvider, PrimaryNavigationScrollReset, usePrimaryNavigationScroll } =
    await import('./PrimaryNavigationScrollContext'));
  (globalThis as unknown as { window?: { scrollTo: typeof scrollTo } }).window = { scrollTo };
});

afterEach(async () => {
  if (renderer) {
    await act(async () => renderer?.unmount());
    renderer = null;
  }
  recordIntent = undefined;
  platform.OS = 'web';
  scrollTo.mock.resetCalls();
  mock.restoreAll();
});

function IntentProbe() {
  recordIntent = usePrimaryNavigationScroll().record;
  return null;
}

function renderReset(pathname: string) {
  return createElement(
    PrimaryNavigationScrollProvider,
    null,
    createElement(IntentProbe),
    createElement(PrimaryNavigationScrollReset, { pathname }),
  );
}

describe('PrimaryNavigationScrollContext', () => {
  it('pathname commit에서 일치하는 최신 intent만 한 번 소비한다', async () => {
    await act(async () => {
      renderer = create(renderReset('/home'));
    });
    recordIntent?.('/search');
    recordIntent?.('/notifications');

    await act(async () => {
      renderer?.update(renderReset('/notifications'));
    });

    assert.equal(scrollTo.mock.callCount(), 1);
    assert.deepEqual(scrollTo.mock.calls[0].arguments[0], {
      behavior: 'auto',
      left: 0,
      top: 0,
    });

    await act(async () => {
      renderer?.update(renderReset('/notifications'));
    });
    assert.equal(scrollTo.mock.callCount(), 1);
  });

  it('일치하지 않는 pathname과 Native에서는 document scroll을 변경하지 않는다', async () => {
    await act(async () => {
      renderer = create(renderReset('/home'));
    });
    recordIntent?.('/search');

    await act(async () => {
      renderer?.update(renderReset('/notifications'));
    });
    assert.equal(scrollTo.mock.callCount(), 0);

    platform.OS = 'ios';
    recordIntent?.('/profile');
    await act(async () => {
      renderer?.update(renderReset('/profile'));
    });
    assert.equal(scrollTo.mock.callCount(), 0);
  });
});
