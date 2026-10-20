// Serves the Mitropoly parody board game. No dependencies.
// Run: node areas/mitropoly/server.js   then open http://localhost:8790
const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = process.env.PORT || 8790;
const FILES = {
  '/': ['index.html', 'text/html; charset=utf-8'],
  '/index.html': ['index.html', 'text/html; charset=utf-8'],
  '/mitropoly.js': ['mitropoly.js', 'text/javascript; charset=utf-8'],
};

http.createServer((req, res) => {
  const entry = FILES[req.url.split('?')[0]];
  if (!entry) {
    res.writeHead(404, { 'Content-Type': 'text/plain' });
    return res.end('Not found');
  }
  fs.readFile(path.join(__dirname, entry[0]), (err, data) => {
    if (err) {
      res.writeHead(500, { 'Content-Type': 'text/plain' });
      return res.end('Read error');
    }
    res.writeHead(200, { 'Content-Type': entry[1], 'Cache-Control': 'no-store' });
    res.end(data);
  });
}).listen(PORT, () => console.log(`Mitropoly: http://localhost:${PORT}`));
