// 이슈 #20 3단계: 학습형 vs 예측형 vs 고정형 vs 무투자, 90일 누적 netWorth로 비교.
// intake_cap 진단군, 같은 seed, 투자 사이클은 day10/31/52/73(intake-marginal-value-sim.mjs와
// 동일한 4사이클 구조).
//
// - none: 절대 투자하지 않는다.
// - fixed: 매 사이클 항상 intake 재투자.
// - predictive: #19에서 이미 사전식별 실패로 확인된 신호(직전 10일 wIcap합 vs
//   shipShortfall합)로 매 사이클 intake/sales를 고른다.
// - learning: day10엔 intake로 시작(초기 탐색). 이후 각 사이클 결정 전, 직전 사이클
//   투자의 관측된 효과(2단계와 동일한 규칙: 투자 전 7일 vs 후 7일 자기 궤적 감소율 >=30%면
//   "효과 큼")를 보고 효과가 크면 같은 레버 재투자, 작으면 다른 레버로 전환한다.
//   *** 2단계에서 이 규칙(자기 궤적 전/후 비교)이 실제 인과효과와 역상관(corr=-0.82)이라는
//   것을 이미 확인했다 - 즉 이 신호는 신뢰할 수 없다. 그럼에도 issue #20이 예시로 제시한
//   규칙 그대로 구현해 실제 정책 성과가 어떻게 나오는지 정직하게 측정한다(귀속이 나빠도
//   정책이 우연히 나쁘지 않을 수도 있고, 반대로 체계적으로 나쁠 수도 있다 - 실측한다). ***
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
const SIG_LOOKBACK = 10; // predictive 신호창(직전 N일)
const OBS_W = 7; // learning 관측창(사이클 결정 전 7일 vs 후 7일)
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

function runPolicy(seed, policy) {
  FF.reset(seed);
  prepEngine();
  const wIcap = [], ship = [], nw = [];
  const chosen = {}; // WINDOWS 인덱스 -> lever
  for (let day = FF.run().day; day <= HORIZON; day++) {
    if (FF.isOver()) break;
    const wi = WINDOWS.indexOf(day);
    let cmd = FF.Cmd.wait();
    if (wi !== -1) {
      let lever = null;
      if (policy === 'none') lever = null;
      else if (policy === 'fixed') lever = 'intake';
      else if (policy === 'predictive') {
        const sigCap = sumRange(wIcap, day - SIG_LOOKBACK, day - 1);
        const sigShip = sumRange(ship, day - SIG_LOOKBACK, day - 1);
        lever = sigCap > sigShip ? 'intake' : 'sales';
      } else if (policy === 'learning') {
        if (wi === 0) lever = 'intake'; // 초기 탐색
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

const POLICIES = ['none', 'fixed', 'predictive', 'learning'];
const results = {};
for (const p of POLICIES) results[p] = [];
const leverLog = { predictive: {}, learning: {} };
for (const w of WINDOWS) { leverLog.predictive[w] = { intake: 0, sales: 0 }; leverLog.learning[w] = { intake: 0, sales: 0 }; }

let completeSeeds = 0;
const perSeedNw = {};
for (const seed of seeds) {
  const runs = {};
  let ok = true;
  for (const p of POLICIES) {
    runs[p] = runPolicy(seed, p);
    if (runs[p].bust || runs[p].nw.length < HORIZON) ok = false;
  }
  if (!ok) continue;
  completeSeeds++;
  for (const p of POLICIES) results[p].push(runs[p].nw[HORIZON - 1]);
  perSeedNw[seed] = runs;
  for (let wi = 0; wi < WINDOWS.length; wi++) {
    const w = WINDOWS[wi];
    if (runs.predictive.chosen[wi]) leverLog.predictive[w][runs.predictive.chosen[wi]]++;
    if (runs.learning.chosen[wi]) leverLog.learning[w][runs.learning.chosen[wi]]++;
  }
}
console.log(`완주(무bust, 4정책 전부) seed = ${completeSeeds}/${seeds.length}`);

console.log('\n사이클별 레버 선택 분포:');
for (const w of WINDOWS) {
  console.log(`  day${w}: predictive intake=${leverLog.predictive[w].intake} sales=${leverLog.predictive[w].sales}` +
    `  |  learning intake=${leverLog.learning[w].intake} sales=${leverLog.learning[w].sales}`);
}

console.log(`\n90일말 netWorth (n=${completeSeeds}):`);
for (const p of POLICIES) {
  console.log(`  ${p.padEnd(10)} avg=${avg(results[p]).toFixed(0)} median=${pctile(results[p], 0.5).toFixed(0)}`);
}

function pairDiff(a, b) {
  const diffs = [];
  for (let i = 0; i < results[a].length; i++) diffs.push(results[a][i] - results[b][i]);
  return diffs;
}
console.log('\n핵심 비교(같은 seed 쌍차, 양수=앞쪽이 더 나음):');
for (const [a, b] of [['learning', 'fixed'], ['learning', 'predictive'], ['learning', 'none'], ['fixed', 'none'], ['predictive', 'none']]) {
  const d = pairDiff(a, b);
  console.log(`  ${a} - ${b}: avg=${avg(d).toFixed(0)} median=${pctile(d, 0.5).toFixed(0)} 양수비율=${(100 * d.filter(v => v > 0).length / d.length).toFixed(1)}%`);
}

FF.C.cost = ORIGINAL_COST; FF.C.step = ORIGINAL_STEP; FF.C.days = 30;
