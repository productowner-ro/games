// Shared by the games: the call to /api/jev, the semaphore and the stop at the daily cap (issue #5).
// Load it before the game script. It sets one global: Jev.
'use strict';
var Jev = (() => {
  const KEY = 'jev-calls-left'; // the last value this browser saw
  let light = null;

  function paint(text, colour) {
    if (!light) return;
    light.textContent = text;
    light.className = `semaphore ${colour}`;
  }

  function remember(left) {
    try { localStorage.setItem(KEY, String(left)); } catch (e) { /* storage blocked */ }
  }

  function show(left) {
    remember(left);
    paint(`About ${left} Jev calls left today`, left > 1000 ? 'green' : left > 0 ? 'yellow' : 'red');
  }

  return {
    // Shows the semaphore in `element`: the last value this browser saw, in grey, until the first call.
    mount(element) {
      light = element;
      let seen = null;
      try { seen = localStorage.getItem(KEY); } catch (e) { /* storage blocked */ }
      paint(seen === null ? 'Jev calls left today: not known yet' : `About ${seen} Jev calls left today`, 'grey');
    },

    // Sends one Jev request and returns its answers. At the daily cap it throws an error with `dailyCap`.
    async call(body) {
      const res = await fetch('/api/jev', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (res.status === 429) {
        remember(0);
        paint('Jev rests until 00:00 UTC', 'red');
        const e = new Error('Jev rests until 00:00 UTC');
        e.dailyCap = true;
        throw e;
      }
      show(Number(res.headers.get('X-Jev-Calls-Left')));
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return (await res.json()).answers;
    },
  };
})();
