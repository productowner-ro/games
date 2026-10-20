// Plays many random games headless with a stub DOM and checks the game invariants.
// Run: node areas/mitropoly/sim-test.js
const fs = require('fs');
const path = require('path');
const vm = require('vm');

function stubEl() {
  return {
    innerHTML: '', textContent: '', value: '4', hidden: false, title: '', id: '', className: '',
    style: { setProperty() {} }, dataset: {},
    classList: { toggle() {} },
    appendChild() {}, addEventListener() {},
    querySelector() { return stubEl(); },
  };
}
const els = {};
const document = {
  querySelector: s => (els[s] = els[s] || stubEl()),
  createElement: () => stubEl(),
  addEventListener() {},
};

const ctx = { document, console, Math };
vm.createContext(ctx);
vm.runInContext(fs.readFileSync(path.join(__dirname, 'mitropoly.js'), 'utf8') + '\nthis.api = { newGame, roll, buy, skip, endTurn, payBribe, useCard, build, canBuild, toggleMortgage, get G() { return G; } };', ctx);
const api = ctx.api;

let games = 0, winners = 0, turns = 0;
for (let g = 0; g < 500; g++) {
  api.newGame(['A', 'B', 'C', 'D']);
  for (let step = 0; step < 5000 && api.G.phase !== 'over'; step++) {
    const G = api.G, p = G.players[G.cur];
    G.fx.length = 0;
    if (G.phase === 'buy') (Math.random() < 0.8 ? api.buy : api.skip)();
    else if (G.phase === 'end') { for (let k = 0; k < 40; k++) if (api.canBuild(k) && Math.random() < 0.5) api.build(k); api.endTurn(); turns++; }
    else if (G.phase === 'again') api.roll();
    else if (p.jail && p.getOut) api.useCard();
    else if (p.jail && p.money >= 50 && Math.random() < 0.3) api.payBribe();
    else api.roll();

    for (const q of G.players) {
      if (!q.out && q.money < 0) throw new Error(`game ${g}: ${q.name} alive with money ${q.money}`);
    }
    for (const [k, pr] of Object.entries(G.props)) {
      if (G.players[pr.owner].out) throw new Error(`game ${g}: square ${k} owned by a bankrupt player`);
      if (pr.houses < 0 || pr.houses > 5) throw new Error(`game ${g}: square ${k} has ${pr.houses} houses`);
    }
  }
  games++;
  if (api.G.winner) winners++;
}
console.log(`OK: ${games} games, ${winners} ended with a Patriarch, ${turns} turns, no invariant broke.`);
