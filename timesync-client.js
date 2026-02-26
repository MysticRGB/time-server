/**
 * TimeSync — клиентский модуль синхронизации с сервером истинного времени.
 *
 * Протокол (NTP-like):
 *   client → { type:"sync_req", t1 }
 *   server → { type:"sync_res", t1, t2, t3 }
 *   client записывает t4 при получении
 *   offset = ((t2-t1) + (t3-t4)) / 2
 *   rtt    = (t4-t1) - (t3-t2)
 *
 * Использование:
 *   TimeSync.connect();
 *   const now = TimeSync.getServerTime();
 */
const TimeSync = (() => {
  const DEFAULT_URL = 'wss://time-server-production.up.railway.app';
  const RESYNC_MS = 10 * 60 * 1000;
  const PROBE_COUNT = 5;
  const PROBE_TIMEOUT_MS = 5000;
  const RECONNECT_BASE_MS = 2000;
  const RECONNECT_MAX_MS = 60000;

  let _url = DEFAULT_URL;
  let _ws = null;
  let _offset = 0;
  let _bestRtt = Infinity;
  let _synced = false;
  let _destroyed = false;
  let _syncCb = null;
  let _resyncTimer = null;
  let _reconnectTimer = null;
  let _reconnectDelay = RECONNECT_BASE_MS;

  let _onSync = null;
  let _onStatus = null;

  function _setStatus(status, detail) {
    if (_onStatus) {
      try { _onStatus(status, detail); } catch (_) { /* ignore */ }
    }
  }

  function connect(opts) {
    opts = opts || {};
    if (typeof opts === 'function') opts = { onSync: opts };

    _url = opts.url || DEFAULT_URL;
    _onSync = opts.onSync || null;
    _onStatus = opts.onStatus || null;
    _destroyed = false;
    _reconnectDelay = RECONNECT_BASE_MS;

    _open();
  }

  function _open() {
    if (_destroyed) return;
    _cleanup();

    _ws = new WebSocket(_url);

    _ws.onopen = () => {
      _reconnectDelay = RECONNECT_BASE_MS;
      _setStatus('connected');
      _runSync();
    };

    _ws.onmessage = (e) => {
      let msg;
      try { msg = JSON.parse(e.data); } catch (_) { return; }
      if (msg.type === 'sync_res' && _syncCb) _syncCb(msg, Date.now());
    };

    _ws.onclose = () => {
      _synced = false;
      _setStatus('disconnected');
      _scheduleReconnect();
    };

    _ws.onerror = () => {
      _setStatus('error');
    };
  }

  function _scheduleReconnect() {
    if (_destroyed) return;
    _reconnectTimer = setTimeout(() => {
      _reconnectTimer = null;
      _open();
    }, _reconnectDelay);
    _reconnectDelay = Math.min(_reconnectDelay * 1.5, RECONNECT_MAX_MS);
  }

  function _cleanup() {
    if (_resyncTimer) { clearTimeout(_resyncTimer); _resyncTimer = null; }
    if (_reconnectTimer) { clearTimeout(_reconnectTimer); _reconnectTimer = null; }
    _syncCb = null;
    if (_ws) {
      try { _ws.onopen = _ws.onmessage = _ws.onclose = _ws.onerror = null; _ws.close(); } catch (_) { /* ignore */ }
      _ws = null;
    }
  }

  function _sendProbe() {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        _syncCb = null;
        reject(new Error('probe timeout'));
      }, PROBE_TIMEOUT_MS);

      const t1 = Date.now();
      _syncCb = (msg, t4) => {
        clearTimeout(timer);
        _syncCb = null;
        resolve({
          rtt: (t4 - msg.t1) - (msg.t3 - msg.t2),
          offset: ((msg.t2 - msg.t1) + (msg.t3 - t4)) / 2,
        });
      };
      _ws.send(JSON.stringify({ type: 'sync_req', t1 }));
    });
  }

  async function _runSync() {
    if (_resyncTimer) { clearTimeout(_resyncTimer); _resyncTimer = null; }

    const results = [];
    for (let i = 0; i < PROBE_COUNT; i++) {
      try {
        results.push(await _sendProbe());
      } catch (_) {
        // probe timed out — skip
      }
    }

    if (results.length === 0) {
      _resyncTimer = setTimeout(_runSync, 30000);
      return;
    }

    const best = results.reduce((a, b) => a.rtt < b.rtt ? a : b);
    _offset = best.offset;
    _bestRtt = best.rtt;
    _synced = true;

    if (_onSync) {
      try { _onSync({ offset: _offset, rtt: _bestRtt }); } catch (_) { /* ignore */ }
    }

    _resyncTimer = setTimeout(_runSync, RESYNC_MS);
  }

  function resync() {
    if (_ws && _ws.readyState === WebSocket.OPEN) _runSync();
  }

  function disconnect() {
    _destroyed = true;
    _synced = false;
    _cleanup();
    _setStatus('disconnected');
  }

  function getServerTime() {
    return Date.now() + _offset;
  }

  return {
    connect,
    disconnect,
    resync,
    getServerTime,
    isSynced:   () => _synced,
    getOffset:  () => _offset,
    getRtt:     () => _bestRtt,
  };
})();
