// 이슈 #24 5관문(연말, 마지막): "연말 평가는 365일 동안 서로 다른 경영을 한 기업을 의미
// 있게 구별하는가?" 최종 netWorth 순위 재탕으로는 부족하다 - #21에서 이미 확인된 네 성장
// 경로(baseline/physical=Intake만/relational=Stance만/combined, intake-stance-interaction
// -sim.mjs와 동일 정책)를 연말 시점에 다축 프로필로 비교해서 netWorth 하나로 안 보이는
// 차이가 있는지 본다.
import fs from 'fs';

const stub = 'var FF={},FV={};';
const DOMAIN = ['src-core.js','src-store.js','src-access.js','src-uistate.js','src-kernel.js','src-runner.js','src-record.js','src-engine.js','src-counter.js','src-fact.js','src-report-data.js'];
const src = stub + DOMAIN.map(f => fs.readFileSync(f, 'utf8')).join('\n') + '\nreturn FF;';
const FF = new Function(src)();

const N_SEEDS = Number(process.argv[2] || 1200);
const HORIZON = 365;
FF.C.days = HORIZON;
const ORIGINAL_COST = Object.assign({}, FF.C.cost);
const ORIGINAL_STEP = Object.assign({}, FF.C.step);
FF.C.cost = Object.assign({}, ORIGINAL_COST, { intake: 490 });
FF.C.step = Object.assign({}, ORIGINAL_STEP, { intake: 2 });

const EPS = 1, DIAG_WINDOW = 9, COOLDOWN = 60;
function avg(a) { return a.length ? a.reduce((x, y) => x + y, 0) / a.length : NaN; }
function dailyNetWorth() { return FF.ledger().cash + FF.sumAmt(FF.arOf()) - FF.sumAmt(FF.apOf()); }
function prepEngine() { FF.ENGINE.value.phase.storage = FF.ENGINE.value.phase.storage || { dir: 0, n: 0 }; }
function shipShortfall(d) { return (d.sold >= d.capS - FF.C.ui.eps && d.dem > d.sold + FF.C.ui.eps) ? (d.dem - d.sold) : 0; }
function diagnoseAt(day, hist) {
  let sumCap = 0, sumStore = 0, sumCash = 0, sumShip = 0;
  const from = Math.max(1, day - DIAG_WINDOW);
  for (const d of hist) { if (d.day < from || d.day >= day) continue; sumCap += d.wIcap; sumStore += d.wIstore; sumCash += d.wS; sumShip += shipShortfall(d); }
  const maxV = Math.max(sumCap, sumStore, sumCash, sumShip);
  if (maxV <= EPS) return 'none';
  if (sumCap === maxV) return 'intake_cap';
  return 'other';
}

function runSeed(seed, intakeOn, stanceOn) {
  FF.reset(seed);
  prepEngine();
  const hist = [];
  let lastIntakeBuy = -Infinity;
  let prevRel = FF.relOf().slice();
  let pendingStanceRaise = -1;
  let cumSold = 0, cumRevenue = 0, cumMissed = 0;
  for (let day = FF.run().day; day <= HORIZON; day++) {
    if (FF.isOver()) break;
    let cmd = FF.Cmd.wait();
    if (intakeOn && day >= 10) {
      const diag = diagnoseAt(day, hist);
      if (diag === 'intake_cap' && day - lastIntakeBuy >= COOLDOWN) { cmd = FF.Cmd.buy('intake'); lastIntakeBuy = day; }
    }
    if (cmd.type === 'wait' && stanceOn && pendingStanceRaise !== -1) {
      const stance = (FF.stanceOf() || FF.C.channels.map(() => FF.C.stance.start)).slice();
      if (stance[pendingStanceRaise] < 3) { stance[pendingStanceRaise]++; cmd = FF.Cmd.stance(stance); }
    }
    pendingStanceRaise = -1;
    FF.stepDay(cmd);
    if (stanceOn) {
      const curRel = FF.relOf();
      for (let i = 0; i < curRel.length; i++) if (curRel[i] < prevRel[i]) { pendingStanceRaise = i; break; }
      prevRel = curRel.slice();
    }
    const d = FF.today();
    hist.push(d);
    cumSold += d.sold; cumMissed += d.missed;
    for (let ci = 0; ci < d.revCh.length; ci++) cumRevenue += d.revCh[ci];
  }
  const caps = FF.capsOf();
  return {
    nw: dailyNetWorth(), cumSold, cumMissed,
    price: cumRevenue / Math.max(1, cumSold),
    rel: avg(FF.relOf()),
    capIntake: caps.intake, capSales: caps.sales,
    cash: FF.ledger().cash, ar: FF.sumAmt(FF.arOf()), ap: FF.sumAmt(FF.apOf()),
    bust: FF.isBust(),
  };
}

const POLICIES = [
  { key: 'baseline', intake: false, stance: false },
  { key: 'physical', intake: true, stance: false },
  { key: 'relational', intake: false, stance: true },
  { key: 'combined', intake: true, stance: true },
];

const results = {}; for (const p of POLICIES) results[p.key] = [];
let completed = 0;
for (let seed = 1; seed <= N_SEEDS; seed++) {
  const runs = {};
  let ok = true;
  for (const p of POLICIES) { runs[p.key] = runSeed(seed, p.intake, p.stance); if (runs[p.key].bust) ok = false; }
  if (!ok) continue;
  completed++;
  for (const p of POLICIES) results[p.key].push(runs[p.key]);
}
console.log(`완주(4정책 전부 무파산) n=${completed}/${N_SEEDS}`);

console.log(`\n[연말(day365) 다축 프로필 - 정책별 평균]`);
const FIELDS = ['nw', 'cumSold', 'price', 'rel', 'cumMissed', 'capIntake', 'capSales', 'cash', 'ar', 'ap'];
console.log('  ' + ['policy', ...FIELDS].join('\t'));
for (const p of POLICIES) {
  const rows = results[p.key];
  const line = [p.key, ...FIELDS.map(f => avg(rows.map(r => r[f])).toFixed(f === 'price' ? 1 : 0))];
  console.log('  ' + line.join('\t'));
}

// netWorth 순위와 다른 지표 순위가 일치하는지(=netWorth 하나로 다 설명되는지) 확인.
console.log(`\n[순위 비교: netWorth 순위 vs 각 지표 순위가 같은가]`);
const nwOrder = POLICIES.map(p => p.key).sort((a, b) => avg(results[b].map(r => r.nw)) - avg(results[a].map(r => r.nw)));
for (const f of ['cumSold', 'price', 'rel', 'cumMissed', 'capIntake']) {
  const order = POLICIES.map(p => p.key).sort((a, b) => avg(results[b].map(r => r[f])) - avg(results[a].map(r => r[f])));
  const same = JSON.stringify(order) === JSON.stringify(nwOrder);
  console.log(`  ${f}: 순위=[${order.join('>')}]  netWorth 순위와 동일=${same}`);
}

FF.C.cost = ORIGINAL_COST; FF.C.step = ORIGINAL_STEP; FF.C.days = 30;
