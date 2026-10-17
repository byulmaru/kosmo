import assert from 'node:assert/strict';
import { after, afterEach, before, beforeEach, describe, it, mock } from 'node:test';
import { createElement } from 'react';
import { act, create } from 'react-test-renderer';
import { getCallbackReturnTarget, saveCallbackReturnTarget } from './publicContentReturn';
import type { ReactTestRenderer } from 'react-test-renderer';
import type { PublicContentReturnController as ControllerExport } from './PublicContentReturnController';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const values = new Map<string, string>();
const tabStorage = {
  getItem: (key: string) => values.get(key) ?? null,
  removeItem: (key: string) => values.delete(key),
  setItem: (key: string, value: string) => values.set(key, value),
};
const previousStorage = Object.getOwnPropertyDescriptor(globalThis, 'sessionStorage');
const pathRouter = { replace: mock.fn() };
let pathname = '/home';
let status: 'error' | 'guest' | 'valid' = 'valid';
let selectedProfileId: string | null = null;
let renderer: ReactTestRenderer | undefined;
let PublicContentReturnController: typeof ControllerExport;
const mockModule = (specifier: string | URL, exports: object) =>
  mock.module(specifier, { exports } as unknown as Parameters<typeof mock.module>[1]);

mockModule('expo-router', {
  usePathname: () => pathname,
  useRouter: () => pathRouter,
});
mockModule('react-native', { Platform: { OS: 'web' } });
mockModule('@/session/SessionProvider', { useSession: () => ({ selectedProfileId, status }) });

before(async () => {
  Object.defineProperty(globalThis, 'sessionStorage', {
    configurable: true,
    value: tabStorage,
  });
  ({ PublicContentReturnController } = await import('./PublicContentReturnController'));
});

beforeEach(() => {
  pathname = '/home';
  status = 'valid';
  selectedProfileId = null;
  values.clear();
  pathRouter.replace.mock.resetCalls();
});

afterEach(async () => {
  await act(async () => renderer?.unmount());
  renderer = undefined;
  mock.restoreAll();
});

after(() => {
  if (previousStorage) {
    Object.defineProperty(globalThis, 'sessionStorage', previousStorage);
  } else {
    Reflect.deleteProperty(globalThis, 'sessionStorage');
  }
});

async function renderController() {
  await act(async () => {
    renderer = create(createElement(PublicContentReturnController));
  });
  assert.ok(renderer);
}

describe('PublicContentReturnController', () => {
  it('waits for Profile preparation, then returns to the public path once', async () => {
    saveCallbackReturnTarget('/@writer/post-id', tabStorage);
    await renderController();

    assert.equal(pathRouter.replace.mock.callCount(), 0);
    assert.equal(getCallbackReturnTarget(tabStorage), '/@writer/post-id');

    selectedProfileId = 'profile-1';
    await act(async () => renderer?.update(createElement(PublicContentReturnController)));

    assert.deepEqual(
      pathRouter.replace.mock.calls.map((call) => call.arguments[0]),
      ['/@writer/post-id'],
    );
    assert.equal(getCallbackReturnTarget(tabStorage), null);
  });

  it('clears a return target after confirmed guest or when leaving the setup home', async () => {
    saveCallbackReturnTarget('/@writer', tabStorage);
    status = 'guest';
    await renderController();
    assert.equal(getCallbackReturnTarget(tabStorage), null);
    assert.equal(pathRouter.replace.mock.callCount(), 0);

    saveCallbackReturnTarget('/@writer', tabStorage);
    status = 'valid';
    pathname = '/search';
    await act(async () => renderer?.update(createElement(PublicContentReturnController)));
    assert.equal(getCallbackReturnTarget(tabStorage), null);
    assert.equal(pathRouter.replace.mock.callCount(), 0);
  });

  it('retains a target during session errors for an in-place retry', async () => {
    saveCallbackReturnTarget('/@writer', tabStorage);
    status = 'error';
    await renderController();

    assert.equal(getCallbackReturnTarget(tabStorage), '/@writer');
    assert.equal(pathRouter.replace.mock.callCount(), 0);
  });
});
