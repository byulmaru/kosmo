import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { afterEach, before, describe, it, mock } from 'node:test';
import { runInNewContext } from 'node:vm';
import { createElement, StrictMode, useState } from 'react';
import { act, create } from 'react-test-renderer';
import { clearWebPushTap, readWebPushTap } from './pushTapHandoff';
import type { ComponentType } from 'react';
import type { ReactTestRenderer } from 'react-test-renderer';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

type SessionStatus = 'error' | 'guest' | 'valid';
type Session = {
  accountId: string | null;
  selectedProfileId: string | null;
  status: SessionStatus;
};

const origin = 'https://kosmo.example';
const tapId = 'c56a4180-65aa-42ec-a945-5fd21dec0538';
const cacheName = 'kosmo-web-push-taps-v1';
const cachePath = '/__kosmo-push-taps/';
const serviceWorkerSource = readFileSync(
  new URL('../../../public/firebase-messaging-sw.js', import.meta.url),
  'utf8',
);

class MemoryCache {
  readonly entries = new Map<string, string>();

  constructor(private readonly storage: FakeCacheStorage) {}

  async put(key: string, response: Response) {
    if (this.storage.failPut) {
      throw new Error('CacheStorage write failed');
    }
    this.entries.set(key, await response.text());
  }

  async match(key: string) {
    this.storage.matchCalls += 1;
    if (this.storage.failMatch) {
      throw new Error('CacheStorage read failed');
    }
    const value = this.entries.get(key);
    return value === undefined ? undefined : { json: async () => JSON.parse(value) };
  }

  async delete(key: string) {
    return this.storage.failDelete ? false : this.entries.delete(key);
  }
}

class FakeCacheStorage {
  readonly caches = new Map<string, MemoryCache>();
  openCalls = 0;
  matchCalls = 0;
  deferredOpenStarted = false;
  private deferredOpen: { call: number; promise: Promise<void>; resolve: () => void } | undefined;
  failOpen = false;
  failPut = false;
  failMatch = false;
  failDelete = false;

  async open(name: string) {
    this.openCalls += 1;
    if (this.deferredOpen?.call === this.openCalls) {
      this.deferredOpenStarted = true;
      await this.deferredOpen.promise;
    }
    if (this.failOpen) {
      throw new Error('CacheStorage unavailable');
    }
    let cache = this.caches.get(name);
    if (!cache) {
      cache = new MemoryCache(this);
      this.caches.set(name, cache);
    }
    return cache;
  }

  deferOpen(call: number) {
    let resolve = () => {};
    const promise = new Promise<void>((resume) => {
      resolve = resume;
    });
    this.deferredOpen = { call, promise, resolve };
    return resolve;
  }

  seed(payload: unknown, id = tapId) {
    const cache = this.caches.get(cacheName) ?? new MemoryCache(this);
    this.caches.set(cacheName, cache);
    cache.entries.set(`${origin}${cachePath}${id}`, JSON.stringify(payload));
  }

  hasEntry(id = tapId) {
    return [...this.caches.values()].some((cache) =>
      cache.entries.has(`${origin}${cachePath}${id}`),
    );
  }

  get size() {
    return [...this.caches.values()].reduce((size, cache) => size + cache.entries.size, 0);
  }
}

const mockModule = (specifier: string | URL, exports: object) =>
  mock.module(specifier, {
    exports,
  } as unknown as Parameters<typeof mock.module>[1]);

let platform: 'ios' | 'web' = 'web';
let params: Record<string, string | string[] | undefined> = {};
let session: Session = { accountId: 'account-a', selectedProfileId: 'profile-a', status: 'valid' };
let setRoutePath: ((path: string) => void) | null = null;
let rejectProfileWrite = false;
let profileWriteDelay: Promise<void> | null = null;
let renderer: ReactTestRenderer | null = null;
let PushRoute: ComponentType;
let cacheStorage = new FakeCacheStorage();
const operations: string[] = [];
const originalWindowDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'window');
const originalCachesDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'caches');

const replace = mock.fn((path: string) => {
  operations.push(`router:${path}`);
  setRoutePath?.(path);
});
const resetActor = mock.fn((profileId: string) => {
  operations.push(`reset:${profileId}`);
});
const writeSelectedProfile = mock.fn(async (profileId: string) => {
  operations.push(`write:${profileId}`);
  if (profileWriteDelay) {
    await profileWriteDelay;
  }
  if (rejectProfileWrite) {
    throw new Error('profile storage unavailable');
  }
});
const openURL = mock.fn(async (href: string) => {
  operations.push(`linking:${href}`);
});
const browserReplace = mock.fn((href: string) => {
  operations.push(`browser:${href}`);
  setRoutePath?.(href);
});

