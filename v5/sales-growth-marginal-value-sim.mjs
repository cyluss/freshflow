// 이슈 #19: intake-marginal-value-sim.mjs를 sales capacity에 그대로 미러링한다.
// ship_cap_sustained 진단군(day1~9 ship 우세 + day10~19 무투자로도 shipShortfall 지속,
// sales-growth-diagnosis-payback-sim.mjs와 동일 정의) 위에서, day10/31/52/73 네 시점을
// 투자 기회로 두고 각 시점의 "한계가치"를 같은 seed 쌍차로 잰다: 그 시점 이전은 항상
// 고정된 경로(이전 시점까지 전부 sales 투자)로 두고, 그 시점 하나만 sales/intake/none으로
// 갈라 day90까지 그 이후는 더 손대지 않는다.
//
// sales capacity는 원래 게임에 이미 있는 레버라 headless patch가 필요 없다
// (FF.Cmd.buy('sales'), FF.C.cost.sales=618, FF.C.step.sales=2 그대로).
// intake는 intake-marginal-value-sim.mjs와 동일하게 headless patch(cost=490, step=2)로
// 연다 - FF.C의 커밋된 기본값 자체는 바꾸지 않고, 실행 중에만 임시로 덮어쓰고 끝에 되돌린다.
import fs from 'fs';

const stub = 'var FF={},FV={};';
const DOMAIN = ['src-core.js','src-store.js','src-access.js','src-uistate.js','src-kernel.js','src-runner.js','src-record.js','src-engine.js','src-counter.js','src-fact.js','src-report-data.js'];
const src = stub + DOMAIN.map(f => fs.readFileSync(f, 'utf8')).join('\n') + '\nreturn FF;';
const FF = new Function(src)();

const N_SEEDS = Number(process.argv[2] || 12000);
const HORIZON = 90;
FF.C.days = HORIZON;
const ORIGINAL_COST = Object.assign({}, FF.C.cost);
const ORIGINAL_STEP = Object.assign({}, FF.C.step);
FF.C.cost = Object.assign({}, ORIGINAL_COST, { intake: 490 });
FF.C.step = Object.assign({}, ORIGINAL_STEP, { intake: 2 });

const EPS = 1;
const WINDOWS = [10, 31, 52, 73]; // 사이클 0,1,2,3의 투자일
const PERSIST_WINDOW = [10, 19];

function dailyNetWorth() { return FF.ledger().cash + FF.sumAmt(FF.arOf()) - FF.sumAmt(FF.apOf()); }
function prepEngine() { FF.ENGINE.value.phase.storage = FF.ENGINE.value.phase.storage || { dir: 0, n: 0 }; }
function shipShortfall(d) { return (d.sold >= d.capS - FF.C.ui.eps && d.dem > d.sold + FF.C.ui.eps) ? (d.dem - d.sold) : 0; }

// ship_cap_sustained 진단군: day1~9 shipShortfall 우세 + day10~19 무투자로도 유지.
const seeds = [];
for (let seed = 1; seed <= N_SEEDS; seed++) {
  FF.reset(seed);
  let sumCap = 0, sumStore = 0, sumCash = 0, sumShip = 0;
  for (let day = 1; day <= 9; day++) {
    if (FF.isOver()) break;
    FF.stepDay(FF.Cmd.wait());
    const d = FF.today();
    sumCap += d.wIcap; sumStore += d.wIstore; sumCash += d.wS; sumShip += shipShortfall(d);
  }
  const maxV = Math.max(sumCap, sumStore, sumCash, sumShip);
  if (maxV <= EPS || sumShip !== maxV) continue;
  let sumShip2 = 0;
  for (let day = PERSIST_WINDOW[0]; day <= PERSIST_WINDOW[1]; day++) {
    if (FF.isOver()) break;
    FF.stepDay(FF.Cmd.wait());
    sumShip2 += shipShortfall(FF.today());
  }
  if (sumShip2 > EPS) seeds.push(seed);
}
console.log(`ship_cap_sustained 진단군: ${seeds.length}/${N_SEEDS}`);

// plan[i]는 사이클 i(WINDOWS[i]일)의 선택: 'sales'|'intake'|'none'. i번째 이전은 항상 sales.
function runPlan(seed, plan) {
  FF.reset(seed);
  prepEngine();
  const nw = [];
  for (let day = FF.run().day; day <= HORIZON; day++) {
    if (FF.isOver()) break;
    const wi = WINDOWS.indexOf(day);
    let cmd = FF.Cmd.wait();
    if (wi !== -1 && plan[wi] !== 'none') cmd = FF.Cmd.buy(plan[wi]);
    FF.stepDay(cmd);
    nw.push(dailyNetWorth());
  }
  return nw;
}

function avg(a) { return a.length ? a.reduce((x, y) => x + y, 0) / a.length : NaN; }

// baseline: 사이클 k까지 전부 sales, 이후 전부 none.
function planUpTo(k, lastChoice) {
  return WINDOWS.map((_, i) => i < k ? 'sales' : (i === k ? lastChoice : 'none'));
}

for (let k = 0; k < WINDOWS.length; k++) {
  const planNone = planUpTo(k, 'none');
  const planSales = planUpTo(k, 'sales');
  const planIntake = planUpTo(k, 'intake');
  const diffSales = [], diffIntake = [];
  for (const seed of seeds) {
    const base = runPlan(seed, planNone);
    const withSales = runPlan(seed, planSales);
    const withIntake = runPlan(seed, planIntake);
    const len = Math.min(base.length, withSales.length, withIntake.length);
    if (len < HORIZON) continue;
    diffSales.push(withSales[len - 1] - base[len - 1]);
    diffIntake.push(withIntake[len - 1] - base[len - 1]);
  }
  console.log(`\n사이클 ${k + 1}(day${WINDOWS[k]} 투자, 이전 사이클은 전부 sales 고정, n=${diffSales.length}):`);
  console.log(`  sales  한계가치(day90): avg=${avg(diffSales).toFixed(0)} 양수비율=${(100 * diffSales.filter(v => v > 0).length / diffSales.length).toFixed(1)}%`);
  console.log(`  intake 한계가치(day90): avg=${avg(diffIntake).toFixed(0)} 양수비율=${(100 * diffIntake.filter(v => v > 0).length / diffIntake.length).toFixed(1)}%`);
  console.log(`  sales - intake: avg=${(avg(diffSales) - avg(diffIntake)).toFixed(0)} (양수면 이 시점엔 sales가 아직 낫다)`);
}

FF.C.cost = ORIGINAL_COST; FF.C.step = ORIGINAL_STEP; FF.C.days = 30;
