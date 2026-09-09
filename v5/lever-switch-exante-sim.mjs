// 이슈 #19 + #9: day31(2차 투자, 사이클 전환점) 시점에서 "지금은 intake보다 sales가
// 낫다"를 결정 당시 관측 가능한 신호만으로 미리 알 수 있는가.
// intake 신호는 이미 쓰던 wIcap(그날 입고capacity 때문에 못 받은 양) 그대로 쓴다.
// sales(ship) 신호는 FF.bottleneck의 "ship" 판정식(sold>=capS-eps && dem>sold+eps)을
// 그대로 재현해 그 초과분(dem-sold)을 합산한다 - 둘 다 매일 이미 기록되는 사실
// (wIcap/sold/capS/dem)만으로 계산되는, 결정 시점에 이미 관측 가능한 값이다.
// 정답(어느 쪽이 실제로 더 나은 한계가치를 냈는가)은 앞 실험과 같은 반사실 쌍차로 잰다.
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
const DECIDE_DAY = 31; // 사이클2 - 전환점
const SIGNAL_WINDOW = [21, 30]; // 결정 직전 10일

function dailyNetWorth() { return FF.ledger().cash + FF.sumAmt(FF.arOf()) - FF.sumAmt(FF.apOf()); }
function prepEngine() { FF.ENGINE.value.phase.storage = FF.ENGINE.value.phase.storage || { dir: 0, n: 0 }; }
function shipShortfall(d) { return (d.sold >= d.capS - FF.C.ui.eps && d.dem > d.sold + FF.C.ui.eps) ? (d.dem - d.sold) : 0; }

// 1단계 스크립트와 같은 방식으로 intake_cap 진단군(day10에 이미 intake 투자를 한 전제)을 고른다.
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

// day10엔 항상 intake 투자. day31에 lever(intake/sales/none)로 갈라 day90까지 더 손대지 않는다.
// day21~30 신호(wIcap 합, shipShortfall 합)도 같은 실행에서 같이 뽑는다(대조군 경로 = day31:none 실행).
function runPlan(seed, day31Lever) {
  FF.reset(seed);
  prepEngine();
  const nw = [];
  let sigCap = 0, sigShip = 0;
  for (let day = FF.run().day; day <= HORIZON; day++) {
    if (FF.isOver()) break;
    let cmd = FF.Cmd.wait();
    if (day === 10) cmd = FF.Cmd.buy('intake');
    if (day === 31 && day31Lever !== 'none') cmd = FF.Cmd.buy(day31Lever);
    FF.stepDay(cmd);
    const d = FF.today();
    if (day >= SIGNAL_WINDOW[0] && day <= SIGNAL_WINDOW[1]) { sigCap += d.wIcap; sigShip += shipShortfall(d); }
    nw.push(dailyNetWorth());
  }
  return { nw, sigCap, sigShip };
}

function avg(a) { return a.length ? a.reduce((x, y) => x + y, 0) / a.length : NaN; }

const rows = [];
for (const seed of seeds) {
  const base = runPlan(seed, 'none');
  const withIntake = runPlan(seed, 'intake');
  const withSales = runPlan(seed, 'sales');
  const len = Math.min(base.nw.length, withIntake.nw.length, withSales.nw.length);
  if (len < HORIZON) continue;
  const mvIntake = withIntake.nw[len - 1] - base.nw[len - 1];
  const mvSales = withSales.nw[len - 1] - base.nw[len - 1];
  rows.push({ seed, sigCap: base.sigCap, sigShip: base.sigShip, mvIntake, mvSales, actualBetter: mvIntake > mvSales ? 'intake' : 'sales' });
}
console.log(`완주 n=${rows.length}`);

const actualIntakeN = rows.filter(r => r.actualBetter === 'intake').length;
console.log(`실제로 intake가 더 나았던 seed 비율: ${(100 * actualIntakeN / rows.length).toFixed(1)}%`);

function accuracyOf(predictFn, name) {
  let correct = 0;
  for (const r of rows) if (predictFn(r) === r.actualBetter) correct++;
  console.log(`  ${name}: 정확도=${(100 * correct / rows.length).toFixed(1)}%`);
}
accuracyOf(() => 'intake', '항상 intake라고 예측(기저선)');
accuracyOf(() => 'sales', '항상 sales라고 예측(기저선)');
accuracyOf(r => r.sigCap > r.sigShip ? 'intake' : 'sales', 'wIcap vs shipShortfall 신호(제안)');

// 신호 크기와 실제 이득 차이(mvIntake-mvSales)의 상관도 본다.
function corr(xs, ys) {
  const mx = avg(xs), my = avg(ys); let num = 0, dx2 = 0, dy2 = 0;
  for (let i = 0; i < xs.length; i++) { const dx = xs[i] - mx, dy = ys[i] - my; num += dx * dy; dx2 += dx * dx; dy2 += dy * dy; }
  return num / Math.sqrt(dx2 * dy2);
}
const sigDiff = rows.map(r => r.sigCap - r.sigShip);
const mvDiff = rows.map(r => r.mvIntake - r.mvSales);
console.log(`corr(신호차 sigCap-sigShip, 실제이득차 mvIntake-mvSales) = ${corr(sigDiff, mvDiff).toFixed(3)}`);

FF.C.cost = ORIGINAL_COST; FF.C.step = ORIGINAL_STEP; FF.C.days = 30;