mockModule('expo-router', {
  useLocalSearchParams: () => params,
  useRouter: () => ({ replace }),
});
mockModule('react-native', {
  Linking: { openURL },
  Platform: {
    get OS() {
      return platform;
    },
  },
});
mockModule('@/auth/selectedProfileStorage', { writeSelectedProfile });
mockModule('@/relay/RelayActorProvider', { useRelayActor: () => ({ resetActor }) });
mockModule('@/session/SessionProvider', { useSession: () => session });

before(async () => {
  ({ default: PushRoute } = await import('../../app/push'));
});

afterEach(async () => {
  platform = 'web';
  params = {};
  session = { accountId: 'account-a', selectedProfileId: 'profile-a', status: 'valid' };
  setRoutePath = null;
  rejectProfileWrite = false;
  profileWriteDelay = null;
  operations.length = 0;
  replace.mock.resetCalls();
  resetActor.mock.resetCalls();
  writeSelectedProfile.mock.resetCalls();
  openURL.mock.resetCalls();
  browserReplace.mock.resetCalls();
  cacheStorage = new FakeCacheStorage();
  if (renderer) {
    await act(async () => renderer?.unmount());
    renderer = null;
  }
  if (originalWindowDescriptor) {
    Object.defineProperty(globalThis, 'window', originalWindowDescriptor);
  } else {
    Reflect.deleteProperty(globalThis, 'window');
  }
  if (originalCachesDescriptor) {
    Object.defineProperty(globalThis, 'caches', originalCachesDescriptor);
  } else {
    Reflect.deleteProperty(globalThis, 'caches');
  }
});

