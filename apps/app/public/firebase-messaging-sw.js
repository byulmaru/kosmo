self.addEventListener('notificationclick', (event) => {
  event.stopImmediatePropagation();
  event.notification.close();

  const url = new URL('/push', self.location.origin);
  const data = event.notification.data;
  for (const key of ['notificationId', 'recipientProfileId', 'recipientAccountId', 'href']) {
    if (typeof data?.[key] === 'string') {
      url.searchParams.set(key, data[key]);
    }
  }

  event.waitUntil(self.clients.openWindow(url.href));
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
    importScripts('https://www.gstatic.com/firebasejs/12.17.1/firebase-app-compat.js');
    importScripts('https://www.gstatic.com/firebasejs/12.17.1/firebase-messaging-compat.js');

    firebase.initializeApp({
      apiKey: input.apiKey,
      appId: input.appId,
      projectId: input.projectId,
      messagingSenderId: input.messagingSenderId,
    });

    firebase.messaging().onBackgroundMessage((payload) => {
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
