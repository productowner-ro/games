// Counts the decision points of a mitropoly game that have more than one option.
// Same random policy as sim-test.js. Run: node areas/mitropoly/decision-count.js
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const stub = () => ({ style: { setProperty() {} }, dataset: {}, classList: { toggle() {} }, appendChild() {}, addEventListener() {}, querySelector() { return stub(); } });
const ctx = { document: { querySelector: stub, createElement: stub, addEventListener() {} }, console, Math };
vm.createContext(ctx);
vm.runInContext(fs.readFileSync(path.join(__dirname, 'mitropoly.js'), 'utf8')
  + '\nthis.api = { newGame, roll, buy, skip, endTurn, payBribe, useCard, build, canBuild, canMortgage, BOARD, get G() { return G; } };', ctx);
const api = ctx.api;

const N = 500, LIMIT = 5000;
const c = { games: 0, ended: 0, turns: 0, buy: 0, jail: 0, manage: 0, buildable: 0 };
const e = { turns: 0, buy: 0, jail: 0, manage: 0 };
for (let g = 0; g < N; g++) {
  api.newGame(['A', 'B', 'C', 'D']);
  let step = 0;
  for (; step < LIMIT && api.G.phase !== 'over'; step++) {
    const G = api.G, p = G.players[G.cur];
    G.fx.length = 0;
    if (G.phase === 'buy') { c.buy++; (Math.random() < 0.8 ? api.buy : api.skip)(); }
    else if (G.phase === 'end') {
      const builds = [...Array(40).keys()].filter(k => api.canBuild(k));
      const backs = Object.keys(G.props).map(Number).filter(k => G.props[k].owner === G.cur && G.props[k].mortgaged && api.canMortgage(k));
      if (builds.length || backs.length) c.manage++;
      if (builds.length) c.buildable++;
      for (const k of builds) if (api.canBuild(k) && Math.random() < 0.5) api.build(k);
      api.endTurn(); c.turns++;
    }
    else if (G.phase === 'again') api.roll();
    else if (p.jail) {
      if (p.getOut || p.money >= 50) c.jail++;
      if (p.getOut) api.useCard();
      else if (p.money >= 50 && Math.random() < 0.3) api.payBribe();
      else api.roll();
    }
    else api.roll();
  }
  c.games++;
  if (api.G.winner) { c.ended++; for (const k in e) e[k] += c[k] - (c.prev?.[k] || 0); }
  c.prev = { turns: c.turns, buy: c.buy, jail: c.jail, manage: c.manage };
}
const per = k => (c[k] / c.games).toFixed(0);
console.log(`${c.games} games, ${c.ended} ended with a winner.`);
console.log(`Per game: ${per('turns')} turns, ${per('buy')} buy choices, ${per('jail')} jail choices, ${per('manage')} turn ends with a build or buy-back option (${per('buildable')} with a build).`);
console.log(`Per 100 turns, all games: ${(c.jail / c.turns * 100).toFixed(1)} jail choices, ${(c.manage / c.turns * 100).toFixed(1)} manage choices.`);
console.log(`Ended games, average: ${(e.turns / c.ended).toFixed(0)} turns, ${(e.buy / c.ended).toFixed(0)} buy, ${(e.jail / c.ended).toFixed(0)} jail, ${(e.manage / c.ended).toFixed(0)} manage.`);
