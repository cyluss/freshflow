// 이슈 #20 4단계: 탐색비용. "잘못된 +2 투자 한 번의 손실을 이후 학습으로 회수할 수 있는가?"
// intake_cap 진단군(day10에 sales는 이미 병목이 아닌 집단)에서 일부러 day10에 틀린
// 선택(sales)을 강제한 뒤, day31/52/73은 3단계와 동일한 learning 규칙(직전 사이클 투자의
// 관측된 7일 전/후 감소율 >=30%면 재투자, 아니면 전환)으로 자본을 재배분한다.
//
// 비교 4군(같은 seed):
//  - fixed_right : day10부터 항상 intake(3단계의 'fixed'와 동일 - "처음부터 옳았다면")
//  - wrong_then_learn : day10 강제로 sales(오판), day31/52/73은 learning 규칙
//  - wrong_only : day10 강제로 sales(오판), 이후 재투자 없음(학습 없이 방치)
//  - none : 전혀 투자하지 않음(참조 기준선)
//
// exploration_cost(seed) = fixed_right - wrong_then_learn (처음부터 옳았을 때 대비 손실)
// learning_gain(seed)    = wrong_then_learn - wrong_only   (오판 후에도 학습을 계속한 가치)
// 성공 기준: exploration_cost < learning_gain 인 seed 비율(목표 50%+).
import fs from 'fs';

const stub = 'var FF={},FV={};';
const DOMAIN = ['src-core.js','src-store.js','src-access.js','src-uistate.js','src-kernel.js','src-runner.js','src-record.js','src-engine.js','src-counter.js','src-fact.js','src-report-data.js'];
const src = stub + DOMAIN.map(f => fs.readFileSync(f, 'utf8')).join('\n') + '\nreturn FF;';
const FF = new Function(src)();

const N_SEEDS = Number(process.argv[2] || 1500);
const HORIZON = 90;
FF.C.days = HORIZON;
const ORIGINAL_COST = Object.assign({}, FF.C.cost);
const ORIGINAL_STEP = Object.assign({}, FF.C.step);
FF.C.cost = Object.assign({}, ORIGINAL_COST, { intake: 490 });
FF.C.step = Object.assign({}, ORIGINAL_STEP, { intake: 2 });

const EPS = 1;
const WINDOWS = [10, 31, 52, 73];
const OBS_W = 7;
const THRESH = 0.3;

function avg(a) { return a.length ? a.reduce((x, y) => x + y, 0) / a.length : NaN; }
function pctile(a, p) { if (!a.length) return NaN; const s = [...a].sort((x, y) => x - y); return s[Math.min(s.length - 1, Math.floor(s.length * p))]; }
function shipShortfall(d) { return (d.sold >= d.capS - FF.C.ui.eps && d.dem > d.sold + FF.C.ui.eps) ? (d.dem - d.sold) : 0; }
function prepEngine() { FF.ENGINE.value.phase.storage = FF.ENGINE.value.phase.storage || { dir: 0, n: 0 }; }
function dailyNetWorth() { return FF.ledger().cash + FF.sumAmt(FF.arOf()) - FF.sumAmt(FF.apOf()); }
function sumRange(arr, fromDay, toDay) { let s = 0; for (let d = fromDay; d <= toDay && d <= arr.length && d >= 1; d++) s += arr[d - 1]; return s; }

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

// policy: 'fixed_right' | 'wrong_then_learn' | 'wrong_only' | 'none'
function runPolicy(seed, policy) {
  FF.reset(seed);
  prepEngine();
  const wIcap = [], ship = [], nw = [];
  const chosen = {};
  for (let day = FF.run().day; day <= HORIZON; day++) {
    if (FF.isOver()) break;
    const wi = WINDOWS.indexOf(day);
    let cmd = FF.Cmd.wait();
    if (wi !== -1) {
      let lever = null;
      if (policy === 'none') lever = null;
      else if (policy === 'fixed_right') lever = 'intake';
      else if (policy === 'wrong_only') lever = (wi === 0) ? 'sales' : null;
      else if (policy === 'wrong_then_learn') {
        if (wi === 0) lever = 'sales'; // 강제 오판: 이미 충분한 sales에 또 투자
        else {
          const prevDay = WINDOWS[wi - 1];
          const lastLever = chosen[wi - 1];
          const metricArr = lastLever === 'intake' ? wIcap : ship;
          const pre = sumRange(metricArr, prevDay - OBS_W + 1, prevDay);
          const post = sumRange(metricArr, prevDay + 1, prevDay + OBS_W);
          const ratio = pre > EPS ? (pre - post) / pre : 0;
          lever = (ratio >= THRESH) ? lastLever : (lastLever === 'intake' ? 'sales' : 'intake');
        }
      }
      chosen[wi] = lever;
      if (lever) cmd = FF.Cmd.buy(lever);
    }
    FF.stepDay(cmd);
    const d = FF.today();
    wIcap.push(d.wIcap); ship.push(shipShortfall(d)); nw.push(dailyNetWorth());
  }
  return { nw, chosen, bust: FF.isBust() };
}