describe('Web push action route', () => {
  it('consumes a real service-worker handoff and opens an internal target', async () => {
    const click = await clickNotification(profileTarget());
    const url = new URL(click.openedWindows[0]);
    assert.equal(url.origin, origin);
    assert.equal(url.pathname, '/push');
    assert.deepEqual([...url.searchParams.keys()], ['tap']);
    assert.deepEqual(click.cacheHadTapAtWindowOpen, [true]);
    params = { tap: url.searchParams.get('tap') ?? undefined };
    await renderRoute();

    assert.deepEqual(operations, ['router:/@alice/post-42']);
    assert.equal(routedPath(), '/@alice/post-42');
    assert.equal(cacheStorage.size, 0);
    assert.equal(writeSelectedProfile.mock.callCount(), 0);
    assert.equal(resetActor.mock.callCount(), 0);
  });

  it('keeps the real handoff destination under Strict Mode effect replay', async () => {
    const click = await clickNotification(profileTarget());
    params = { tap: new URL(click.openedWindows[0]).searchParams.get('tap') ?? undefined };
    const releaseSecondEffect = cacheStorage.deferOpen(3);
    await renderRoute(true);

    assert.equal(cacheStorage.deferredOpenStarted, true);
    assert.equal(routedPath(), '/@alice/post-42');
    assert.equal(operations.at(-1), 'router:/@alice/post-42');

    await act(async () => {
      releaseSecondEffect();
      await new Promise((resolve) => setImmediate(resolve));
    });
    assert.equal(routedPath(), '/@alice/post-42');
    assert.equal(cacheStorage.size, 0);
  });

  it('persists and resets the recipient Profile before opening its target', async () => {
    cacheStorage.seed(profileTarget({ recipientProfileId: 'profile-b' }));
    params = { tap: tapId };
    await renderRoute();

    assert.deepEqual(operations, ['write:profile-b', 'reset:profile-b', 'router:/@alice/post-42']);
    assert.equal(routedPath(), '/@alice/post-42');
  });

  it('falls back to Notifications if persisting the recipient Profile fails', async () => {
    cacheStorage.seed(profileTarget({ recipientProfileId: 'profile-b' }));
    params = { tap: tapId };
    rejectProfileWrite = true;
    await renderRoute();

    assert.deepEqual(operations, ['write:profile-b', 'router:/notifications']);
    assert.equal(routedPath(), '/notifications');
    assert.equal(cacheStorage.size, 0);
    assert.equal(resetActor.mock.callCount(), 0);
  });

  it('rejects legacy query targets and fabricated nonces without external redirects or Profile changes', async () => {
    params = {
      href: 'https://attacker.example/forged',
      notificationId: 'x',
      recipientAccountId: 'account-a',
      recipientProfileId: 'profile-b',
    };
    await renderRoute();

    assert.deepEqual(operations, ['router:/notifications']);
    assert.equal(openURL.mock.callCount(), 0);
    assert.equal(browserReplace.mock.callCount(), 0);
    assert.equal(writeSelectedProfile.mock.callCount(), 0);
    assert.equal(resetActor.mock.callCount(), 0);
  });

  it('rejects duplicate nonce parameters', async () => {
    cacheStorage.seed(profileTarget());
    params = { tap: [tapId, tapId] };
    await renderRoute();
    assert.deepEqual(operations, ['router:/notifications']);
    assert.equal(writeSelectedProfile.mock.callCount(), 0);
    assert.equal(cacheStorage.hasEntry(), true);
  });

  it('rejects an unknown nonce without using extra forged routing parameters', async () => {
    params = { tap: 'c56a4180-65aa-42ec-a945-5fd21dec0539' };
    params.href = 'https://attacker.example/forged';
    params.notificationId = 'x';
    params.recipientAccountId = 'account-a';
    await renderRoute();
    assert.deepEqual(operations, ['router:/notifications']);
    assert.equal(browserReplace.mock.callCount(), 0);
    assert.equal(writeSelectedProfile.mock.callCount(), 0);
  });

  it('keeps concurrent reads idempotent until the cached target is cleared', async () => {
    installBrowserGlobals();
    const target = profileTarget();
    cacheStorage.seed(target);
    const results = await Promise.all([readWebPushTap(tapId), readWebPushTap(tapId)]);

    assert.deepEqual(results, [target, target]);
    assert.equal(cacheStorage.hasEntry(), true);
    await clearWebPushTap(tapId);
    assert.equal(cacheStorage.size, 0);
    assert.equal(await readWebPushTap(tapId), null);
  });

  it('routes a trusted target even if best-effort cache cleanup fails', async () => {
    cacheStorage.seed(profileTarget());
    cacheStorage.failDelete = true;
    params = { tap: tapId };
    await renderRoute();

    assert.deepEqual(operations, ['router:/@alice/post-42']);
    assert.equal(cacheStorage.hasEntry(), true);
    assert.equal(writeSelectedProfile.mock.callCount(), 0);
  });

  it('reuses the loaded snapshot when Profile restoration rerenders the route', async () => {
    cacheStorage.seed(profileTarget({ recipientProfileId: 'profile-b' }));
    params = { tap: tapId };
    let releaseWrite = () => {};
    profileWriteDelay = new Promise<void>((resolve) => {
      releaseWrite = resolve;
    });
    await renderRoute();

    assert.deepEqual(operations, ['write:profile-b']);
    assert.equal(cacheStorage.matchCalls, 1);
    await act(async () => {
      session = { accountId: 'account-a', selectedProfileId: 'profile-b', status: 'valid' };
      renderer?.update(createElement(TestRouter));
      await new Promise((resolve) => setImmediate(resolve));
    });

    assert.equal(routedPath(), '/@alice/post-42');
    assert.equal(cacheStorage.matchCalls, 1);
    assert.equal(operations.includes('router:/notifications'), false);
    releaseWrite();
    await act(async () => {
      await new Promise((resolve) => setImmediate(resolve));
    });
    assert.equal(routedPath(), '/@alice/post-42');
  });

  it('falls back when cache access or stored JSON fails', async () => {
    cacheStorage.failOpen = true;
    params = { tap: tapId };
    await renderRoute();
    assert.deepEqual(operations, ['router:/notifications']);

    operations.length = 0;
    cacheStorage = new FakeCacheStorage();
    cacheStorage.seed(profileTarget());
    cacheStorage.caches.get(cacheName)?.entries.set(`${origin}${cachePath}${tapId}`, '{invalid');
    params = { tap: tapId };
    await renderRoute();
    assert.deepEqual(operations, ['router:/notifications']);
    assert.equal(cacheStorage.size, 0);
  });

  it('rejects an Operational target for another Account without switching Profiles', async () => {
    cacheStorage.seed({
      href: '/notifications',
      notificationId: 'notification-a',
      recipientAccountId: 'account-b',
    });
    params = { tap: tapId };
    await renderRoute();

    assert.deepEqual(operations, ['router:/notifications']);
    assert.equal(writeSelectedProfile.mock.callCount(), 0);
    assert.equal(resetActor.mock.callCount(), 0);
    assert.equal(openURL.mock.callCount(), 0);
  });

  it('opens a matching Operational internal target without switching Profiles', async () => {
    cacheStorage.seed({
      href: '/notifications?filter=unread',
      notificationId: 'notification-a',
      recipientAccountId: 'account-a',
    });
    params = { tap: tapId };
    await renderRoute();

    assert.deepEqual(operations, ['router:/notifications?filter=unread']);
    assert.equal(writeSelectedProfile.mock.callCount(), 0);
    assert.equal(resetActor.mock.callCount(), 0);
  });

  it('replaces the action URL with a validated external destination in the same browser tab', async () => {
    cacheStorage.seed({
      href: 'https://example.com/notices/42',
      notificationId: 'notification-a',
      recipientAccountId: 'account-a',
    });
    params = { tap: tapId };
    await renderRoute();

    assert.deepEqual(operations, ['browser:https://example.com/notices/42']);
    assert.equal(openURL.mock.callCount(), 0);
    assert.equal(writeSelectedProfile.mock.callCount(), 0);
    assert.equal(resetActor.mock.callCount(), 0);
  });

  it('does not navigate to an unsafe external URL', async () => {
    cacheStorage.seed({
      href: 'javascript:alert(1)',
      notificationId: 'notification-a',
      recipientAccountId: 'account-a',
    });
    params = { tap: tapId };
    await renderRoute();

    assert.deepEqual(operations, ['router:/notifications']);
    assert.equal(browserReplace.mock.callCount(), 0);
    assert.equal(openURL.mock.callCount(), 0);
  });

  it('discards the target for guests and does not replay it after login', async () => {
    cacheStorage.seed(profileTarget({ recipientProfileId: 'profile-b' }));
    params = { tap: tapId };
    session = { accountId: null, selectedProfileId: null, status: 'guest' };
    await renderRoute();

    assert.deepEqual(operations, ['router:/']);
    assert.equal(routedPath(), '/');
    assert.equal(cacheStorage.size, 0);
    assert.equal(writeSelectedProfile.mock.callCount(), 0);
    assert.equal(resetActor.mock.callCount(), 0);

    await act(async () => {
      session = { accountId: 'account-a', selectedProfileId: 'profile-a', status: 'valid' };
      renderer?.update(createElement(TestRouter));
      await new Promise((resolve) => setImmediate(resolve));
    });

    assert.deepEqual(operations, ['router:/']);
    assert.equal(routedPath(), '/');
  });

  it('routes session errors through the existing root error screen after consuming the target', async () => {
    cacheStorage.seed(profileTarget({ recipientProfileId: 'profile-b' }));
    params = { tap: tapId };
    session = { accountId: null, selectedProfileId: null, status: 'error' };
    await renderRoute();

    assert.deepEqual(operations, ['router:/']);
    assert.equal(cacheStorage.size, 0);
    assert.equal(writeSelectedProfile.mock.callCount(), 0);
    assert.equal(resetActor.mock.callCount(), 0);
  });
});

