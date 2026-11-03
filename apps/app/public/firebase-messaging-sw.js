self.addEventListener('notificationclick', (event) => {
  event.stopImmediatePropagation();
  event.notification.close();

  event.waitUntil(
    (async () => {
      let cache;
      let key;
      try {
        const tapId = self.crypto.randomUUID();
        const data = event.notification.data;
        const routingData = {};
        for (const field of [
          'notificationId',
          'recipientProfileId',
          'recipientAccountId',
          'href',
        ]) {
          if (typeof data?.[field] === 'string') {
            routingData[field] = data[field];
          }
        }

        const cacheName = 'kosmo-web-push-taps-v1';
        key = new URL(`/__kosmo-push-taps/${tapId}`, self.location.origin).href;
        cache = await self.caches.open(cacheName);
        // shortcut: page-load failures can leave routing-only entries; prune them if they cause storage pressure.
        await cache.put(
          key,
          new Response(JSON.stringify(routingData), {
            headers: { 'Content-Type': 'application/json' },
          }),
        );

        const url = new URL('/push', self.location.origin);
        url.searchParams.set('tap', tapId);
        if (await self.clients.openWindow(url.href)) {
          return;
        }
      } catch {
        // Cache and browser navigation failures use the safe notification-list destination.
      }

      if (cache && key) {
        try {
          await cache.delete(key);
        } catch {
          // Best-effort cleanup after a failed navigation.
        }
      }

      try {
        await self.clients.openWindow(new URL('/notifications', self.location.origin).href);
      } catch {
        // The click cannot recover when the browser refuses both same-origin windows.
      }
    })(),
  );
});

const firebaseConfigValue = new URL(self.location.href).searchParams.get('firebase');
if (firebaseConfigValue) {
  let input;
  try {
    input = JSON.parse(firebaseConfigValue);
  } catch {
    input = undefined;
  }

  if (
    input &&
    typeof input === 'object' &&
    ['apiKey', 'appId', 'projectId', 'messagingSenderId'].every(
      (key) => typeof input[key] === 'string' && input[key].length > 0,
    )
  ) {
    self.importScripts('https://www.gstatic.com/firebasejs/12.17.1/firebase-app-compat.js');
    self.importScripts('https://www.gstatic.com/firebasejs/12.17.1/firebase-messaging-compat.js');

    self.firebase.initializeApp({
      apiKey: input.apiKey,
      appId: input.appId,
      projectId: input.projectId,
      messagingSenderId: input.messagingSenderId,
    });

    self.firebase.messaging().onBackgroundMessage((payload) => {
      const data = payload?.data;
      if (typeof data?.title !== 'string' || typeof data.body !== 'string') {
        return;
      }

      const notificationData = {};
      for (const key of ['notificationId', 'recipientProfileId', 'recipientAccountId', 'href']) {
        if (typeof data[key] === 'string') {
          notificationData[key] = data[key];
        }
      }

      const options = { body: data.body, data: notificationData };
      if (typeof data.notificationId === 'string') {
        options.tag = data.notificationId;
      }
      return self.registration.showNotification(data.title, options);
    });
  }
}