const POLICIES = ['none', 'fixed_right', 'wrong_then_learn', 'wrong_only'];
const results = {}; for (const p of POLICIES) results[p] = [];
const leverLog = {}; for (const w of WINDOWS) leverLog[w] = { intake: 0, sales: 0 };

let completeSeeds = 0;
for (const seed of seeds) {
  const runs = {};
  let ok = true;
  for (const p of POLICIES) { runs[p] = runPolicy(seed, p); if (runs[p].bust || runs[p].nw.length < HORIZON) ok = false; }
  if (!ok) continue;
  completeSeeds++;
  for (const p of POLICIES) results[p].push(runs[p].nw[HORIZON - 1]);
  for (let wi = 0; wi < WINDOWS.length; wi++) {
    const lv = runs.wrong_then_learn.chosen[wi];
    if (lv) leverLog[WINDOWS[wi]][lv]++;
  }
}
console.log(`완주(무bust, 4정책 전부) seed = ${completeSeeds}/${seeds.length}`);

console.log('\nwrong_then_learn 사이클별 레버 선택 분포:');
for (const w of WINDOWS) console.log(`  day${w}: intake=${leverLog[w].intake} sales=${leverLog[w].sales}`);

console.log(`\n90일말 netWorth (n=${completeSeeds}):`);
for (const p of POLICIES) console.log(`  ${p.padEnd(18)} avg=${avg(results[p]).toFixed(0)} median=${pctile(results[p], 0.5).toFixed(0)}`);

const explorationCost = [], learningGain = [];
for (let i = 0; i < completeSeeds; i++) {
  explorationCost.push(results.fixed_right[i] - results.wrong_then_learn[i]);
  learningGain.push(results.wrong_then_learn[i] - results.wrong_only[i]);
}
console.log(`\nexploration_cost(fixed_right - wrong_then_learn): avg=${avg(explorationCost).toFixed(0)} median=${pctile(explorationCost, 0.5).toFixed(0)}`);
console.log(`learning_gain(wrong_then_learn - wrong_only): avg=${avg(learningGain).toFixed(0)} median=${pctile(learningGain, 0.5).toFixed(0)}`);

let recovered = 0;
for (let i = 0; i < completeSeeds; i++) if (explorationCost[i] < learningGain[i]) recovered++;
console.log(`\nexploration_cost < learning_gain 인 seed 비율 = ${(100 * recovered / completeSeeds).toFixed(1)}% (목표: 50%+)`);

let beatsNone = 0, beatsWrongOnly = 0, fullyRecovered = 0;
for (let i = 0; i < completeSeeds; i++) {
  if (results.wrong_then_learn[i] > results.none[i]) beatsNone++;
  if (results.wrong_then_learn[i] > results.wrong_only[i]) beatsWrongOnly++;
  if (results.wrong_then_learn[i] >= results.fixed_right[i]) fullyRecovered++;
}
console.log(`wrong_then_learn > none 인 seed 비율 = ${(100 * beatsNone / completeSeeds).toFixed(1)}%`);
console.log(`wrong_then_learn > wrong_only 인 seed 비율 = ${(100 * beatsWrongOnly / completeSeeds).toFixed(1)}%`);
console.log(`wrong_then_learn이 fixed_right를 완전히 따라잡거나 능가한 seed 비율 = ${(100 * fullyRecovered / completeSeeds).toFixed(1)}%`);

FF.C.cost = ORIGINAL_COST; FF.C.step = ORIGINAL_STEP; FF.C.days = 30;