function TestRouter() {
  const [path, setPath] = useState('/push');
  setRoutePath = setPath;
  return path === '/push' ? createElement(PushRoute) : createElement(RouteOutput, { path });
}

function RouteOutput({ path }: { path: string }) {
  return createElement('div', { path });
}

function routedPath(): string {
  assert.ok(renderer);
  return renderer.root.findByType(RouteOutput).props.path;
}

function installBrowserGlobals() {
  Object.defineProperty(globalThis, 'window', {
    configurable: true,
    value: { location: { origin, replace: browserReplace } },
  });
  Object.defineProperty(globalThis, 'caches', {
    configurable: true,
    value: cacheStorage,
  });
}

async function renderRoute(strictMode = false) {
  installBrowserGlobals();
  await act(async () => {
    const router = createElement(TestRouter);
    renderer = create(strictMode ? createElement(StrictMode, null, router) : router);
    await new Promise((resolve) => setImmediate(resolve));
  });
  assert.ok(renderer);
}

async function clickNotification(data: unknown) {
  const listeners = new Map<
    string,
    (event: {
      notification: { data: unknown; close(): void };
      stopImmediatePropagation(): void;
      waitUntil(promise: Promise<unknown>): void;
    }) => void
  >();
  const openedWindows: string[] = [];
  const cacheHadTapAtWindowOpen: boolean[] = [];
  const self = {
    location: new URL(`${origin}/firebase-messaging-sw.js`),
    addEventListener(type: string, listener: (event: never) => void) {
      listeners.set(type, listener as never);
    },
    crypto: { randomUUID: () => tapId },
    caches: cacheStorage,
    clients: {
      openWindow(url: string) {
        openedWindows.push(url);
        cacheHadTapAtWindowOpen.push(cacheStorage.hasEntry(tapId));
        return Promise.resolve({});
      },
    },
  };
  runInNewContext(serviceWorkerSource, { URL, Response, self });

  let waitUntil: Promise<unknown> | undefined;
  listeners.get('notificationclick')?.({
    notification: { data, close() {} },
    stopImmediatePropagation() {},
    waitUntil(promise) {
      waitUntil = promise;
    },
  });
  await waitUntil;
  return { openedWindows, cacheHadTapAtWindowOpen };
}

function profileTarget(overrides: Record<string, string> = {}) {
  return {
    href: '/@alice/post-42',
    notificationId: 'notification-a',
    recipientProfileId: 'profile-a',
    ...overrides,
  };
}
