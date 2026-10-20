// Headless tests of the decisions of a Jev seat (issue #6): decision() lists the options, choose() plays one.
// Run: node areas/mitropoly/rules-test.js
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const SOURCE = fs.readFileSync(path.join(__dirname, 'mitropoly.js'), 'utf8');

// A fresh game with no page. `jev` marks the Jev seats.
function game(names, jev) {
  const ctx = { console, Math };
  vm.createContext(ctx);
  vm.runInContext(`${SOURCE}\nthis.api = { newGame, decision, choose, land, pay, get G() { return G; } };`, ctx);
  ctx.api.newGame(names, jev);
  return ctx.api;
}

// Puts the current player on square k and plays the landing, as a move does.
function landOn(api, k) {
  const p = api.G.players[api.G.cur];
  p.pos = k;
  api.land(p);
}

test('a Jev seat on a free street decides: buy or refuse', () => {
  const api = game(['A', 'B'], [true, false]);
  landOn(api, 1); // Parohie de cartier, 60 lei

  const d = api.decision();

  assert.strictEqual(d.kind, 'buy');
  assert.strictEqual(d.seat, 0);
  assert.deepStrictEqual(Object.keys(d.options), ['buy', 'refuse']);
  assert.strictEqual(d.options.buy.price, 60);
  assert.strictEqual(d.options.buy.money_after, 1440);
});

test('the buy facts show the rent and who holds the rest of the group', () => {
  const api = game(['A', 'B'], [true, false]);
  api.G.props[3] = { owner: 1, houses: 0, mortgaged: false }; // B holds the other brown street
  landOn(api, 1);

  const { buy } = api.decision().options;

  assert.strictEqual(buy.rent_today, 2);
  assert.deepStrictEqual({ ...buy.group_squares_owned }, { A: 0, B: 1, 'for sale': 1 });
  assert.strictEqual(buy.completes_your_group, false);
  assert.strictEqual(buy.blocks_group_of, 'B');
});

test('a buy that completes your group says so', () => {
  const api = game(['A', 'B'], [true, false]);
  api.G.props[3] = { owner: 0, houses: 0, mortgaged: false };
  landOn(api, 1);

  const { buy } = api.decision().options;

  assert.strictEqual(buy.completes_your_group, true);
  assert.strictEqual(buy.blocks_group_of, 'nobody');
});

test('out of jail, a Jev seat has one option: roll', () => {
  const api = game(['A', 'B'], [true, false]);

  const d = api.decision();

  assert.strictEqual(d.kind, 'roll');
  assert.deepStrictEqual(Object.keys(d.options), ['roll']);
});

test('in jail with money and a card, a Jev seat decides: roll for a double, pay 50 lei, or use the card', () => {
  const api = game(['A', 'B'], [true, false]);
  const a = api.G.players[0];
  Object.assign(a, { pos: 10, jail: true, jailTurns: 1, getOut: 1 });
  api.G.props[19] = { owner: 1, houses: 2, mortgaged: false }; // B: 2 paraclise on square 19

  const d = api.decision();

  assert.strictEqual(d.kind, 'jail');
  assert.deepStrictEqual(Object.keys(d.options), ['roll_for_double', 'pay_bribe', 'use_card']);
  const s = d.situation;
  assert.strictEqual(s.jail_turn, 2);
  assert.strictEqual(s.cards, 1);
  assert.strictEqual(s.highest_rent_ahead, 220);
  assert.strictEqual(s.highest_rent_owner, 'B');
});

test('in jail with less than 50 lei and no card, the only option is to roll', () => {
  const api = game(['A', 'B'], [true, false]);
  Object.assign(api.G.players[0], { pos: 10, jail: true, money: 40 });

  assert.deepStrictEqual(Object.keys(api.decision().options), ['roll_for_double']);
});

test('choose pay_bribe: the Jev seat pays 50 lei, leaves jail and rolls next', () => {
  const api = game(['A', 'B'], [true, false]);
  const a = api.G.players[0];
  Object.assign(a, { pos: 10, jail: true });

  api.choose('pay_bribe');

  assert.strictEqual(a.jail, false);
  assert.strictEqual(a.money, 1450);
  assert.strictEqual(api.decision().kind, 'roll');
});

test('choose use_card: the Jev seat leaves jail with one card less', () => {
  const api = game(['A', 'B'], [true, false]);
  const a = api.G.players[0];
  Object.assign(a, { pos: 10, jail: true, getOut: 1 });

  api.choose('use_card');

  assert.strictEqual(a.jail, false);
  assert.strictEqual(a.getOut, 0);
});

// A owns the brown group (squares 1 and 3) and has moved: the turn is in its end phase.
function brownOwner() {
  const api = game(['A', 'B'], [true, false]);
  api.G.props[1] = { owner: 0, houses: 0, mortgaged: false };
  api.G.props[3] = { owner: 0, houses: 0, mortgaged: false };
  api.G.phase = 'end';
  return api;
}

