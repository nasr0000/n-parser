self.addEventListener('push', function (event) {
  if (event.data) {
    const data = event.data.json();
    const options = {
      body: data.body,
      icon: data.image || '/icon.png',  // Превью поста как иконка (или иконка приложения)
      badge: '/icon.png',               // Маленький значок на Android
      image: data.image || null,        // Большое фото под текстом (Chrome Desktop/Android)
      vibrate: [200, 100, 200],         // Паттерн вибрации
      tag: 'new-post',                  // Заменяет предыдущее уведомление
      renotify: true,
      requireInteraction: false,
      actions: [
        {
          action: 'open',
          title: '📂 Открыть',
        },
        {
          action: 'close',
          title: '✖ Закрыть',
        }
      ],
      data: {
        dateOfArrival: Date.now(),
        url: data.url || '/'
      }
    };
    event.waitUntil(self.registration.showNotification(data.title, options));
  }
});

self.addEventListener('notificationclick', function (event) {
  event.notification.close();

  if (event.action === 'close') return;

  // По клику на "Открыть" или на само уведомление — переходим на сайт
  const targetUrl = event.notification.data.url || '/';

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(windowClients => {
      // Ищем уже открытую вкладку с нашим сайтом
      for (let client of windowClients) {
        if ('focus' in client) {
          return client.focus();
        }
      }
      // Если не открыта, открываем новую
      if (clients.openWindow) {
        return clients.openWindow(targetUrl);
      }
    })
  );
});
