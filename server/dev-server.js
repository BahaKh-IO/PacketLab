// dev-server.js — run the backend on YOUR machine, for development only.
//   node server/dev-server.js
// It listens on 127.0.0.1 (this computer only: nobody on the network or the internet
// can reach it) and stores data in server/dev.db (ignored by Git).
// In production the same api.js runs on Cloudflare (worker.js), not here.
import { createServer } from 'node:http';
import { handleRequest } from './api.js';
import { openDatabase } from './d1-sqlite.js';

const PORT = Number(process.env.PORT ?? 8787);
const env = {
  DB: openDatabase(new URL('./dev.db', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')),
  // Live Server (VS Code) and the local test server.
  ALLOWED_ORIGINS: 'http://127.0.0.1:5500,http://localhost:5500,http://localhost:5517',
};

createServer(async (req, res) => {
  // Node request -> web Request -> api.js -> web Response -> Node response.
  const chunks = [];
  for await (const c of req) chunks.push(c);
  const body = chunks.length ? Buffer.concat(chunks) : null;
  const request = new Request(`http://127.0.0.1:${PORT}${req.url}`, {
    method: req.method,
    headers: req.headers,
    body: ['GET', 'HEAD'].includes(req.method) ? null : body,
  });
  const response = await handleRequest(request, env);
  res.writeHead(response.status, Object.fromEntries(response.headers));
  res.end(Buffer.from(await response.arrayBuffer()));
}).listen(PORT, '127.0.0.1', () => {
  console.log(`API PacketLab (développement) sur http://127.0.0.1:${PORT}/api — Ctrl+C pour arrêter.`);
});
