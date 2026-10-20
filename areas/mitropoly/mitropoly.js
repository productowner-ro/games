// Mitropoly: a hot-seat parody of Monopoly. Satire of the BOR as an institution and of
// convicted or disgraced Romanian politicians.
// The rules are synchronous and live in G. Each rule step also pushes an effect onto G.fx.
// After each action the UI plays G.fx in order (dice, hops, money, cards), then redraws from G.
'use strict';

const PLAYER_COLORS = ['#d62839', '#1f8a70', '#e08e1b', '#5b3fa0'];
const DEFAULT_NAMES = ['Părintele Gigel', 'Barosanul din Teleorman', 'Maica Stareță', 'Consilierul Local'];
const GROUP_COLORS = {
  brown: '#7b4a26', lightblue: '#79b8d9', pink: '#c2327a', orange: '#e27414',
  red: '#c0262d', yellow: '#e9b83a', green: '#2b6b4c', darkblue: '#1f3560',
};
const LIGHT_GROUPS = new Set(['lightblue', 'yellow']);
const GROUP_NAMES = {
  brown: 'Parohii', lightblue: 'Mănăstiri', pink: 'Retrocedări', orange: 'Teleorman',
  red: 'Palatul Victoria', yellow: 'Mitropolii', green: 'Patriarhie', darkblue: 'Megalomanie',
};

const S = (name, group, price, rent, house) => ({ type: 'street', name, group, price, rent, house });
const R = name => ({ type: 'rail', name, price: 200, icon: 'car' });
const U = (name, icon) => ({ type: 'util', name, price: 150, icon });
const CHANCE_SQ = { type: 'chance', name: 'Minune', icon: 'sun', sub: 'Trage o carte' };
const CHEST_SQ = { type: 'chest', name: 'Cutia milei', icon: 'box', sub: 'Trage o carte' };

// 40 squares, same layout and prices as the classic board.
const BOARD = [
  { type: 'go', name: 'START', icon: 'arrow', sub: 'Salariu la stat, frate. Primești 200 când treci.' },
  S('Parohie de cartier', 'brown', 60, [2, 10, 30, 90, 160, 250], 50),
  CHEST_SQ,
  S('Capelă de spital', 'brown', 60, [4, 20, 60, 180, 320, 450], 50),
  { type: 'tax', name: 'Impozit? Ce-i aia, bă?', amount: -100, icon: 'coin', sub: 'Scutire de impozit. Banca îți dă 100.' },
  R('Duster (pentru poze)'),
  S('Mănăstire cu SPA', 'lightblue', 100, [6, 30, 90, 270, 400, 550], 50),
  CHANCE_SQ,
  S('Schit cu vedere la mare', 'lightblue', 100, [6, 30, 90, 270, 400, 550], 50),
  S('Pangar fără bon', 'lightblue', 120, [8, 40, 100, 300, 450, 600], 50),
  { type: 'jail', name: 'RAHOVA', icon: null, sub: 'Doar în vizită. Cei închiși stau după gratii.' },
  S('Teren retrocedat pe blat', 'pink', 140, [10, 50, 150, 450, 625, 750], 100),
  U('Taxa de botez, cash', 'mail'),
  S('Pădure retrocedată', 'pink', 140, [10, 50, 150, 450, 625, 750], 100),
  S('Hotel de pelerini', 'pink', 160, [12, 60, 180, 500, 700, 900], 100),
  R('BMW X5'),
  S('Insula Belina', 'orange', 180, [14, 70, 200, 550, 750, 950], 100),
  CHEST_SQ,
  S('Tel Drum, drum spre nicăieri', 'orange', 180, [14, 70, 200, 550, 750, 950], 100),
  S('Ședință de partid la Alexandria', 'orange', 200, [16, 80, 220, 600, 800, 1000], 100),
  { type: 'free', name: 'COADA LA MOAȘTE', icon: 'candle', sub: 'Coadă de 3 km. Stai. Nu se întâmplă nimic.' },
  S('Trofeul Calității', 'red', 220, [18, 90, 250, 700, 875, 1050], 150),
  CHANCE_SQ,
  S('Vot în Parlament la miezul nopții', 'red', 220, [18, 90, 250, 700, 875, 1050], 150),
  S('OUG 13, 31 ianuarie', 'red', 240, [20, 100, 300, 750, 925, 1100], 150),
  R('Audi Q7'),
  S('Mitropolia Moldovei', 'yellow', 260, [22, 110, 330, 800, 975, 1150], 150),
  S('Mitropolia Munteniei', 'yellow', 260, [22, 110, 330, 800, 975, 1150], 150),
  U('Înmormântare, pachet premium', 'mail'),
  S('Mitropolia Ardealului', 'yellow', 280, [24, 120, 360, 850, 1025, 1200], 150),
  { type: 'gojail', name: 'TE-A SUNAT DNA-UL', icon: 'phone', sub: 'Mergi direct în Rahova. Nu treci pe la START.' },
  S('Dealul Patriarhiei', 'green', 300, [26, 130, 390, 900, 1100, 1275], 200),
  S('Palatul Patriarhiei', 'green', 300, [26, 130, 390, 900, 1100, 1275], 200),
  CHEST_SQ,
  S('Excursie la Athos', 'green', 320, [28, 150, 450, 1000, 1200, 1400], 200),
  R('Mercedes G-Klasse'),
  CHANCE_SQ,
  S('Casa Poporului', 'darkblue', 350, [35, 175, 500, 1100, 1300, 1500], 200),
  { type: 'tax', name: 'Contribuția la Catedrală', amount: 100, icon: 'coin', sub: 'Din bani publici. Adică ai tăi. Plătești 100.' },
  S('Catedrala Mântuirii Neamului', 'darkblue', 400, [50, 200, 600, 1400, 1700, 2000], 200),
];

const CHANCE = [
  { t: 'Moaștele vin la Iași. Coadă de 3 km. Încasezi 50 de la fiecare jucător.', f: p => collectEach(p, 50) },
  { t: 'Referendumul pentru familie iese la 21%. Nu contează, banii nu se dau înapoi. Încasezi 100.', f: p => gain(p, 100) },
  { t: 'O singură linguriță pentru 500 de oameni. Imunitate +10. Mergi la START.', f: p => moveTo(p, 0) },
  { t: 'Politicianul vine la sfințire înainte de alegeri. Primești 150 de la buget.', f: p => gain(p, 150) },
  { t: 'Becali ridică biserici. Apoi ia condamnare în dosarul schimbului de terenuri. Mergi direct în Rahova.', f: p => sendJail(p) },
  { t: 'Teza de doctorat: copy-paste. Titlul se pierde, cariera merge mai departe. Dai înapoi 3 pătrățele.', f: p => moveBack(p, 3) },
  { t: 'Gala Bute. Fugi în Bulgaria. Te întorci extrădat. Mergi în Rahova.', f: p => sendJail(p) },
  { t: 'OUG 13, dată noaptea. Păstrezi cartea: ieși din Rahova când vrei. Sute de mii de oameni ies în Piața Victoriei.', f: p => { p.getOut++; } },
  { t: 'Plăcuță cu numele sponsorului pe biserică. Încasezi 150.', f: p => gain(p, 150) },
  { t: 'Mergi la Catedrala Mântuirii Neamului. Admiră. Plătește.', f: p => moveTo(p, 39) },
  { t: 'Condamnare definitivă: 3 ani și 6 luni. Mergi în Rahova. Scrie o carte, poate ieși mai devreme.', f: p => sendJail(p) },
  { t: 'Reparații capitale: plătești 25 pentru fiecare paraclis și 100 pentru fiecare catedrală.', f: p => payBuildings(p, 25, 100) },
  { t: 'Avansezi la Insula Belina. Pescuit cu băieții.', f: p => moveTo(p, 16) },
];

