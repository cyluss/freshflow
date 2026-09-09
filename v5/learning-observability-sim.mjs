// 이슈 #20 1단계: 투자 후 관측 가능성.
// intake_cap 진단군(day1~9 wIcap이 wIstore/wS보다 지배적인 seed - intake-diagnosis-payback-sim.mjs와
// 동일한 진단)에서 day10에 intake(+2) 또는 sales(+2) 소액투자를 한 뒤, 3/7/14일 관측창에서
// 플레이어가 실제로 볼 수 있는 값(실제 입고량 acc, 실제 판매량 sold, missed demand,
// utilization=acc/capI·sold/capS, DIO, cash, 관계 rel)을 무투자 대조군과 쌍차로 비교한다.
// 여기서 대조군 비교는 "연구자가 검증하려는 것" - 좋은 투자와 나쁜 투자가 관측 궤적에서
// 서로 다르게 보이는지 확인하는 게 목적이지, 학습 정책이 대조군을 보는 게 아니다(그건 2단계).
import fs from 'fs';

const stub = 'var FF={},FV={};';
const DOMAIN = ['src-core.js','src-store.js','src-access.js','src-uistate.js','src-kernel.js','src-runner.js','src-record.js','src-engine.js','src-counter.js','src-fact.js','src-report-data.js'];
const src = stub + DOMAIN.map(f => fs.readFileSync(f, 'utf8')).join('\n') + '\nreturn FF;';
const FF = new Function(src)();

const N_SEEDS = Number(process.argv[2] || 1500);
const ORIGINAL_COST = Object.assign({}, FF.C.cost);
const ORIGINAL_STEP = Object.assign({}, FF.C.step);
FF.C.cost = Object.assign({}, ORIGINAL_COST, { intake: 490 });
FF.C.step = Object.assign({}, ORIGINAL_STEP, { intake: 2 });

const EPS = 1;
const EXPAND_DAY = 10;
const WINDOWS = [3, 7, 14];
const TTL = FF.C.ttl;

function avg(a) { return a.length ? a.reduce((x, y) => x + y, 0) / a.length : NaN; }
function shipShortfall(d) { return (d.sold >= d.capS - FF.C.ui.eps && d.dem > d.sold + FF.C.ui.eps) ? (d.dem - d.sold) : 0; }
function prepEngine() { FF.ENGINE.value.phase.storage = FF.ENGINE.value.phase.storage || { dir: 0, n: 0 }; }

// intake_cap 진단군 (day1~9 wIcap 지배)
const seeds = [];
for (let seed = 1; seed <= N_SEEDS; seed++) {
  FF.reset(seed);
  let sumCap = 0, sumStore = 0, sumCash = 0, sumWI = 0;
  for (let day = 1; day <= 9; day++) {
    if (FF.isOver()) break;
    FF.stepDay(FF.Cmd.wait());
    const d = FF.today();
    sumCap += d.wIcap; sumStore += d.wIstore; sumCash += d.wS; sumWI += d.wI;
  }
  if (sumWI <= EPS) continue;
  const maxV = Math.max(sumCap, sumStore, sumCash);
  if (maxV > EPS && sumCap === maxV) seeds.push(seed);
}
console.log(`intake_cap 진단군: ${seeds.length}/${N_SEEDS}`);

function rollingWeightedAge(hist, endIdx, window) {
  const from = Math.max(0, endIdx - window + 1);
  let sw = 0, su = 0;
  for (let i = from; i <= endIdx; i++) {
    const day = hist[i];
    if (!day) continue;
    (day.ageMix || []).forEach(({ a, q }) => { sw += a * q; su += q; });
    sw += TTL * day.wT; su += day.wT;
  }
  return su > 0 ? sw / su : 0;
}

