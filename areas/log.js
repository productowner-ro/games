// Shared by the games: the game log in page memory and its push to /api/log (issue #12).
// resources/2026-10-20-game-log-spec.md holds the format. Load it before the game script.
// It sets one global: GameLog. It stores nothing in the browser: a page reload loses the lines that wait.
'use strict';
var GameLog = (() => {
  const MAX_WAITING = 500; // past this, the oldest line goes
  const PUSH_AT = 50; // lines that start a push; also the most lines in one push
  const EVERY = 60 * 1000; // a push every minute

  let game = null; // { name, id, seq }: the game that writes now
  let waiting = []; // { name, id, seq, text }, oldest first
  let fresh = 0; // lines written since the last push began: 50 of them start a push
  let sending = false;

  // A random id for one game. crypto.randomUUID needs https or localhost; elsewhere, build the same form.
  function newId() {
    if (crypto.randomUUID) return crypto.randomUUID();
    const b = crypto.getRandomValues(new Uint8Array(16));
    b[6] = (b[6] & 0x0f) | 0x40;
    b[8] = (b[8] & 0x3f) | 0x80;
    const h = Array.from(b, x => x.toString(16).padStart(2, '0')).join('');
    return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
  }

  // The lines of one push: the waiting lines of the oldest game, at most PUSH_AT. One body holds one game id.
  function nextBatch() {
    const first = waiting[0];
    return waiting.filter(l => l.id === first.id).slice(0, PUSH_AT);
  }

  const body = lines => [`${lines[0].name}\t${lines[0].id}`, ...lines.map(l => `${l.seq}\t${l.text}`)].join('\n');
  const drop = lines => { waiting = waiting.filter(l => !lines.includes(l)); };

  // Sends the waiting lines, one game at a time. 204: the lines are in D1. 400: they break a limit and go.
  // 503, another answer or a lost connection: they wait for the next push.
  async function push() {
    if (sending) return;
    sending = true;
    fresh = 0;
    try {
      while (waiting.length) {
        const lines = nextBatch();
        let res;
        try {
          res = await fetch('/api/log', { method: 'POST', headers: { 'Content-Type': 'text/plain' }, body: body(lines) });
        } catch (e) {
          break;
        }
        if (res.ok || res.status === 400) drop(lines);
        else break;
      }
    } finally {
      sending = false;
    }
  }

  // The page closes: sendBeacon still sends after the page is gone. It gives no answer, so a queued line goes.
  function pushOnClose() {
    while (waiting.length) {
      const lines = nextBatch();
      if (!navigator.sendBeacon('/api/log', body(lines))) return;
      drop(lines);
    }
  }

  if (typeof setInterval === 'function') setInterval(push, EVERY);
  if (typeof addEventListener === 'function' && typeof navigator !== 'undefined' && navigator.sendBeacon) {
    addEventListener('pagehide', pushOnClose);
  }

  return {
    // Starts a new game of `name` (chess, tetris or mitropoly) and returns its game id. It writes no line.
    start(name) {
      game = { name, id: newId(), seq: 0 };
      return game.id;
    },

    // Writes one log line of the current game: a text, or a list of fields that become one tab-separated line.
    // An empty field becomes "-". A tab or a line break inside a field becomes a space.
    write(line) {
      if (!game) return;
      const text = Array.isArray(line)
        ? line.map(v => (v === undefined || v === null || v === '' ? '-' : String(v).replace(/[\t\r\n]/g, ' '))).join('\t')
        : line;
      waiting.push({ name: game.name, id: game.id, seq: ++game.seq, text });
      if (waiting.length > MAX_WAITING) waiting.shift();
      if (++fresh >= PUSH_AT) push();
    },

    // Sends the waiting lines now. The minute timer and the 50-line mark call it too.
    push,

    // The number of lines that wait in the page.
    waiting: () => waiting.length,
  };
})();
