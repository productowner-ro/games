// Serves the game and proxies Jev calls so the API key stays out of the browser.
// Run: node areas/tetris/server.js   then open http://localhost:8787
const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = process.env.PORT || 8787;
const API_URL = 'https://api.typesafe.ai/v1/systemone';

function readKey() {
  if (process.env.TYPESAFE_API_KEY) return process.env.TYPESAFE_API_KEY;
  throw new Error('Set the env var TYPESAFE_API_KEY before you start the server.');
}

const KEY = readKey();
const STATIC = { '/': 'index.html', '/index.html': 'index.html', '/tetris.js': 'tetris.js' };
const TYPES = { '.html': 'text/html', '.js': 'text/javascript' };

http.createServer(async (req, res) => {
  if (req.method === 'POST' && req.url === '/api/jev') {
    let body = '';
    for await (const chunk of req) body += chunk;
    try {
      const upstream = await fetch(API_URL, {
        method: 'POST',
        headers: { Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' },
        body,
      });
      res.writeHead(upstream.status, { 'Content-Type': 'application/json' });
      res.end(await upstream.text());
    } catch (e) {
      res.writeHead(502, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: e.message }));
    }
    return;
  }
  const file = STATIC[req.url];
  if (req.method === 'GET' && file) {
    res.writeHead(200, { 'Content-Type': TYPES[path.extname(file)] });
    res.end(fs.readFileSync(path.join(__dirname, file)));
    return;
  }
  res.writeHead(404);
  res.end('not found');
}).listen(PORT, () => console.log(`Tetris on http://localhost:${PORT}`));
