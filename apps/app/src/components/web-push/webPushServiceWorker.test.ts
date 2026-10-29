import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { runInNewContext } from 'node:vm';

const source = readFileSync(
  new URL('../../../public/firebase-messaging-sw.js', import.meta.url),
  'utf8',
);
const config = {
  apiKey: 'public-api-key',
  appId: 'app-id',
  projectId: 'project-id',
  messagingSenderId: 'sender-id',
};
const tapId = 'c56a4180-65aa-42ec-a945-5fd21dec0538';

type NotificationClickEvent = {
  notification: { data: unknown; close(): void };
  stopImmediatePropagation(): void;
  waitUntil(promise: Promise<unknown>): void;
};

function startWorker(
  firebaseConfig?: string,
  failOnImport = false,
  options: {
    failCacheOpen?: boolean;
    failCachePut?: boolean;
    failRandomUUID?: boolean;
    firstWindowResult?: unknown;
    rejectFirstWindow?: boolean;
  } = {},
) {
  const location = new URL('https://kosmo.example/firebase-messaging-sw.js');
  if (firebaseConfig !== undefined) {
    location.searchParams.set('firebase', firebaseConfig);
  }

  const listeners = new Map<string, (event: NotificationClickEvent) => void>();
  const imports: string[] = [];
  const notifications: Array<{ title: string; options: Record<string, unknown> }> = [];
  const openedWindows: string[] = [];
  const cacheHadTapAtWindowOpen: boolean[] = [];
  const cacheEntries = new Map<string, string>();
  const cache = {
    async put(key: string, response: Response) {
      if (options.failCachePut) {
        throw new Error('CacheStorage write failed');
      }
      cacheEntries.set(key, await response.text());
    },
    async match(key: string) {
      const value = cacheEntries.get(key);
      return value === undefined ? undefined : new Response(value);
    },
    async delete(key: string) {
      return cacheEntries.delete(key);
    },
  };
  let initializedConfig: Record<string, unknown> | undefined;
  let backgroundMessageHandler: ((payload: unknown) => unknown) | undefined;

  const firebase = {
    initializeApp(input: Record<string, unknown>) {
      initializedConfig = JSON.parse(JSON.stringify(input));
    },
    messaging() {
      return {
        onBackgroundMessage(handler: (payload: unknown) => unknown) {
          backgroundMessageHandler = handler;
        },
      };
    },
  };
  const self = {
    location,
    addEventListener(type: string, listener: (event: NotificationClickEvent) => void) {
      listeners.set(type, listener);
    },
    importScripts(url: string) {
      assert.equal(typeof listeners.get('notificationclick'), 'function');
      imports.push(url);
      if (failOnImport) {
        throw new Error('external SDK import failed');
      }
    },
    firebase,
    crypto: {
      randomUUID() {
        if (options.failRandomUUID) {
          throw new Error('secure random ID unavailable');
        }
        return tapId;
      },
    },
    caches: {
      async open() {
        if (options.failCacheOpen) {
          throw new Error('CacheStorage unavailable');
        }
        return cache;
      },
    },
    registration: {
      showNotification(title: string, options: Record<string, unknown>) {
        notifications.push({ title, options: JSON.parse(JSON.stringify(options)) });
        return Promise.resolve();
      },
    },
    clients: {
      openWindow(url: string) {
        openedWindows.push(url);
        const requestedTap = new URL(url).searchParams.get('tap');
        cacheHadTapAtWindowOpen.push(
          requestedTap !== null &&
            cacheEntries.has(`https://kosmo.example/__kosmo-push-taps/${requestedTap}`),
        );
        if (
          openedWindows.length === 1 &&
          (options.firstWindowResult !== undefined || options.rejectFirstWindow)
        ) {
          if (options.rejectFirstWindow) {
            return Promise.reject(new Error('window opening failed'));
          }
          return Promise.resolve(options.firstWindowResult);
        }
        return Promise.resolve({});
      },
    },
  };

  runInNewContext(source, {
    URL,
    Response,
    self,
    console,
  });

  return {
    listeners,
    imports,
    notifications,
    openedWindows,
    cacheHadTapAtWindowOpen,
    cacheEntries,
    initializedConfig,
    getBackgroundMessageHandler: () => backgroundMessageHandler,
  };
}

test('handles a data-only FCM message with one tagged notification and route data', async () => {
  const worker = startWorker(JSON.stringify({ ...config, privateKey: 'must be ignored' }));
  const handleBackgroundMessage = worker.getBackgroundMessageHandler();

  assert.deepEqual(worker.imports, [
    'https://www.gstatic.com/firebasejs/12.17.1/firebase-app-compat.js',
    'https://www.gstatic.com/firebasejs/12.17.1/firebase-messaging-compat.js',
  ]);
  assert.deepEqual(worker.initializedConfig, config);
  assert.ok(handleBackgroundMessage);

  await handleBackgroundMessage({
    data: {
      title: 'A reply',
      body: 'Someone replied to your post.',
      notificationId: 'notification-1',
      recipientProfileId: 'profile-1',
      href: '/@alice/post-1',
      ignored: 'not route data',
    },
  });

  assert.equal(worker.notifications.length, 1);
  assert.equal(worker.notifications[0]?.title, 'A reply');
  assert.deepEqual(worker.notifications[0]?.options, {
    body: 'Someone replied to your post.',
    tag: 'notification-1',
    data: {
      notificationId: 'notification-1',
      recipientProfileId: 'profile-1',
      href: '/@alice/post-1',
    },
  });
});

