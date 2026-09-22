// Serves tests/e2e/fixtures over HTTP. Usage: node tests/e2e/static-server.mjs <port>
import http from 'node:http';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const dir = path.join(path.dirname(fileURLToPath(import.meta.url)), 'fixtures');
const port = Number(process.argv[2] ?? 4173);

http
  .createServer(async (req, res) => {
    const url = new URL(req.url ?? '/', 'http://localhost');
    const name = path.basename(url.pathname) || 'index.html';
    try {
      const body = await readFile(path.join(dir, name));
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' });
      res.end(body);
    } catch {
      res.writeHead(404);
      res.end('not found');
    }
  })
  .listen(port, '127.0.0.1', () => console.warn(`fixtures on http://127.0.0.1:${port}`));
