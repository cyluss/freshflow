// 이슈 #24 3관문(분기): 주/월과 질문이 다르다 - noise 제거가 아니라 "투자와 병목 이동을
// 평가하는 데 90일이라는 별도 시간해상도가 실제로 필요한가?"다. 분기를 살리는 실험이
// 아니라 30/60/90일 중 90일이 60일 대비 실질적 판별력을 더 주는지를 본다.
//
// intake-diagnosis-payback-sim.mjs와 동일한 단일 결정 분리 원칙을 쓴다: intake_cap
// 진단군에서 day10에 딱 한 번만 투자(이후 추가 투자 없음 - 순수하게 "이 한 번의 결정을
// 평가하는 시간창"만 격리해서 본다), 같은 seed 무투자 대조군과 day40/70/100(=투자+30/60/90일)
// 세 시점에서 쌍차를 비교한다.
//
// 두 가지를 본다:
//   1. 회수판정 안정성: day40 판정(양/음)이 day100(최종 참조) 판정과 다른 비율(성급한
//      30일 판정이 틀렸을 비율) vs day70 판정이 day100과 다른 비율(60일 판정의 오류율).
//      60일 오류율이 이미 낮으면 90일이 60일 대비 추가로 주는 정보가 적다는 뜻이다.
//   2. 병목이동 판정 안정성: 같은 방식으로 day40/70/100 시점의 진단(트레일링9일창)이
//      서로 얼마나 달라지는지 - day70→100 변화가 day40→70 변화보다 훨씬 적으면 60일에
//      이미 안정된 것이다.
import fs from 'fs';

const stub = 'var FF={},FV={};';
const DOMAIN = ['src-core.js','src-store.js','src-access.js','src-uistate.js','src-kernel.js','src-runner.js','src-record.js','src-engine.js','src-counter.js','src-fact.js','src-report-data.js'];
const src = stub + DOMAIN.map(f => fs.readFileSync(f, 'utf8')).join('\n') + '\nreturn FF;';
const FF = new Function(src)();

const N_SEEDS = Number(process.argv[2] || 2000);
const HORIZON = 130; // day10 투자 + 100일 관찰이면 넉넉히 130일까지
FF.C.days = HORIZON;
const ORIGINAL_COST = Object.assign({}, FF.C.cost);
const ORIGINAL_STEP = Object.assign({}, FF.C.step);
FF.C.cost = Object.assign({}, ORIGINAL_COST, { intake: 490 });
FF.C.step = Object.assign({}, ORIGINAL_STEP, { intake: 2 });

const EPS = 1;
const DIAG_WINDOW = 9;
const EXPAND_DAY = 10;
const CHECKPOINTS = [30, 60, 90]; // 투자 후 경과일
const CP_DAYS = CHECKPOINTS.map(c => EXPAND_DAY + c); // 절대 day

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
  if (sumShip === maxV) return 'ship_cap';
  if (sumStore === maxV) return 'storage';
  return 'cash';
}

// 진단군(day1-9, intake_cap 우세) - 기존과 동일한 방법.
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

const diffAtCP = [[], [], []]; // day40,70,100 각각의 쌍차
const diagAtCP = [[], [], []]; // 투자군 기준 각 시점 진단

function runSeed2(seed, invest) {
  FF.reset(seed);
  prepEngine();
  const hist = [];
  const nwSeries = [];
  for (let day = FF.run().day; day <= HORIZON; day++) {
    if (FF.isOver()) break;
    const cmd = (day === EXPAND_DAY && invest) ? FF.Cmd.buy('intake') : FF.Cmd.wait();
    FF.stepDay(cmd);
    hist.push(FF.today());
    nwSeries.push(dailyNetWorth());
  }
  return { hist, nwSeries, bust: FF.isBust() };
}

let completed = 0;
const finalDiffs = []; // day100 기준 최종 판정(참조)
for (const seed of seeds) {
  const ctrl = runSeed2(seed, false);
  const inv = runSeed2(seed, true);
  if (ctrl.bust || inv.bust) continue;
  if (ctrl.nwSeries.length < CP_DAYS[2] || inv.nwSeries.length < CP_DAYS[2]) continue;
  completed++;
  const diffs = CP_DAYS.map(day => inv.nwSeries[day - 1] - ctrl.nwSeries[day - 1]);
  for (let ci = 0; ci < 3; ci++) diffAtCP[ci].push(diffs[ci]);
  finalDiffs.push(diffs[2]);
  for (let ci = 0; ci < 3; ci++) diagAtCP[ci].push(diagnoseAt(CP_DAYS[ci], inv.hist));
}
console.log(`완주 n=${completed}`);

console.log(`\n[체크포인트별 쌍차]`);
for (let ci = 0; ci < 3; ci++) {
  console.log(`  day${CHECKPOINTS[ci]}: 평균=${avg(diffAtCP[ci]).toFixed(0)} 양수비율=${(100 * diffAtCP[ci].filter(v => v > 0).length / completed).toFixed(1)}%`);
}

// 회수판정 안정성: 각 체크포인트의 부호가 최종(day90=참조) 판정과 다른 비율.
console.log(`\n[회수판정 오류율(각 체크포인트 부호 vs day90 부호)]`);
for (let ci = 0; ci < 2; ci++) {
  let mismatches = 0;
  for (let i = 0; i < completed; i++) {
    const early = diffAtCP[ci][i] > 0;
    const ref = diffAtCP[2][i] > 0;
    if (early !== ref) mismatches++;
  }
  console.log(`  day${CHECKPOINTS[ci]} vs day90: 부호불일치 = ${(100 * mismatches / completed).toFixed(1)}%`);
}

// 병목이동 판정 안정성: day40→70 진단변화율 vs day70→100 진단변화율.
let change_40_70 = 0, change_70_100 = 0;
for (let i = 0; i < completed; i++) {
  if (diagAtCP[0][i] !== diagAtCP[1][i]) change_40_70++;
  if (diagAtCP[1][i] !== diagAtCP[2][i]) change_70_100++;
}
console.log(`\n[병목진단 변화율] day40→70 진단이 바뀐 비율=${(100 * change_40_70 / completed).toFixed(1)}%  day70→100 진단이 바뀐 비율=${(100 * change_70_100 / completed).toFixed(1)}%`);
console.log(`day70 진단 분포: ${JSON.stringify(diagAtCP[1].reduce((a, k) => (a[k] = (a[k] || 0) + 1, a), {}))}`);
console.log(`day100 진단 분포: ${JSON.stringify(diagAtCP[2].reduce((a, k) => (a[k] = (a[k] || 0) + 1, a), {}))}`);

FF.C.cost = ORIGINAL_COST; FF.C.step = ORIGINAL_STEP; FF.C.days = 30;
