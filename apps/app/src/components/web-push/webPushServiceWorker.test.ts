import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { test } from 'node:test';

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

function startWorker(firebaseConfig?: string, failOnImport = false) {
  const location = new URL('https://kosmo.example/firebase-messaging-sw.js');
  if (firebaseConfig !== undefined) {
    location.searchParams.set('firebase', firebaseConfig);
  }

  const listeners = new Map<string, (event: any) => void>();
  const imports: string[] = [];
  const notifications: Array<{ title: string; options: Record<string, unknown> }> = [];
  const openedWindows: string[] = [];
  let initializedConfig: Record<string, unknown> | undefined;
  let backgroundMessageHandler: ((payload: unknown) => unknown) | undefined;

  const self = {
    location,
    addEventListener(type: string, listener: (event: any) => void) {
      listeners.set(type, listener);
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
        return Promise.resolve();
      },
    },
  };
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

  runInNewContext(source, {
    URL,
    self,
    console,
    importScripts(url: string) {
      assert.equal(typeof listeners.get('notificationclick'), 'function');
      imports.push(url);
      if (failOnImport) {
        throw new Error('external SDK import failed');
      }
    },
    firebase,
  });

  return {
    listeners,
    imports,
    notifications,
    openedWindows,
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

test('notification clicks open only the same-origin push route with encoded route fields', async () => {
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
      data: notification.options.data,
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
  assert.deepEqual([...url.searchParams.keys()].sort(), [
    'href',
    'notificationId',
    'recipientAccountId',
    'recipientProfileId',
  ]);
  assert.equal(url.searchParams.get('notificationId'), 'notice &=1');
  assert.equal(url.searchParams.get('recipientProfileId'), 'profile/id');
  assert.equal(url.searchParams.get('recipientAccountId'), 'account?x=1');
  assert.equal(url.searchParams.get('href'), 'https://elsewhere.example/post?id=1&title=private');
  assert.equal(url.searchParams.has('title'), false);
  assert.equal(url.searchParams.has('body'), false);
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

  assert.deepEqual(worker.openedWindows, ['https://kosmo.example/push']);
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

  assert.deepEqual(worker.openedWindows, ['https://kosmo.example/push']);
});

test('propagates external Firebase SDK import failures during worker setup', () => {
  assert.throws(() => startWorker(JSON.stringify(config), true), /external SDK import failed/);
});