const CHEST = [
  { t: 'Pomana electorală: ulei și făină. Voturile se transformă în bani. Încasezi 100.', f: p => gain(p, 100) },
  { t: 'Sfeștanie la bloc, de la ușă la ușă. Încasezi 20 de la fiecare jucător.', f: p => collectEach(p, 20) },
  { t: 'Lumânări fără bon. Încasezi 50.', f: p => gain(p, 50) },
  { t: 'Vine ANAF-ul la biserică. Glumă. Nu vine niciodată. Încasezi 100.', f: p => gain(p, 100) },
  { t: 'Anchetă în presă. Plătești 100 pentru PR de criză.', f: p => pay(p, 100, null) },
  { t: 'Salariu de la stat, plus spor. Încasezi 200.', f: p => gain(p, 200) },
  { t: 'Pelerinaj VIP cu autocarul. Plătești 50.', f: p => pay(p, 50, null) },
  { t: 'Mergi la START. Statul te așteaptă cu salariul.', f: p => moveTo(p, 0) },
  { t: 'Un enoriaș te filmează pe TikTok. Plătești 50 fiecărui jucător ca să tacă.', f: p => payEach(p, 50) },
  { t: 'Iertare de păcate cu abonament lunar. Încasezi 25.', f: p => gain(p, 25) },
  { t: 'Ai un naș în Parlament. Păstrezi cartea: ieși din Rahova când vrei.', f: p => { p.getOut++; } },
  { t: 'Mergi în Rahova. Direct. Fără sinod.', f: p => sendJail(p) },
];

let G = null;

// ======================= rules =======================
const die = () => 1 + Math.floor(Math.random() * 6);
const cur = () => G.players[G.cur];
const idxOf = p => G.players.indexOf(p);
const isProperty = sq => sq.type === 'street' || sq.type === 'rail' || sq.type === 'util';