function runSeed(seed, lever) {
  FF.reset(seed);
  prepEngine();
  const hist = [];
  const cash = [], rel = [];
  for (let day = FF.run().day; day <= 30; day++) {
    if (FF.isOver()) break;
    const cmd = (day === EXPAND_DAY && lever) ? FF.Cmd.buy(lever) : FF.Cmd.wait();
    FF.stepDay(cmd);
    const d = FF.today();
    hist.push(d);
    cash.push(FF.ledger().cash);
    const r = FF.relOf(); rel.push(avg(r));
  }
  return { hist, cash, rel, bust: FF.isBust() };
}

function windowStats(run, fromDay, toDay) {
  // fromDay/toDay는 1-based day 번호, hist[i]는 day i+1의 기록.
  const fromIdx = fromDay - 1, toIdx = Math.min(toDay - 1, run.hist.length - 1);
  let acc = 0, sold = 0, missed = 0, dem = 0, utilI = [], utilS = 0;
  for (let i = fromIdx; i <= toIdx; i++) {
    const d = run.hist[i];
    acc += d.acc; sold += d.sold; missed += d.missed; dem += d.dem;
    utilI.push(d.capI > 0 ? d.acc / d.capI : 0);
    utilS += d.capS > 0 ? d.sold / d.capS : 0;
  }
  const n = toIdx - fromIdx + 1;
  const dio = rollingWeightedAge(run.hist, toIdx, n);
  return {
    acc, sold, missed, dem,
    utilI: avg(utilI), utilS: utilS / n,
    dio,
    cash: run.cash[toIdx],
    rel: run.rel[toIdx],
  };
}

const METRICS = ['acc', 'sold', 'missed', 'utilI', 'utilS', 'dio', 'cash', 'rel'];

for (const w of WINDOWS) {
  const toDay = EXPAND_DAY + w;
  const diffIntake = Object.fromEntries(METRICS.map(m => [m, []]));
  const diffSales = Object.fromEntries(METRICS.map(m => [m, []]));
  let n = 0;
  for (const seed of seeds) {
    const ctrl = runSeed(seed, null);
    const inv = runSeed(seed, 'intake');
    const sal = runSeed(seed, 'sales');
    if (ctrl.hist.length < toDay || inv.hist.length < toDay || sal.hist.length < toDay) continue;
    if (ctrl.bust || inv.bust || sal.bust) continue;
    n++;
    const c = windowStats(ctrl, EXPAND_DAY + 1, toDay);
    const i = windowStats(inv, EXPAND_DAY + 1, toDay);
    const s = windowStats(sal, EXPAND_DAY + 1, toDay);
    for (const m of METRICS) { diffIntake[m].push(i[m] - c[m]); diffSales[m].push(s[m] - c[m]); }
  }
  console.log(`\n========== 관측창 ${w}일(day${EXPAND_DAY + 1}~${toDay}), n=${n} ==========`);
  for (const m of METRICS) {
    const di = avg(diffIntake[m]), ds = avg(diffSales[m]);
    console.log(`  ${m.padEnd(6)} intake쌍차=${di.toFixed(3)}  sales쌍차=${ds.toFixed(3)}  차이(intake-sales)=${(di - ds).toFixed(3)}`);
  }
  // 궤적 판별력: 이 창에서 intake 투자가 acc(실제 입고)를 sales 투자보다 더 늘렸는가(기대되는 방향)
  const accWins = diffIntake.acc.filter((v, idx) => v > diffSales.acc[idx]).length;
  const soldWins = diffSales.sold.filter((v, idx) => v > diffIntake.sold[idx]).length;
  console.log(`  판별: intake쌍차(acc) > sales쌍차(acc) 인 seed 비율 = ${(100 * accWins / n).toFixed(1)}%`);
  console.log(`  판별: sales쌍차(sold) > intake쌍차(sold) 인 seed 비율 = ${(100 * soldWins / n).toFixed(1)}%`);
}

FF.C.cost = ORIGINAL_COST; FF.C.step = ORIGINAL_STEP;