test('after the move, a Jev seat manages: each legal build and mortgage, and end turn', () => {
  const api = brownOwner();

  const d = api.decision();

  assert.strictEqual(d.kind, 'manage');
  assert.deepStrictEqual(Object.keys(d.options).sort(), ['build_1', 'build_3', 'end_turn', 'mortgage_1', 'mortgage_3']);
  assert.deepStrictEqual({ ...d.options.build_1 }, { square: 'Parohie de cartier', cost: 50, money_after: 1450, rent_before: 4, rent_after: 10 });
  assert.deepStrictEqual({ ...d.options.mortgage_3 }, { square: 'Capelă de spital', cash_in: 30, money_after: 1530, rent_before: 8, rent_after: 0 });
});

test('after a build, code asks again, and the even-build rule holds', () => {
  const api = brownOwner();

  api.choose('build_1');

  assert.strictEqual(api.G.props[1].houses, 1);
  const d = api.decision();
  assert.strictEqual(d.kind, 'manage');
  assert.ok(!('build_1' in d.options));
  assert.ok('build_3' in d.options);
});

test('a mortgaged square offers a buy-back', () => {
  const api = brownOwner();
  api.G.props[3].mortgaged = true;

  const { buyback_3 } = api.decision().options;

  assert.deepStrictEqual({ ...buyback_3 }, { square: 'Capelă de spital', cost: 33, money_after: 1467, rent_before: 0, rent_after: 8 });
});

test('choose end_turn: the next seat plays', () => {
  const api = brownOwner();

  api.choose('end_turn');

  assert.strictEqual(api.G.cur, 1);
  assert.strictEqual(api.G.phase, 'roll');
});

test('a Jev seat that cannot pay goes into debt: one option per sale and per mortgage', () => {
  const api = brownOwner();
  const [a, b] = api.G.players;
  a.money = 100;
  api.G.props[1].houses = 1;
  api.G.props[3].houses = 1;

  api.pay(a, 200, b);

  const d = api.decision();
  assert.strictEqual(d.kind, 'debt');
  assert.strictEqual(d.seat, 0);
  assert.strictEqual(d.situation.debt_left, 100);
  assert.deepStrictEqual(Object.keys(d.options), ['sell_1', 'sell_3']);
  assert.deepStrictEqual({ ...d.options.sell_1 }, { square: 'Parohie de cartier', cash_in: 25, rent_lost: 6 }); // rent 10 with 1 paraclis, 4 for the full group without
  assert.strictEqual(b.money, 1500); // B waits for the full sum
});

test('the creditor gets the full sum once the Jev seat pays the debt', () => {
  const api = brownOwner();
  const [a, b] = api.G.players;
  a.money = 100;
  api.G.props[1].houses = 1;
  api.G.props[3].houses = 1;
  api.pay(a, 200, b);

  for (const key of ['sell_1', 'sell_3', 'mortgage_1', 'mortgage_3']) api.choose(key);

  assert.strictEqual(a.money, 10);
  assert.strictEqual(b.money, 1700);
  assert.strictEqual(api.decision().kind, 'manage');
});

test('a Jev seat in debt with nothing left to sell goes bankrupt; the creditor gets the cash', () => {
  const api = game(['A', 'B', 'C'], [true, false, false]);
  const [a, b] = api.G.players;
  a.money = 100;

  api.pay(a, 200, b);

  assert.strictEqual(a.out, true);
  assert.strictEqual(b.money, 1600);
});

test('several Jev debtors pay one at a time, in seat order', () => {
  const api = game(['A', 'B', 'C'], [true, true, false]);
  const [a, b, c] = api.G.players;
  api.G.cur = 2;
  api.G.props[1] = { owner: 0, houses: 0, mortgaged: false };
  api.G.props[5] = { owner: 1, houses: 0, mortgaged: false };
  a.money = 10;
  b.money = 10;
  api.pay(a, 20, c);
  api.pay(b, 20, c);

  assert.strictEqual(api.decision().seat, 0);
  api.choose('mortgage_1');
  assert.strictEqual(api.decision().seat, 1);
  api.choose('mortgage_5');
  assert.strictEqual(c.money, 1540);
  assert.strictEqual(api.decision(), null); // C is human: the page asks C
});

test('a human seat that cannot pay keeps the automatic sale', () => {
  const api = game(['A', 'B'], [false, false]);
  const [a, b] = api.G.players;
  api.G.props[1] = { owner: 0, houses: 0, mortgaged: false };
  a.money = 10;

  api.pay(a, 20, b);

  assert.strictEqual(api.G.props[1].mortgaged, true);
  assert.strictEqual(a.money, 20);
  assert.strictEqual(b.money, 1520);
});

test('a human seat gets no decision: the page asks the human', () => {
  const api = game(['A', 'B'], [false, true]);
  landOn(api, 1);

  assert.strictEqual(api.decision(), null);
});

test('choose buy: the Jev seat owns the street and the turn goes on', () => {
  const api = game(['A', 'B'], [true, false]);
  landOn(api, 1);

  api.choose('buy');

  assert.strictEqual(api.G.props[1].owner, 0);
  assert.strictEqual(api.G.players[0].money, 1440);
  assert.notStrictEqual(api.G.phase, 'buy');
});