test('notification clicks cache only routing fields before opening a nonce-only same-origin route', async () => {
  const worker = startWorker(JSON.stringify(config));
  const handleBackgroundMessage = worker.getBackgroundMessageHandler();
  assert.ok(handleBackgroundMessage);

  await handleBackgroundMessage({
    data: {
      title: 'A reply',
      body: 'A reply body',
      notificationId: 'notice &=1',
      recipientProfileId: 'profile/id',
      recipientAccountId: 'account?x=1',
      href: 'https://elsewhere.example/post?id=1&title=private',
      ignored: 'not route data',
    },
  });

  const notification = worker.notifications[0];
  assert.ok(notification);
  let closed = false;
  let stopped = false;
  let waitUntil: Promise<unknown> | undefined;
  worker.listeners.get('notificationclick')?.({
    notification: {
      data: {
        ...(notification.options.data as Record<string, unknown>),
        title: 'private title',
        body: 'private body',
        credential: 'must not persist',
      },
      close() {
        closed = true;
      },
    },
    stopImmediatePropagation() {
      stopped = true;
    },
    waitUntil(promise: Promise<unknown>) {
      waitUntil = promise;
    },
  });
  await waitUntil;

  assert.equal(closed, true);
  assert.equal(stopped, true);
  assert.equal(worker.openedWindows.length, 1);
  const url = new URL(worker.openedWindows[0]);
  assert.equal(url.origin, 'https://kosmo.example');
  assert.equal(url.pathname, '/push');
  assert.deepEqual([...url.searchParams.keys()], ['tap']);
  assert.equal(url.searchParams.get('tap'), tapId);
  assert.equal(url.searchParams.has('title'), false);
  assert.equal(url.searchParams.has('body'), false);
  assert.deepEqual(worker.cacheHadTapAtWindowOpen, [true]);
  assert.deepEqual(
    JSON.parse(
      worker.cacheEntries.get(`https://kosmo.example/__kosmo-push-taps/${tapId}`) ?? 'null',
    ),
    {
      notificationId: 'notice &=1',
      recipientProfileId: 'profile/id',
      recipientAccountId: 'account?x=1',
      href: 'https://elsewhere.example/post?id=1&title=private',
    },
  );
});

test('ignores malformed notification text and opens the push fallback for malformed click data', async () => {
  const worker = startWorker(JSON.stringify(config));
  const handleBackgroundMessage = worker.getBackgroundMessageHandler();
  assert.ok(handleBackgroundMessage);

  await handleBackgroundMessage({ data: { title: 10, body: 'not plain text' } });
  assert.equal(worker.notifications.length, 0);

  let waitUntil: Promise<unknown> | undefined;
  worker.listeners.get('notificationclick')?.({
    notification: {
      data: { notificationId: 10, href: { url: 'https://elsewhere.example' } },
      close() {},
    },
    stopImmediatePropagation() {},
    waitUntil(promise: Promise<unknown>) {
      waitUntil = promise;
    },
  });
  await waitUntil;

  assert.deepEqual(worker.openedWindows, [`https://kosmo.example/push?tap=${tapId}`]);
});

test('keeps the click fallback when Firebase configuration is missing or malformed', async () => {
  const worker = startWorker('{invalid-json');
  assert.deepEqual(worker.imports, []);
  assert.equal(worker.initializedConfig, undefined);
  assert.equal(worker.getBackgroundMessageHandler(), undefined);

  let waitUntil: Promise<unknown> | undefined;
  worker.listeners.get('notificationclick')?.({
    notification: { data: null, close() {} },
    stopImmediatePropagation() {},
    waitUntil(promise: Promise<unknown>) {
      waitUntil = promise;
    },
  });
  await waitUntil;

  assert.deepEqual(worker.openedWindows, [`https://kosmo.example/push?tap=${tapId}`]);
});

test('falls back to Notifications when secure randomness or CacheStorage fails', async (context) => {
  for (const options of [
    { failRandomUUID: true },
    { failCacheOpen: true },
    { failCachePut: true },
  ]) {
    await context.test(JSON.stringify(options), async () => {
      const worker = startWorker(undefined, false, options);
      let waitUntil: Promise<unknown> | undefined;
      worker.listeners.get('notificationclick')?.({
        notification: { data: { href: '/@alice/post-1' }, close() {} },
        stopImmediatePropagation() {},
        waitUntil(promise: Promise<unknown>) {
          waitUntil = promise;
        },
      });
      await waitUntil;
      assert.deepEqual(worker.openedWindows, ['https://kosmo.example/notifications']);
      assert.equal(worker.cacheEntries.size, 0);
    });
  }
});

test('deletes a cached target when opening the tap route fails and falls back to Notifications', async (context) => {
  for (const options of [{ firstWindowResult: null }, { rejectFirstWindow: true }]) {
    await context.test(JSON.stringify(options), async () => {
      const worker = startWorker(undefined, false, options);
      let waitUntil: Promise<unknown> | undefined;
      worker.listeners.get('notificationclick')?.({
        notification: { data: { href: '/@alice/post-1' }, close() {} },
        stopImmediatePropagation() {},
        waitUntil(promise: Promise<unknown>) {
          waitUntil = promise;
        },
      });
      await waitUntil;

      assert.deepEqual(worker.openedWindows, [
        `https://kosmo.example/push?tap=${tapId}`,
        'https://kosmo.example/notifications',
      ]);
      assert.equal(worker.cacheEntries.size, 0);
    });
  }
});

test('propagates external Firebase SDK import failures during worker setup', () => {
  assert.throws(() => startWorker(JSON.stringify(config), true), /external SDK import failed/);
});
