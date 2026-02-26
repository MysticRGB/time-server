# Time Sync Server

Сервер истинного времени для мультиплеерных игр.  
Единый источник времени для всех игроков — через WebSocket с NTP-подобным протоколом.

**by Mystic Multimedia Development**

---

## Как это работает

```
Client                    Server
  |---- sync_req {t1} ----->|
  |                    t2 = now()
  |<--- sync_res {t1,t2,t3}-|
  t4 = now()                |
```

- **offset** = ((t2 − t1) + (t3 − t4)) / 2
- **RTT** = (t4 − t1) − (t3 − t2)

При подключении делается 5 замеров, выбирается с минимальным RTT (самый точный). Пересинхронизация каждые 10 минут.

---

## Запуск сервера

```bash
npm install
npm start
```

Сервер стартует на `http://localhost:4200`.  
Откройте в браузере — увидите демо-страницу с живой синхронизацией.

### Переменные окружения

| Переменная | По умолчанию | Описание |
|---|---|---|
| `PORT` | `4200` | Порт HTTP + WebSocket сервера |

### Деплой на Railway

Репозиторий готов к деплою на [Railway](https://railway.app):

1. Подключите GitHub-репозиторий
2. Railway автоматически определит `npm start`
3. Порт назначается через `$PORT` — сервер его читает

Продакшн-адрес: `wss://time-server-production.up.railway.app`

---

## Интеграция в игру

### 1. Подключите файл

Скопируйте `timesync-client.js` в ваш проект и подключите:

```html
<script src="timesync-client.js"></script>
```

Файл самодостаточный, без зависимостей.

### 2. Подключитесь при старте игры

```javascript
TimeSync.connect({
  onSync: (info) => {
    console.log(`Синхронизировано! Offset: ${info.offset}ms, RTT: ${info.rtt}ms`);
  },
  onStatus: (status) => {
    console.log('Статус соединения:', status);
  }
});
```

### 3. Используйте серверное время

```javascript
const now = TimeSync.getServerTime();
```

---

## API

| Метод | Описание |
|---|---|
| `connect(opts)` | Подключиться к серверу |
| `disconnect()` | Отключиться, отменить реконнект |
| `resync()` | Принудительная пересинхронизация |
| `getServerTime()` | Текущее серверное время (unix ms) |
| `isSynced()` | `true` если синхронизация завершена |
| `getOffset()` | Offset в мс (серверное − локальное) |
| `getRtt()` | RTT последней синхронизации в мс |

### Параметры `connect(opts)`

```javascript
TimeSync.connect({
  url:      'wss://...',             // сервер (по умолчанию production)
  onSync:   ({ offset, rtt }) => {}, // после каждой синхронизации
  onStatus: (status) => {}           // 'connected' | 'disconnected' | 'error'
});
```

---

## Примеры

### Запуск игры после синхронизации

```javascript
TimeSync.connect({
  onSync: () => {
    if (!gameStarted) startGame();
  },
  onStatus: (s) => {
    if (s === 'disconnected') showReconnectOverlay();
    if (s === 'connected') hideReconnectOverlay();
  }
});
```

### Обратный отсчёт до события

```javascript
const EVENT_TIME = 1740000000000;

setInterval(() => {
  if (!TimeSync.isSynced()) return;
  const msLeft = EVENT_TIME - TimeSync.getServerTime();
  const sec = Math.max(0, Math.ceil(msLeft / 1000));
  showLabel(msLeft <= 0 ? 'Событие началось!' : `До события: ${sec} сек`);
}, 100);
```

### Метки времени действий игрока

```javascript
function onPlayerAction(action) {
  sendToGameServer({
    action,
    timestamp: TimeSync.getServerTime()
  });
}
```

### Синхронизированные волны / спавн

```javascript
const WAVE_INTERVAL = 30000;

function getCurrentWave() {
  return Math.floor(TimeSync.getServerTime() / WAVE_INTERVAL);
}

function msUntilNextWave() {
  const t = TimeSync.getServerTime();
  return WAVE_INTERVAL - (t % WAVE_INTERVAL);
}
```

---

## Интеграция с Construct 3

1. Импортируйте `timesync-client.js` в проект (Files → Import)
2. В `index.html` добавьте `<script src="timesync-client.js"></script>` перед `</head>`
3. Используйте через **Browser → Execute JS**:

```javascript
TimeSync.connect()
TimeSync.getServerTime()
TimeSync.isSynced()
```

## Интеграция с Unity (WebGL)

1. Положите `timesync-client.js` в `Assets/Plugins/WebGL/`

2. Создайте `Assets/Plugins/WebGL/TimeSync.jslib`:

```javascript
mergeInto(LibraryManager.library, {
  TimeSyncConnect: function() {
    TimeSync.connect();
  },
  TimeSyncGetServerTime: function() {
    return TimeSync.getServerTime();
  },
  TimeSyncIsSynced: function() {
    return TimeSync.isSynced() ? 1 : 0;
  }
});
```

3. В C#:

```csharp
[DllImport("__Internal")] private static extern void TimeSyncConnect();
[DllImport("__Internal")] private static extern double TimeSyncGetServerTime();
[DllImport("__Internal")] private static extern int TimeSyncIsSynced();
```

---

## Протокол

Если вы пишете собственный клиент (не на JS), протокол минимален:

**Клиент → Сервер (JSON через WebSocket):**
```json
{ "type": "sync_req", "t1": 1740000000000 }
```

**Сервер → Клиент:**
```json
{ "type": "sync_res", "t1": 1740000000000, "t2": 1740000000005, "t3": 1740000000005 }
```

Клиент фиксирует `t4 = now()` при получении ответа и вычисляет offset/RTT по формулам выше.

---

## Что модуль делает автоматически

- 5 замеров при подключении, выбор лучшего по RTT
- Пересинхронизация каждые 10 минут
- Автоматический реконнект при обрыве (с нарастающей задержкой 2с → 60с)
- Таймаут 5 секунд на каждый замер
- Корректная обработка ошибок WebSocket
