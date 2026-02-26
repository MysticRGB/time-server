const http = require('http');
const fs = require('fs');
const path = require('path');
const { WebSocketServer } = require('ws');

const PORT = process.env.PORT || 4200;

const server = http.createServer((req, res) => {
  if (req.url === '/' || req.url === '/index.html') {
    const file = path.join(__dirname, 'test-client.html');
    fs.readFile(file, (err, data) => {
      if (err) {
        res.writeHead(500);
        res.end('Error');
        return;
      }
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(data);
    });
  } else {
    res.writeHead(404);
    res.end('Not found');
  }
});

const wss = new WebSocketServer({ server });

const clients = new Map();

wss.on('connection', (ws, req) => {
  const id = `${req.socket.remoteAddress}:${req.socket.remotePort}`;
  clients.set(ws, { id, connectedAt: Date.now() });

  console.log(`[+] ${id}  (online: ${clients.size})`);

  ws.on('message', (raw) => {
    let msg;
    try {
      msg = JSON.parse(raw);
    } catch {
      return;
    }

    if (msg.type === 'sync_req') {
      const t2 = Date.now();
      ws.send(JSON.stringify({
        type: 'sync_res',
        t1: msg.t1,
        t2,
        t3: Date.now(),
      }));
    }
  });

  ws.on('close', () => {
    clients.delete(ws);
    console.log(`[-] ${id}  (online: ${clients.size})`);
  });

  ws.on('error', (err) => {
    console.error(`[!] ${id}  ${err.message}`);
  });
});

server.listen(PORT, () => {
  console.log(`Time server listening on http://localhost:${PORT}`);
  console.log(`WebSocket available on ws://localhost:${PORT}`);
});
