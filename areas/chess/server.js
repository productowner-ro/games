// Serves the game and proxies Jev calls so the API key stays out of the browser.
// Run: node areas/chess/server.js   then open http://localhost:8788
const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = process.env.PORT || 8788;
const API_URL = 'https://api.typesafe.ai/v1/systemone';

function readKey() {
  if (process.env.TYPESAFE_API_KEY) return process.env.TYPESAFE_API_KEY;
  throw new Error('Set the env var TYPESAFE_API_KEY before you start the server.');
}

const KEY = readKey();
// One text line per move, sent by the page. Read it to review games without screenshots.
const LOG_FILE = process.env.LOG_FILE || path.join(__dirname, 'games.log');
const LEGEND = `# Jev chess game log. One line per move, tab-separated:
# no move src plan planP drawnP conf adv advBR flags top3
#   no: the move number as the UI shows it: "38." is White's move 38, "38..." is Black's reply
#   src: j=Jev, m=code played mate, o=code played the only safe move, f=fallback heuristic, h=human click
#   plan: dev=develop, mat=win material, atk=attack king, mate=mate weak king, draw=hold draw
#   planP: probability of the chosen plan. drawnP: probability of the drawn move. conf: Jev's move confidence
#   adv: mover's material lead before the move. advBR: lead after the opponent's best capture reply
#   flags: R=repeats a position, D=draws by repetition, S=stalemates, -=none
#   top3: Jev's top moves as move:p:advBR
# "# game <id>" starts a game, "# undo" takes one move back, "# end <result> <reason> after move <no>" ends it.
`;
// The legend describes the lines below it. When the format changes, the new legend goes under the old lines.
if (!fs.existsSync(LOG_FILE) || !fs.readFileSync(LOG_FILE, 'utf8').includes(LEGEND)) fs.appendFileSync(LOG_FILE, LEGEND);
const STATIC = { '/': 'index.html', '/index.html': 'index.html', '/chess.js': 'chess.js' };
const TYPES = { '.html': 'text/html', '.js': 'text/javascript' };

http.createServer(async (req, res) => {
  if (req.method === 'POST' && req.url === '/api/log') {
    let body = '';
    for await (const chunk of req) body += chunk;
    try {
      if (!fs.existsSync(LOG_FILE)) fs.writeFileSync(LOG_FILE, LEGEND); // someone removed the file while we run
      fs.appendFileSync(LOG_FILE, body.replace(/\n/g, ' ') + '\n');
      res.writeHead(204);
    } catch (e) {
      res.writeHead(500);
    }
    res.end();
    return;
  }
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
}).listen(PORT, () => console.log(`Chess on http://localhost:${PORT}`));
