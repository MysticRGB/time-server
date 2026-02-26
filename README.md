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

## Интеграция в игру (JS + HTML)

### Шаг 1 — Подключите файл

Скачайте `timesync-client.js` (кнопка на демо-странице или из этого репозитория) и положите рядом с HTML-файлом игры:

```
my-game/
├── index.html
├── game.js
└── timesync-client.js   ← сюда
```

В HTML подключите **перед** скриптом игры:

```html
<script src="timesync-client.js"></script>
<script src="game.js"></script>
```

### Шаг 2 — Подключитесь при старте

```javascript
TimeSync.connect({
  onSync: (info) => {
    console.log('Синхронизировано! Offset:', info.offset, 'ms, RTT:', info.rtt, 'ms');
  },
  onStatus: (status) => {
    // 'connected' | 'disconnected' | 'error'
    console.log('Соединение:', status);
  }
});
```

### Шаг 3 — Используйте серверное время

Везде, где нужно единое время для всех игроков, вместо `Date.now()` используйте:

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
| `getOffset()` | Offset в мс |
| `getRtt()` | RTT последней синхронизации в мс |

### Параметры `connect(opts)`

```javascript
TimeSync.connect({
  url:      'wss://...',             // необязательно, по умолчанию production
  onSync:   ({ offset, rtt }) => {}, // после каждой синхронизации
  onStatus: (status) => {}           // 'connected' | 'disconnected' | 'error'
});
```

---

## Примеры

### Запуск игры после синхронизации

```javascript
let gameStarted = false;

TimeSync.connect({
  onSync: () => {
    if (!gameStarted) {
      gameStarted = true;
      startGame();
    }
  }
});
```

### Обратный отсчёт до события

```javascript
const EVENT_TIME = 1740000000000;

setInterval(() => {
  if (!TimeSync.isSynced()) return;
  const left = EVENT_TIME - TimeSync.getServerTime();
  if (left <= 0) {
    showLabel('Событие началось!');
  } else {
    showLabel('До события: ' + Math.ceil(left / 1000) + ' сек');
  }
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
  return WAVE_INTERVAL - (TimeSync.getServerTime() % WAVE_INTERVAL);
}
```

---

## Что модуль делает автоматически

- 5 замеров при подключении, выбор лучшего по RTT
- Пересинхронизация каждые 10 минут
- Автоматический реконнект при обрыве (задержка нарастает от 2 сек до 60 сек)
- Таймаут 5 секунд на каждый замер
- Обработка ошибок WebSocket