function shuffle(a) {
  a = a.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function fx(e) { G.fx.push(e); }
function fxMoney(p) { fx({ t: 'money', i: idxOf(p), value: p.money }); }

function log(m, cls) {
  G.log.unshift({ m, cls });
  if (G.log.length > 80) G.log.pop();
  fx({ t: 'say', m, cls });
}

function groupOf(g) {
  return BOARD.map((s, i) => (s.group === g ? i : -1)).filter(i => i >= 0);
}

function ownsGroup(owner, g) {
  return groupOf(g).every(i => G.props[i] && G.props[i].owner === owner);
}

function groupHasHouses(k) {
  const g = BOARD[k].group;
  return g ? groupOf(g).some(i => G.props[i] && G.props[i].houses > 0) : false;
}

function owned(p) {
  const idx = idxOf(p);
  return Object.keys(G.props).map(Number).filter(k => G.props[k].owner === idx);
}

function gain(p, n) {
  p.money += n;
  log(`${p.name} încasează ${n} lei.`);
  fxMoney(p);
}

function pay(p, n, to) {
  log(`${p.name} plătește ${n} lei${to ? ' lui ' + to.name : ''}.`);
  p.money -= n;
  if (p.money < 0 && p.jev) {
    // A Jev seat chooses what to sell. The creditor waits for the full sum (issue #6).
    G.debts.push({ i: idxOf(p), to: to ? idxOf(to) : -1, n });
    settleDebts();
    fxMoney(p);
    return;
  }
  if (p.money < 0) liquidate(p);
  if (p.money < 0) {
    if (to) to.money += n + p.money; // the creditor gets only what the debtor had
    bankrupt(p, to);
  } else if (to) {
    to.money += n;
  }
  fxMoney(p);
  if (to) fxMoney(to);
}

function collectEach(p, n) {
  G.players.forEach(o => { if (o !== p && !o.out) pay(o, n, p); });
}

function payEach(p, n) {
  G.players.forEach(o => { if (o !== p && !o.out && !p.out) pay(p, n, o); });
}

function payBuildings(p, perHouse, perHotel) {
  let total = 0;
  for (const k of owned(p)) {
    const h = G.props[k].houses;
    total += h === 5 ? perHotel : h * perHouse;
  }
  if (total > 0) pay(p, total, null);
  else log('Nu ai clădiri. Scapi ieftin.');
}

// Sell buildings at half price, then mortgage, until the debt is covered.
function liquidate(p) {
  for (const k of owned(p)) {
    const pr = G.props[k];
    while (pr.houses > 0 && p.money < 0) {
      pr.houses--;
      p.money += BOARD[k].house / 2;
      log(`${p.name} vinde o clădire de pe ${BOARD[k].name}.`);
    }
  }
  for (const k of owned(p)) {
    if (p.money >= 0) break;
    const pr = G.props[k];
    if (!pr.mortgaged && !groupHasHouses(k)) {
      pr.mortgaged = true;
      p.money += BOARD[k].price / 2;
      log(`${p.name} ipotechează ${BOARD[k].name}.`);
    }
  }
}

function bankrupt(p, to) {
  p.out = true;
  p.money = 0;
  log(`${p.name} e caterisit. Faliment total.`, 'bad');
  fx({ t: 'news', tag: 'Caterisit', color: '#111', m: `${p.name} dă faliment. Averea merge la ${to ? to.name : 'stat'}.` });
  const toIdx = to ? idxOf(to) : -1;
  for (const k of owned(p)) {
    if (toIdx >= 0) { G.props[k].owner = toIdx; G.props[k].houses = 0; }
    else delete G.props[k];
  }
  const alive = G.players.filter(x => !x.out);
  if (alive.length === 1) {
    G.winner = alive[0];
    log(`${alive[0].name} devine Patriarh!`, 'turnline');
    fx({ t: 'news', tag: 'Patriarh', color: '#8a6a12', m: `${alive[0].name} devine Patriarh. Sfințirea e mâine, pe bani publici.` });
  }
}

// The debts of the Jev seats, in the order they arose. The first debtor in the list decides first.
// A debtor whose money is back at 0 or more pays every creditor in full. A debtor with nothing
// left to sell goes bankrupt: the creditors get the cash in order, and the property goes to
// the creditor whose debt stays unpaid.
function settleDebts() {
  while (G.debts.length) {
    const p = G.players[G.debts[0].i];
    const mine = G.debts.filter(d => d.i === G.debts[0].i);
    if (p.money < 0 && Object.keys(debtOptions(p)).length) return;
    G.debts = G.debts.filter(d => !mine.includes(d));
    let cash = p.money + mine.reduce((s, d) => s + d.n, 0);
    let unpaid = null;
    for (const d of mine) {
      const to = d.to >= 0 ? G.players[d.to] : null;
      const part = Math.min(cash, d.n);
      cash -= part;
      if (to) { to.money += part; fxMoney(to); }
      if (part < d.n && !unpaid) unpaid = { to };
    }
    if (unpaid) bankrupt(p, unpaid.to);
  }
}

function debtOptions(p) {
  const options = {};
  for (const k of owned(p).sort((a, b) => a - b)) {
    const sq = BOARD[k], pr = G.props[k];
    if (pr.houses > 0) {
      options[`sell_${k}`] = { square: sq.name, cash_in: sq.house / 2, rent_lost: rentNow(k) - rentAfter(k, r => { r.houses--; }) };
    } else if (!pr.mortgaged && !groupHasHouses(k)) {
      options[`mortgage_${k}`] = { square: sq.name, cash_in: sq.price / 2, rent_lost: rentNow(k) };
    }
  }
  return options;
}

// Plays one sale or mortgage of the first debtor, then pays the debts that are now covered.
function chooseInDebt(key) {
  const p = G.players[G.debts[0].i];
  const [act, k] = key.split('_');
  const sq = BOARD[+k], pr = G.props[+k];
  if (!(key in debtOptions(p))) return;
  if (act === 'sell') {
    pr.houses--;
    p.money += sq.house / 2;
    log(`${p.name} vinde o clădire de pe ${sq.name}.`);
  } else {
    pr.mortgaged = true;
    p.money += sq.price / 2;
    log(`${p.name} ipotechează ${sq.name}.`);
  }
  fxMoney(p);
  settleDebts();
  if (G.winner) G.phase = 'over';
  else if (cur().out) G.phase = 'end';
}

function rent(k) {
  const sq = BOARD[k], pr = G.props[k];
  if (sq.type === 'street') {
    if (pr.houses > 0) return sq.rent[pr.houses];
    return ownsGroup(pr.owner, sq.group) ? sq.rent[0] * 2 : sq.rent[0];
  }
  const same = Object.keys(G.props).map(Number)
    .filter(i => BOARD[i].type === sq.type && G.props[i].owner === pr.owner).length;
  if (sq.type === 'rail') return 25 * 2 ** (same - 1);
  return (same === 2 ? 10 : 4) * (G.dice[0] + G.dice[1]);
}

function walk(p, path) {
  fx({ t: 'move', i: idxOf(p), path });
}

function passStart(p) {
  log('Trece pe la START: salariu la stat.');
  gain(p, 200);
}

function move(p, steps) {
  const path = Array.from({ length: steps }, (_, s) => (p.pos + s + 1) % 40);
  walk(p, path);
  if (p.pos + steps >= 40) passStart(p);
  p.pos = (p.pos + steps) % 40;
  land(p);
}

function moveTo(p, idx) {
  const steps = (idx - p.pos + 40) % 40;
  walk(p, Array.from({ length: steps }, (_, s) => (p.pos + s + 1) % 40));
  if (idx <= p.pos) passStart(p);
  p.pos = idx;
  land(p);
}

function moveBack(p, n) {
  walk(p, Array.from({ length: n }, (_, s) => (p.pos - s - 1 + 40) % 40));
  p.pos = (p.pos - n + 40) % 40;
  land(p);
}

function sendJail(p) {
  p.pos = 10;
  p.jail = true;
  p.jailTurns = 0;
  G.next = 'end';
  G.doubles = 0;
  log(`${p.name} ajunge în Rahova.`, 'bad');
  fx({ t: 'jail', i: idxOf(p) });
}

function land(p) {
  const sq = BOARD[p.pos];
  log(`${p.name} ajunge pe ${sq.name}.`);
  if (isProperty(sq)) {
    const pr = G.props[p.pos];
    if (!pr) {
      if (p.money >= sq.price) G.phase = 'buy';
      else log('N-are bani. Nici plic.');
    } else if (pr.owner !== G.cur && !pr.mortgaged && !G.players[pr.owner].out) {
      pay(p, rent(p.pos), G.players[pr.owner]);
    }
    return;
  }
  if (sq.type === 'tax') {
    if (sq.amount < 0) gain(p, -sq.amount);
    else pay(p, sq.amount, null);
  } else if (sq.type === 'chance') draw('chance');
  else if (sq.type === 'chest') draw('chest');
  else if (sq.type === 'gojail') {
    fx({ t: 'news', tag: 'DNA', color: '#7a1717', m: `Ultima oră: ${p.name} a fost chemat la DNA. Pleacă cu mandat.` });
    sendJail(p);
  }
}

function draw(kind) {
  const deck = G[kind];
  const c = deck.shift();
  deck.push(c);
  const tag = kind === 'chance' ? 'Minune' : 'Cutia milei';
  log(`${tag}: ${c.t}`);
  fx({ t: 'news', tag, color: kind === 'chance' ? '#8a6a12' : '#1f3560', m: c.t, hold: true });
  c.f(cur());
}

function afterMove() {
  if (G.winner) G.phase = 'over';
  else if (cur().out) G.phase = 'end';
  else if (G.phase !== 'buy') G.phase = G.next;
}

function roll() {
  const p = cur();
  const d1 = die(), d2 = die();
  const dbl = d1 === d2;
  G.dice = [d1, d2];
  fx({ t: 'dice', d: [d1, d2] });
  log(`${p.name} dă ${d1} + ${d2}${dbl ? ' (dublă)' : ''}.`);

  if (p.jail) {
    G.next = 'end';
    G.phase = 'end';
    if (dbl) {
      p.jail = false;
      log('Dublă! Iese din Rahova pe ușa din spate.');
    } else if (++p.jailTurns >= 3) {
      log('A treia tură în Rahova: plătește șpaga și iese.');
      p.jail = false;
      pay(p, 50, null);
    } else {
      log('Rămâne în Rahova. Scrie la carte.');
      return;
    }
    if (!p.out) move(p, d1 + d2);
    return afterMove();
  }

  if (dbl && ++G.doubles === 3) {
    log('Trei duble la rând. Suspect.');
    fx({ t: 'news', tag: 'DNA', color: '#7a1717', m: `Trei duble la rând? Suspect. ${p.name} e ridicat de mascați.` });
    sendJail(p);
    G.phase = 'end';
    return;
  }
  G.next = dbl ? 'again' : 'end';
  G.phase = G.next;
  move(p, d1 + d2);
  afterMove();
}

function buy() {
  const p = cur(), sq = BOARD[p.pos];
  p.money -= sq.price;
  G.props[p.pos] = { owner: G.cur, houses: 0, mortgaged: false };
  log(`${p.name} cumpără ${sq.name} cu ${sq.price} lei.`);
  fx({ t: 'stamp', k: p.pos, i: G.cur });
  fxMoney(p);
  G.phase = G.next;
}

function skip() {
  log(`${cur().name} refuză. Rămâne la stat.`);
  G.phase = G.next;
}

function payBribe() {
  const p = cur();
  pay(p, 50, null);
  p.jail = false;
  p.jailTurns = 0;
  log(`${p.name} dă șpaga și iese din Rahova.`);
  G.phase = G.winner ? 'over' : p.out ? 'end' : 'roll';
}

function useCard() {
  const p = cur();
  p.getOut--;
  p.jail = false;
  p.jailTurns = 0;
  log(`${p.name} folosește cartea. Iese din Rahova, curat ca lacrima.`);
}

function endTurn() {
  if (G.winner) return;
  G.doubles = 0;
  G.turn++;
  do { G.cur = (G.cur + 1) % G.players.length; } while (G.players[G.cur].out);
  G.phase = 'roll';
  log(`Tura lui ${cur().name}`, 'turnline');
}

function canManage() {
  return G.phase !== 'buy' && G.phase !== 'over';
}

function canBuild(k) {
  const sq = BOARD[k], pr = G.props[k];
  if (!canManage() || sq.type !== 'street' || !pr || pr.owner !== G.cur) return false;
  if (!ownsGroup(G.cur, sq.group) || pr.houses >= 5) return false;
  const grp = groupOf(sq.group);
  if (grp.some(i => G.props[i].mortgaged)) return false;
  const min = Math.min(...grp.map(i => G.props[i].houses));
  return pr.houses === min && cur().money >= sq.house;
}

function build(k) {
  if (!canBuild(k)) return;
  const sq = BOARD[k];
  cur().money -= sq.house;
  G.props[k].houses++;
  log(`${cur().name} construiește ${G.props[k].houses === 5 ? 'o catedrală' : 'un paraclis'} pe ${sq.name}.`);
  fxMoney(cur());
}

function canMortgage(k) {
  const pr = G.props[k];
  if (!canManage() || !pr || pr.owner !== G.cur) return false;
  if (pr.mortgaged) return cur().money >= Math.ceil(BOARD[k].price * 0.55);
  return !groupHasHouses(k);
}

function toggleMortgage(k) {
  if (!canMortgage(k)) return;
  const pr = G.props[k], sq = BOARD[k], p = cur();
  if (pr.mortgaged) {
    const cost = Math.ceil(sq.price * 0.55);
    p.money -= cost;
    pr.mortgaged = false;
    log(`${p.name} răscumpără ${sq.name} cu ${cost} lei.`);
  } else {
    pr.mortgaged = true;
    p.money += sq.price / 2;
    log(`${p.name} ipotechează ${sq.name} pentru ${sq.price / 2} lei.`);
  }
  fxMoney(p);
}

// ======================= decisions of a Jev seat =======================
// decision() lists the options of the seat that must act now; choose(key) plays one of them.
// A human seat gets no decision: the page asks the human.
function decision() {
  if (G.phase === 'over') return null;
  if (G.debts.length) {
    const d = G.debts[0], debtor = G.players[d.i];
    return {
      kind: 'debt', seat: d.i, options: debtOptions(debtor),
      situation: { debt_left: -debtor.money, owed_to: d.to >= 0 ? G.players[d.to].name : 'the state' },
    };
  }
  const p = cur();
  if (!p.jev) return null;
  if (G.phase === 'buy') {
    const k = p.pos, sq = BOARD[k];
    return {
      kind: 'buy', seat: G.cur,
      options: {
        buy: { square: sq.name, price: sq.price, money_after: p.money - sq.price, rent_today: rentIfBought(k), ...groupFacts(k) },
        refuse: { money_after: p.money },
      },
    };
  }
  if ((G.phase === 'roll' || G.phase === 'again') && p.jail) {
    const options = { roll_for_double: { note: 'a double frees you; on the third turn you pay 50 lei and move' } };
    if (p.money >= 50) options.pay_bribe = { cost: 50, money_after: p.money - 50 };
    if (p.getOut > 0) options.use_card = { cards_after: p.getOut - 1 };
    const ahead = highestRentAhead(p);
    return {
      kind: 'jail', seat: G.cur, options,
      situation: { money: p.money, cards: p.getOut, jail_turn: p.jailTurns + 1, highest_rent_ahead: ahead.rent, highest_rent_owner: ahead.owner },
    };
  }
  if (G.phase === 'roll' || G.phase === 'again') return { kind: 'roll', seat: G.cur, options: { roll: {} } };
  if (G.phase === 'end') return { kind: 'manage', seat: G.cur, options: { ...manageOptions(p), end_turn: { money: p.money } } };
  return null;
}

const rentNow = k => (G.props[k].mortgaged ? 0 : rent(k));

// The rent of square k after `change` to its property record. The record is restored.
function rentAfter(k, change) {
  const pr = G.props[k], saved = { ...pr };
  change(pr);
  const r = rentNow(k);
  Object.assign(pr, saved);
  return r;
}

function manageOptions(p) {
  const options = {};
  for (const k of owned(p).sort((a, b) => a - b)) {
    const sq = BOARD[k], pr = G.props[k];
    if (canBuild(k)) {
      options[`build_${k}`] = { square: sq.name, cost: sq.house, money_after: p.money - sq.house, rent_before: rentNow(k), rent_after: rentAfter(k, r => { r.houses++; }) };
    }
    if (canMortgage(k) && !pr.mortgaged) {
      options[`mortgage_${k}`] = { square: sq.name, cash_in: sq.price / 2, money_after: p.money + sq.price / 2, rent_before: rentNow(k), rent_after: 0 };
    }
    if (canMortgage(k) && pr.mortgaged) {
      const cost = Math.ceil(sq.price * 0.55);
      options[`buyback_${k}`] = { square: sq.name, cost, money_after: p.money - cost, rent_before: 0, rent_after: rentAfter(k, r => { r.mortgaged = false; }) };
    }
  }
  return options;
}

// The highest rent among the 12 squares after the jail, where a roll from the jail can land.
function highestRentAhead(p) {
  let best = { rent: 0, owner: 'nobody' };
  for (let k = 11; k <= 22; k++) {
    const pr = G.props[k];
    if (!pr || pr.owner === idxOf(p) || pr.mortgaged || G.players[pr.owner].out) continue;
    const r = rent(k);
    if (r > best.rent) best = { rent: r, owner: G.players[pr.owner].name };
  }
  return best;
}

// The squares that count together for the rent: a colour group, all rails, or both utilities.
function setOf(k) {
  const sq = BOARD[k];
  return sq.group ? groupOf(sq.group) : BOARD.map((s, i) => (s.type === sq.type ? i : -1)).filter(i => i >= 0);
}

function rentIfBought(k) {
  G.props[k] = { owner: G.cur, houses: 0, mortgaged: false };
  const r = rent(k);
  delete G.props[k];
  return r;
}

// Who holds the set of square k, and what a buy of k does to the set.
function groupFacts(k) {
  const set = setOf(k);
  const owned = { 'for sale': 0 };
  G.players.forEach(q => { owned[q.name] = 0; });
  set.forEach(i => { const pr = G.props[i]; owned[pr ? G.players[pr.owner].name : 'for sale']++; });
  const others = set.filter(i => i !== k && G.props[i]).map(i => G.props[i].owner);
  const rivals = [...new Set(others)];
  const blocked = rivals.length === 1 && rivals[0] !== G.cur ? G.players[rivals[0]].name : 'nobody';
  return {
    group_squares_owned: owned,
    completes_your_group: set.every(i => i === k || (G.props[i] && G.props[i].owner === G.cur)),
    blocks_group_of: blocked,
  };
}

function choose(key) {
  if (G.debts.length) chooseInDebt(key);
  else if (key === 'buy') buy();
  else if (key === 'refuse') skip();
  else if (key === 'roll' || key === 'roll_for_double') roll();
  else if (key === 'pay_bribe') payBribe();
  else if (key === 'use_card') useCard();
  else if (key === 'end_turn') endTurn();
  else {
    const [act, k] = key.split('_');
    if (act === 'build') build(+k);
    else if (act === 'mortgage' || act === 'buyback') toggleMortgage(+k);
  }
}

// ======================= the Jev player =======================
// Each seat has a style, tied to its default name. A renamed seat keeps its style.
const STYLES = [
  'You are a greedy priest. You buy almost everything you land on and build chapels as soon as you can, even when cash runs low.',
  'You are a cautious local baron. You keep a cash cushion of about 300 lei, buy mostly to complete or block groups, and avoid debt.',
  'You are a patient abbess. You collect full groups, mortgage only in need, and build slowly but steadily on your best group.',
  'You are an opportunist councillor. You buy cheap squares, mortgage freely to fund builds on a full group, and leave jail fast.',
];

// The draw favors the top options of Jev; at 1 it would follow the probabilities exactly (as in chess).
const TEMPERATURE = 0.5;

function sampleKey(probabilities) {
  const weights = Object.entries(probabilities).map(([k, p]) => [k, Math.pow(p, 1 / TEMPERATURE)]);
  let r = Math.random() * weights.reduce((a, [, w]) => a + w, 0);
  for (const [k, w] of weights) if ((r -= w) <= 0) return k;
  return weights[weights.length - 1][0];
}

const ASK = {
  buy: 'You landed on a square that is for sale. Do you buy it?',
  jail: 'You are in jail (Rahova). How do you try to leave?',
  manage: 'Your move is over. Do you build, mortgage or buy back a square now, or end your turn? You will be asked again after each action.',
  debt: 'You owe more than you have. Pick what to sell or mortgage to pay the debt. If nothing is left, you go bankrupt.',
};

function optionText(key, o) {
  if (key === 'buy') return `Buy ${o.square} for ${o.price} lei.`;
  if (key === 'refuse') return 'Refuse: the square stays with the state.';
  if (key === 'roll_for_double') return 'Roll the dice and hope for a double.';
  if (key === 'pay_bribe') return 'Pay the bribe of 50 lei and leave jail now.';
  if (key === 'use_card') return 'Use your get-out-of-jail card.';
  if (key === 'end_turn') return 'End your turn.';
  const [act] = key.split('_');
  const verb = { build: 'Build a chapel on', mortgage: 'Mortgage', buyback: 'Buy back', sell: 'Sell a chapel on' }[act];
  return `${verb} ${o.square}.`;
}

// The state that Jev reads. Prompts are in English; square names stay in Romanian.
function jevState(d) {
  const me = G.players[d.seat];
  return {
    game: 'Mitropoly, a parody of Monopoly in Romania. Money is in lei. A chapel (paraclis) is a house; 5 chapels make a cathedral, a hotel.',
    you_are: me.name,
    your_style: STYLES[d.seat],
    turn: G.turn,
    players: G.players.map(q => ({
      name: q.name, money: q.money, square: BOARD[q.pos].name, in_jail: q.jail, bankrupt: q.out,
      property: owned(q).map(k => `${BOARD[k].name}${G.props[k].houses ? ` (${G.props[k].houses} chapels)` : ''}${G.props[k].mortgaged ? ' (mortgaged)' : ''}`),
    })),
    recent_log: G.log.slice(0, 10).map(e => e.m).reverse(),
    situation: d.situation || {},
    options: d.options,
  };
}

// Asks Jev for one decision. Returns the key that the draw picked, and the answer of Jev.
async function askJev(d) {
  const criteria = {};
  for (const [key, o] of Object.entries(d.options)) criteria[key] = `${optionText(key, o)} See \`options.${key}\`.`;
  const answers = await Jev.call({
    model: 'jev-latest',
    state: jevState(d),
    questions: { pick: { type: 'choice', instructions: `You play as \`you_are\`, in \`your_style\`. ${ASK[d.kind]}`, criteria } },
  });
  return { key: sampleKey(answers.pick.probabilities), answer: answers.pick };
}

// Plays the next decision of a Jev seat. One option: code takes it with no call. Returns null when
// a human must act or the game is over.
async function jevStep() {
  const d = decision();
  if (!d) return null;
  const keys = Object.keys(d.options);
  if (keys.length === 1) {
    choose(keys[0]);
    return { d, key: keys[0], answer: null };
  }
  const { key, answer } = await askJev(d);
  choose(key);
  return { d, key, answer };
}

function newGame(names, jev = []) {
  G = {
    players: names.map((name, i) => ({ name, color: PLAYER_COLORS[i], money: 1500, pos: 0, jail: false, jailTurns: 0, getOut: 0, out: false, jev: Boolean(jev[i]) })),
    props: {}, debts: [], cur: 0, turn: 1, phase: 'roll', next: 'end', doubles: 0, dice: [1, 1], winner: null,
    chance: shuffle(CHANCE), chest: shuffle(CHEST), log: [], fx: [],
  };
  log('Fiecare popă primește 1500 de lei din bugetul de stat.');
  log(`Tura lui ${cur().name}`, 'turnline');
}

// ======================= UI =======================
if (typeof window !== 'undefined') (() => {
  const $ = s => document.querySelector(s);
  const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  // A hidden tab pauses timers and frames, so skip the motion there instead of stalling the turn.
  const still = () => reduced.matches || document.hidden;
  const sleep = ms => (document.hidden ? Promise.resolve() : new Promise(r => setTimeout(r, ms)));
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) document.getAnimations().forEach(a => { if (a.effect.getTiming().iterations !== Infinity) a.finish(); });
  });
  let fast = false;
  try { fast = localStorage.getItem('mitropoly-fast') === '1'; } catch (e) { /* storage blocked */ }
  const T = ms => (fast ? ms * 0.35 : ms);

  const ICONS = {
    cross: '<path d="M12 3v18M9.5 5.5h5M7 9.5h10M9.5 17l5-1.8"/>',
    church: '<path d="M12 2v3M10.6 3.4h2.8M8.5 10.5C8.5 7.5 12 6 12 6s3.5 1.5 3.5 4.5M6 10.5h12V21H6zM10 21v-4a2 2 0 0 1 4 0v4"/>',
    car: '<path d="M3 16v-3l2.2-4.5h13.6L21 13v3H3zM6.5 16v2.5M17.5 16v2.5"/><circle cx="7.5" cy="13" r=".6"/><circle cx="16.5" cy="13" r=".6"/>',
    mail: '<rect x="3" y="6" width="18" height="12" rx="1.5"/><path d="M3.5 7l8.5 6 8.5-6"/>',
    sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2.5v3M12 18.5v3M2.5 12h3M18.5 12h3M5.3 5.3l2.1 2.1M16.6 16.6l2.1 2.1M5.3 18.7l2.1-2.1M16.6 7.4l2.1-2.1"/>',
    box: '<path d="M4 9h16v11H4zM6 9V6h12v3M9.5 13h5"/>',
    coin: '<ellipse cx="12" cy="7" rx="7" ry="3"/><path d="M5 7v5c0 1.7 3.1 3 7 3s7-1.3 7-3V7M5 12v5c0 1.7 3.1 3 7 3s7-1.3 7-3v-5"/>',
    phone: '<path d="M5 4h3.5l1.5 4.5-2.2 1.3a11 11 0 0 0 6.4 6.4l1.3-2.2L20 15.5V19a1 1 0 0 1-1 1A16 16 0 0 1 4 5a1 1 0 0 1 1-1z"/>',
    candle: '<path d="M12 3c1.6 1.9 1.6 3.2 0 4.6-1.6-1.4-1.6-2.7 0-4.6zM9.5 10h5v11h-5zM7 21h10"/>',
    arrow: '<path d="M20 12H5M11 6l-6 6 6 6"/>',
    key: '<circle cx="8" cy="12" r="3.5"/><path d="M11.5 12H21M18 12v3M15 12v2"/>',
    bars: '<path d="M4 4h16v16H4zM8.5 4v16M12 4v16M15.5 4v16"/>',
  };
  const icon = (n, cls = '') => `<svg class="i ${cls}" viewBox="0 0 24 24" aria-hidden="true">${ICONS[n]}</svg>`;
  const PIPS = { 1: [4], 2: [0, 8], 3: [0, 4, 8], 4: [0, 2, 6, 8], 5: [0, 2, 4, 6, 8], 6: [0, 2, 3, 5, 6, 8] };

  // D is what the screen shows. It lags G while the effects play.
  let D = null;
  let busy = false;
  let selected = null;
  const cells = [];
  const tokens = [];

  // ---------- board ----------
  function cellPos(i) {
    if (i <= 10) return [11, 11 - i];
    if (i <= 20) return [11 - (i - 10), 1];
    if (i <= 30) return [1, 1 + (i - 20)];
    return [1 + (i - 30), 11];
  }
  function side(i) {
    if (i % 10 === 0) return '';
    if (i < 10) return 'side-bottom';
    if (i < 20) return 'side-left';
    if (i < 30) return 'side-top';
    return 'side-right';
  }

  function buildBoard() {
    const board = $('#board');
    BOARD.forEach((sq, i) => {
      const [r, c] = cellPos(i);
      const el = document.createElement('div');
      el.className = `cell ${side(i)}${i % 10 === 0 ? ' corner' : ''}`;
      el.style.gridRow = r;
      el.style.gridColumn = c;
      el.dataset.k = i;
      el.setAttribute('role', 'button');
      el.setAttribute('aria-label', sq.name);
      const bar = sq.group ? `<div class="bar" style="background:${GROUP_COLORS[sq.group]}"></div>` : '';
      const ic = sq.icon ? `<span class="ic">${icon(sq.icon)}</span>` : '';
      const price = isProperty(sq) ? `<div class="pr">${sq.price} lei</div>` : '';
      el.innerHTML = `${bar}<div class="body"><div class="nm">${esc(sq.name)}</div>${ic}${price}</div>`;
      if (sq.type === 'jail') el.insertAdjacentHTML('beforeend', '<div class="bars"></div>');
      board.appendChild(el);
      cells.push(el);
    });
  }

  function renderCells() {
    BOARD.forEach((sq, i) => {
      const el = cells[i], pr = G.props[i];
      el.classList.toggle('owned', !!pr);
      el.classList.toggle('mort', !!(pr && pr.mortgaged));
      el.classList.toggle('sel', selected === i);
      el.style.setProperty('--own', pr ? G.players[pr.owner].color : 'transparent');
      const bar = el.querySelector('.bar');
      if (bar) {
        const h = pr ? pr.houses : 0;
        const want = h === 5 ? 'H' : String(h);
        if (bar.dataset.h !== want) {
          bar.dataset.h = want;
          bar.innerHTML = h === 5 ? icon('church', 'big') : icon('cross').repeat(h);
        }
      }
    });
  }

  // ---------- tokens ----------
  function spot(i, pi, jailed) {
    const el = cells[i];
    const w = el.offsetWidth, h = el.offsetHeight;
    let x = el.offsetLeft + w / 2, y = el.offsetTop + h / 2;
    const d = Math.min(w, h) * 0.2;
    const off = [[-1, -1], [1, -1], [-1, 1], [1, 1]][pi];
    if (i === 10) {
      // jailed tokens sit behind the bars (bottom right), visitors on the left edge
      if (jailed) { x = el.offsetLeft + w * 0.66; y = el.offsetTop + h * 0.68; }
      else { x = el.offsetLeft + w * 0.17; y = el.offsetTop + h * 0.62; }
      return [x + off[0] * d * 0.7, y + off[1] * d * 0.7];
    }
    return [x + off[0] * d, y + off[1] * d];
  }
  const tf = ([x, y], el, extra = '') => `translate(${x - el.offsetWidth / 2}px, ${y - el.offsetHeight / 2}px)${extra}`;

  function buildTokens() {
    $('#tokens').innerHTML = '';
    tokens.length = 0;
    G.players.forEach(p => {
      const t = document.createElement('div');
      t.className = 'token';
      t.style.setProperty('--c', p.color);
      t.innerHTML = '<span></span>';
      $('#tokens').appendChild(t);
      tokens.push(t);
    });
  }

  function placeTokens() {
    tokens.forEach((t, pi) => {
      const p = G.players[pi];
      t.hidden = p.out && !busy;
      t.style.transform = tf(spot(D.pos[pi], pi, D.jail[pi]), t);
      t.classList.toggle('active', pi === G.cur && !G.winner);
    });
  }

  async function hop(pi, path) {
    const t = tokens[pi];
    const per = still() ? 0 : T(Math.max(90, Math.min(190, 1500 / path.length)));
    for (const to of path) {
      const a = spot(D.pos[pi], pi, false), b = spot(to, pi, false);
      D.pos[pi] = to;
      if (!per) continue;
      const mid = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2 - t.offsetHeight * 0.9];
      t.style.transform = tf(b, t);
      await t.animate([
        { transform: tf(a, t) },
        { transform: tf(mid, t, ' scale(1.2)'), offset: 0.45 },
        { transform: tf(b, t) },
      ], { duration: per, easing: 'cubic-bezier(.33,.9,.5,1)' }).finished;
    }
    placeTokens();
  }

  async function toJail(pi) {
    const t = tokens[pi];
    const from = spot(D.pos[pi], pi, D.jail[pi]);
    D.pos[pi] = 10;
    D.jail[pi] = true;
    const to = spot(10, pi, true);
    const bars = cells[10].querySelector('.bars');
    bars.classList.remove('drop');
    void bars.offsetWidth;
    if (still()) { placeTokens(); return; }
    t.style.transform = tf(to, t);
    await t.animate([
      { transform: tf(from, t), opacity: 1 },
      { transform: tf(from, t, ' scale(0.2)'), opacity: 0, offset: 0.4 },
      { transform: tf(to, t, ' scale(0.2)'), opacity: 0, offset: 0.6 },
      { transform: tf(to, t), opacity: 1 },
    ], { duration: T(700), easing: 'ease-in-out' }).finished;
    bars.classList.add('drop');
    await sleep(T(500));
  }

  // ---------- dice ----------
  function showFace(el, n) {
    el.innerHTML = Array.from({ length: 9 }, (_, i) => `<i class="${PIPS[n].includes(i) ? 'on' : ''}"></i>`).join('');
  }
  async function rollDice(d) {
    const els = [$('#d0'), $('#d1')];
    if (!still()) {
      els.forEach(e => { e.classList.remove('land'); e.classList.add('rolling'); });
      const until = performance.now() + T(620);
      while (performance.now() < until) {
        els.forEach(e => showFace(e, 1 + Math.floor(Math.random() * 6)));
        await sleep(70);
      }
      els.forEach(e => e.classList.remove('rolling'));
    }
    els.forEach((e, i) => { showFace(e, d[i]); void e.offsetWidth; e.classList.add('land'); });
    D.dice = d;
    await sleep(T(300));
  }

  // ---------- news banner ----------
  // One line in the centre says what just happened. Cards and arrests take it over loudly.
  function news(tag, m, color) {
    const el = $('#news');
    el.style.setProperty('--tagc', color || 'var(--news)');
    el.querySelector('.tag').textContent = tag || '';
    el.querySelector('.txt').textContent = m;
    el.classList.toggle('loud', !!tag);
    el.classList.remove('show');
    void el.offsetWidth;
    el.classList.add('show');
  }

  // ---------- money ----------
  function countTo(pi, value) {
    const from = D.money[pi];
    const delta = value - from;
    D.money[pi] = value;
    if (!delta) return;
    const el = document.querySelector(`[data-money="${pi}"]`);
    if (!el) return;
    const dir = delta > 0 ? 'up' : 'down';
    const chip = document.createElement('span');
    chip.className = 'chip ' + dir;
    chip.textContent = (delta > 0 ? '+' : '−') + Math.abs(delta);
    el.parentElement.appendChild(chip);
    setTimeout(() => chip.remove(), 1200);
    el.classList.add(dir);
    if (still()) { el.textContent = value + ' lei'; el.classList.remove(dir); return; }
    const start = performance.now(), dur = T(550);
    const tick = now => {
      const k = Math.min(1, (now - start) / dur);
      const e = 1 - Math.pow(1 - k, 3);
      el.textContent = Math.round(from + delta * e) + ' lei';
      if (k < 1) requestAnimationFrame(tick);
      else setTimeout(() => el.classList.remove(dir), 400);
    };
    requestAnimationFrame(tick);
  }

  // ---------- effect playback ----------
  async function play(list) {
    let loud = false;
    for (const e of list) {
      if (e.t === 'say') {
        D.log.unshift(e);
        renderLog();
        if (!loud && e.cls !== 'turnline') news('', e.m);
      }
      else if (e.t === 'dice') await rollDice(e.d);
      else if (e.t === 'move') await hop(e.i, e.path);
      else if (e.t === 'jail') await toJail(e.i);
      else if (e.t === 'money') { countTo(e.i, e.value); await sleep(T(160)); }
      else if (e.t === 'news') { loud = true; news(e.tag, e.m, e.color); await sleep(T(e.hold ? 1500 : 1100)); }
      else if (e.t === 'stamp') {
        const st = document.createElement('div');
        st.className = 'stamp';
        st.textContent = 'VÂNDUT';
        cells[e.k].style.setProperty('--own', G.players[e.i].color);
        cells[e.k].appendChild(st);
        setTimeout(() => st.remove(), 1200);
        await sleep(T(350));
      }
    }
  }

  function syncDisplay() {
    D = {
      pos: G.players.map(p => p.pos), jail: G.players.map(p => p.jail), money: G.players.map(p => p.money),
      dice: G.dice.slice(), log: G.log.slice(),
    };
  }

  async function act(fn) {
    if (busy || !G) return;
    busy = true;
    G.fx = [];
    fn();
    const list = G.fx;
    G.fx = [];
    render();
    await play(list);
    await sleep(T(250));
    busy = false;
    syncDisplay();
    render();
    runJev();
  }

  // ---------- Jev seats ----------
  // Plays the decisions of the Jev seats one at a time, until a human must act or the game ends.
  // At the daily cap or after a failed call, the Jev seats stop: Jev keeps choosing, no code pick
  // replaces it.
  let jevRunning = false, jevStop = '', jevCapped = false;
  async function runJev() {
    if (jevRunning || jevStop || !G) return;
    jevRunning = true;
    try {
      for (let d = decision(); d && !busy && !jevStop; d = decision()) {
        const keys = Object.keys(d.options);
        let key = keys[0];
        if (keys.length > 1) {
          thinking = true;
          render();
          try {
            key = (await askJev(d)).key;
          } catch (e) {
            jevCapped = Boolean(e.dailyCap);
            jevStop = e.dailyCap ? 'Jev se odihnește până la 00:00 UTC.' : `Jev nu a răspuns (${e.message}).`;
          }
          thinking = false;
          if (jevStop) { news('Jev', jevStop); render(); break; }
        }
        jevRunning = false; // act() calls runJev() again when it ends
        await act(() => choose(key));
        return;
      }
    } finally {
      jevRunning = false;
    }
  }
  let thinking = false;

  // ---------- panels ----------
  function renderLog() {
    $('#log').innerHTML = D.log.slice(0, 60).map(e => `<li class="${e.cls || ''}">${esc(e.m)}</li>`).join('');
  }

  function renderTurn() {
    const p = cur();
    let st = 'Aruncă zarurile.';
    if (G.winner) st = 'Jocul s-a terminat.';
    else if (busy) st = 'Urmărește tabla.';
    else if (jevStop && decision()) st = jevStop;
    else if (decision()) st = thinking ? 'Jev se gândește…' : 'Joacă Jev.';
    else if (G.phase === 'buy') st = `Cumperi ${BOARD[p.pos].name}?`;
    else if (G.phase === 'again') st = 'Ai dat dublă. Mai arunci o dată.';
    else if (G.phase === 'end') st = 'Gata. Dă mai departe. Clic pe o proprietate ca să construiești.';
    else if (p.jail) st = 'Ești în Rahova. Încearcă o dublă sau dă șpaga.';
    const who = G.winner || p;
    const el = $('#who');
    const html = `<b><i style="--c:${who.color}"></i>${G.winner ? 'Patriarh: ' : ''}${esc(who.name)}</b><span>${st}</span>`;
    if (el.dataset.p !== String(G.cur)) {
      el.dataset.p = G.cur;
      el.classList.remove('change');
      void el.offsetWidth;
      el.classList.add('change');
    }
    el.innerHTML = html;
  }

  function renderActions() {
    const p = cur(), sq = BOARD[p.pos];
    const btn = (a, label, cls = 'primary', dis = false) =>
      `<button class="btn ${cls}" data-act="${a}"${dis || busy ? ' disabled' : ''}>${label}</button>`;
    const key = '<span class="kbd">Space</span>';
    let html;
    if (busy) html = '<button class="btn primary" disabled>Se întâmplă…</button>';
    else if (jevStop && decision()) html = btn('jevretry', 'Încearcă din nou cu Jev', 'primary', jevCapped);
    else if (decision()) html = `<button class="btn primary" disabled>${thinking ? 'Jev se gândește…' : 'Joacă Jev'}</button>`;
    else if (G.phase === 'over') html = btn('restart', 'Joc nou');
    else if (G.phase === 'buy') html = btn('buy', `Cumpără cu ${sq.price} lei${key}`) + btn('skip', 'Refuză', 'ghost');
    else if (G.phase === 'again') html = btn('roll', `Aruncă din nou${key}`);
    else if (G.phase === 'end') html = btn('end', `Termină tura${key}`);
    else if (p.jail) {
      html = btn('roll', `Încearcă o dublă${key}`) + btn('bribe', 'Dă șpaga (50)', 'ghost', p.money < 50) +
        (p.getOut ? btn('card', `${icon('key')} Folosește cartea`, 'ghost') : '');
    } else html = btn('roll', `Aruncă zarurile${key}`);
    $('#actions').innerHTML = html;
  }

  function renderPlayers() {
    $('#players').innerHTML = G.players.map((p, pi) => {
      const chips = owned(p).sort((a, b) => a - b).map(k => {
        const sq = BOARD[k], pr = G.props[k];
        const g = sq.group ? GROUP_COLORS[sq.group] : '#6b5a48';
        const mark = pr.houses === 5 ? 'C' : pr.houses || '';
        return `<button style="--g:${g}" class="${pr.mortgaged ? 'mort' : ''}" data-sel="${k}" title="${esc(sq.name)}${pr.mortgaged ? ' (ipotecat)' : ''}" aria-label="${esc(sq.name)}"><b>${mark}</b></button>`;
      }).join('');
      const st = [
        p.out ? 'caterisit' : '',
        !p.out && p.jail ? `${icon('bars')} Rahova` : '',
        p.getOut ? `${icon('key')}${p.getOut}` : '',
      ].filter(Boolean).join(' ');
      return `<div class="player${pi === G.cur && !G.winner ? ' active' : ''}${p.out ? ' out' : ''}" style="--c:${p.color}">
        <div class="top"><span class="dot"></span><span class="name">${esc(p.name)}</span>
        <span class="st">${st}</span><span class="money" data-money="${pi}">${D.money[pi]} lei</span></div>
        ${chips ? `<div class="deeds">${chips}</div>` : ''}</div>`;
    }).join('');
  }

  function deedHTML(k) {
    const sq = BOARD[k], pr = G.props[k];
    const owner = pr ? G.players[pr.owner] : null;
    let rows = '', head;
    if (sq.type === 'street') {
      const labels = ['Chirie', 'Cu 1 paraclis', 'Cu 2 paraclise', 'Cu 3 paraclise', 'Cu 4 paraclise', 'Cu catedrală'];
      const now = pr ? pr.houses : -1;
      rows = labels.map((l, n) => `<div class="row${n === now ? ' now' : ''}"><span>${l}</span><span>${sq.rent[n]}</span></div>`).join('') +
        `<div class="row"><span>Grup complet, fără clădiri</span><span>${sq.rent[0] * 2}</span></div>` +
        `<div class="row"><span>Un paraclis costă</span><span>${sq.house}</span></div>`;
      head = `<header style="--g:${GROUP_COLORS[sq.group]}"><small>${GROUP_NAMES[sq.group]}</small><b>${esc(sq.name)}</b></header>`;
    } else if (sq.type === 'rail') {
      rows = [1, 2, 3, 4].map(n => `<div class="row"><span>${n === 1 ? 'Cu 1 mașină' : `Cu ${n} mașini`}</span><span>${25 * 2 ** (n - 1)}</span></div>`).join('');
      head = `<header style="--g:#3b2a1d"><small>Parc auto</small><b>${esc(sq.name)}</b></header>`;
    } else if (sq.type === 'util') {
      rows = '<div class="row"><span>Cu o taxă</span><span>4 × zarul</span></div><div class="row"><span>Cu ambele taxe</span><span>10 × zarul</span></div>';
      head = `<header style="--g:#3b2a1d"><small>Taxe fără bon</small><b>${esc(sq.name)}</b></header>`;
    } else {
      const close = '<div class="tools"><button class="btn ghost" data-close>Închide</button></div>';
      return `<div class="deed"><header><small>Pătrat special</small><b>${esc(sq.name)}</b></header><div class="desc">${esc(sq.sub || '')}</div>${close}</div>`;
    }
    const price = `<div class="row"><span>Preț</span><span>${sq.price} lei</span></div>`;
    const who = owner
      ? `<div class="owner"><i style="--c:${owner.color}"></i>${esc(owner.name)}${pr.mortgaged ? ' · ipotecat' : ''}</div>`
      : '<div class="owner">De vânzare</div>';
    const close = G.phase === 'buy' ? '' : '<button class="btn ghost" data-close>Închide</button>';
    let tools = close ? `<div class="tools">${close}</div>` : '';
    if (pr && pr.owner === G.cur && canManage() && !busy && !decision()) {
      tools = '<div class="tools">' +
        (sq.type === 'street' ? `<button class="btn primary" data-act="build" data-k="${k}"${canBuild(k) ? '' : ' disabled'}>${icon('cross')} Paraclis (${sq.house})</button>` : '') +
        `<button class="btn ghost" data-act="mort" data-k="${k}"${canMortgage(k) ? '' : ' disabled'}>${pr.mortgaged ? `Răscumpără (${Math.ceil(sq.price * 0.55)})` : `Ipotechează (+${sq.price / 2})`}</button>` +
        close + '</div>';
    }
    return `<div class="deed${LIGHT_GROUPS.has(sq.group) ? ' light' : ''}">${head}<div class="rows">${price}${rows}</div>${who}${tools}</div>`;
  }

  let lastDeed = '';
  function renderDeed() {
    if (busy) return; // keep the old card until the token arrives
    const k = G.phase === 'buy' ? cur().pos : selected;
    const html = k === null ? '' : deedHTML(k);
    if (html !== lastDeed) { $('#deed').innerHTML = html; lastDeed = html; }
  }

  function render() {
    if (G.phase === 'buy') selected = null;
    renderCells();
    placeTokens();
    renderTurn();
    renderActions();
    renderPlayers();
    renderDeed();
    renderLog();
  }

  // ---------- events ----------
  const ACTIONS = {
    roll, buy, skip, end: endTurn, bribe: payBribe, card: useCard,
    build: k => build(k), mort: k => toggleMortgage(k),
  };
  const closesDeed = new Set(['roll', 'end']);

  document.addEventListener('click', e => {
    if (e.target.closest('[data-close]')) { selected = null; render(); return; }
    const b = e.target.closest('button[data-act]');
    if (b && !b.disabled) {
      if (b.dataset.act === 'restart') { $('#game').hidden = true; $('#setup').hidden = false; return; }
      if (b.dataset.act === 'jevretry') { jevStop = ''; render(); runJev(); return; }
      const k = +b.dataset.k;
      if (closesDeed.has(b.dataset.act)) selected = null;
      act(() => ACTIONS[b.dataset.act](k));
      return;
    }
    const s = e.target.closest('[data-sel], .cell');
    if (s && G && !busy && G.phase !== 'buy') {
      const k = +(s.dataset.sel ?? s.dataset.k);
      selected = selected === k ? null : k;
      render();
    }
  });

  document.addEventListener('keydown', e => {
    if (e.target.matches('input') || $('#game').hidden) return;
    if (e.code === 'Space' || e.code === 'Enter') {
      const b = $('#actions .btn.primary');
      if (b && !b.disabled) { e.preventDefault(); b.click(); }
    } else if (e.code === 'Escape' && selected !== null) { selected = null; render(); }
  });

  addEventListener('resize', () => { if (G && D) placeTokens(); });

  // ---------- setup ----------
  let count = 4;
  function renderNames() {
    const prev = Array.from(document.querySelectorAll('#names input[id^="n"]')).map(i => i.value);
    const prevJev = Array.from(document.querySelectorAll('#names input[id^="j"]')).map(i => i.checked);
    $('#names').innerHTML = DEFAULT_NAMES.slice(0, count).map((d, i) =>
      `<div class="field"><span class="dot" style="background:${PLAYER_COLORS[i]}"></span>` +
      `<input id="n${i}" value="${esc(prev[i] ?? d)}" maxlength="28" aria-label="Jucătorul ${i + 1}">` +
      `<label class="switch"><input type="checkbox" id="j${i}"${prevJev[i] ? ' checked' : ''}> Jev</label></div>`).join('');
    document.querySelectorAll('#count button').forEach(b => b.setAttribute('aria-checked', String(+b.dataset.n === count)));
  }
  $('#count').addEventListener('click', e => {
    const b = e.target.closest('button');
    if (b) { count = +b.dataset.n; renderNames(); }
  });

  $('#start').addEventListener('click', async () => {
    const names = Array.from({ length: count }, (_, i) => $('#n' + i).value.trim() || DEFAULT_NAMES[i]);
    newGame(names, Array.from({ length: count }, (_, i) => $('#j' + i).checked));
    jevStop = '';
    G.fx = [];
    selected = null;
    lastDeed = '';
    $('#setup').hidden = true;
    $('#game').hidden = false;
    buildTokens();
    D = null;
    syncDisplay();
    [$('#d0'), $('#d1')].forEach(e => showFace(e, 1));
    render();
    news('Ultima oră', 'Sinodul anunță: jocul începe. Statul plătește tot.');
    runJev();
  });

  const fastBox = $('#fast');
  fastBox.checked = fast;
  fastBox.addEventListener('change', () => {
    fast = fastBox.checked;
    try { localStorage.setItem('mitropoly-fast', fast ? '1' : '0'); } catch (e) { /* storage blocked */ }
  });

  buildBoard();
  renderNames();
  Jev.mount($('#semaphore'));
})();
