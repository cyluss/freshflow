// 이슈 #20 2단계: 귀속 가능성.
// 연구자(스크립트)는 반사실 쌍차(같은 seed 무투자 대조군)로 실제 인과효과를 알고 있다.
// "학습 정책"은 그 반사실을 절대 보지 않고, 오직 자기 세계의 투자 전/후 관측값
// (day10 투자 직전 7일 vs 직후 7일의 wIcap/shipShortfall)만으로 "효과가 있었다/없었다"를
// 추정해야 한다. 두 판정(관측 기반 추정 vs 반사실 기반 실제)의 일치도(정확도·상관)를 잰다.
//
// 두 레버 모두 시험한다: intake_cap 진단군에 intake(맞는 레버)를 투자한 경우와,
// 같은 진단군에 sales(틀린 레버)를 투자한 경우 - 후자에서 "효과 없음"으로 올바르게
// 판정되는지가 판별타당성이다(4단계 탐색비용 실험과도 연결된다).
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
const W = 7; // 투자 전/후 관측창
const THRESH = 0.3; // "효과 큼" 판정 임계치(%): 3단계 학습정책과 동일 규칙을 재사용

function avg(a) { return a.length ? a.reduce((x, y) => x + y, 0) / a.length : NaN; }
function shipShortfall(d) { return (d.sold >= d.capS - FF.C.ui.eps && d.dem > d.sold + FF.C.ui.eps) ? (d.dem - d.sold) : 0; }
function prepEngine() { FF.ENGINE.value.phase.storage = FF.ENGINE.value.phase.storage || { dir: 0, n: 0 }; }
function dailyNetWorth() { return FF.ledger().cash + FF.sumAmt(FF.arOf()) - FF.sumAmt(FF.apOf()); }

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

function runSeed(seed, lever) {
  FF.reset(seed);
  prepEngine();
  const wIcap = [], ship = [], nw = [];
  for (let day = FF.run().day; day <= 30; day++) {
    if (FF.isOver()) break;
    const cmd = (day === EXPAND_DAY && lever) ? FF.Cmd.buy(lever) : FF.Cmd.wait();
    FF.stepDay(cmd);
    const d = FF.today();
    wIcap.push(d.wIcap); ship.push(shipShortfall(d)); nw.push(dailyNetWorth());
  }
  return { wIcap, ship, nw, bust: FF.isBust() };
}
function sumRange(arr, fromDay, toDay) {
  let s = 0; for (let d = fromDay; d <= toDay && d <= arr.length; d++) s += arr[d - 1];
  return s;
}
function corr(xs, ys) {
  const mx = avg(xs), my = avg(ys); let num = 0, dx2 = 0, dy2 = 0;
  for (let i = 0; i < xs.length; i++) { const dx = xs[i] - mx, dy = ys[i] - my; num += dx * dy; dx2 += dx * dx; dy2 += dy * dy; }
  return num / Math.sqrt(dx2 * dy2);
}

function studyLever(lever, metricName) {
  console.log(`\n========== 투자 레버=${lever} (관측지표=${metricName}, 진단군 기준: ${lever === 'intake' ? '맞는 레버' : '틀린 레버'}) ==========`);
  const rows = [];
  for (const seed of seeds) {
    const ctrl = runSeed(seed, null);
    const inv = runSeed(seed, lever);
    const toDay = EXPAND_DAY + W;
    if (ctrl.wIcap.length < toDay || inv.wIcap.length < toDay || ctrl.bust || inv.bust) continue;
    const metricArr = (lever === 'intake') ? inv.wIcap : inv.ship;
    const preSum = sumRange(metricArr, EXPAND_DAY - W + 1, EXPAND_DAY); // 투자 직전 7일(자기 궤적, 대조군과 동일한 구간)
    const postSum = sumRange(metricArr, EXPAND_DAY + 1, toDay); // 투자 직후 7일(자기 궤적)
    const observedReduction = preSum > EPS ? (preSum - postSum) / preSum : 0; // 반사실 없이 계산 가능
    const observedBigEffect = observedReduction >= THRESH;

    // 연구자만 아는 실제 인과효과(같은 창, 대조군 대비 쌍차)
    const ctrlMetricArr = (lever === 'intake') ? ctrl.wIcap : ctrl.ship;
    const ctrlPostSum = sumRange(ctrlMetricArr, EXPAND_DAY + 1, toDay);
    const actualReduction = ctrlPostSum - postSum; // 양수면 투자가 실제로 마찰을 줄였다
    const nwDiff = inv.nw[toDay - 1] - ctrl.nw[toDay - 1];
    // 후보 신호 B: 사후 절대수준(추세 상쇄 없이 그냥 낮은가) - 반사실 없이도 계산 가능.
    const postLevel = postSum;
    // 후보 신호 C: 사전 7일 추세를 선형외삽해 사후 7일 예상치를 만들고, 실제와 비교한다
    // (반사실 대신 "내 과거 추세"를 기준선으로 쓴다 - 여전히 자기 궤적만 사용).
    const preFrom = EXPAND_DAY - W + 1;
    let sx = 0, sy = 0, sxx = 0, sxy = 0;
    for (let k = 0; k < W; k++) { const x = k, y = metricArr[preFrom - 1 + k]; sx += x; sy += y; sxx += x * x; sxy += x * y; }
    const slope = (W * sxy - sx * sy) / (W * sxx - sx * sx || 1);
    const intercept = (sy - slope * sx) / W;
    let predictedPostSum = 0;
    for (let k = 0; k < W; k++) predictedPostSum += intercept + slope * (W + k);
    const trendAdjReduction = predictedPostSum !== 0 ? (predictedPostSum - postSum) / Math.abs(predictedPostSum) : 0;
    rows.push({ seed, preSum, postSum, observedReduction, observedBigEffect, actualReduction, nwDiff, postLevel, trendAdjReduction });
  }
  console.log(`  완주 n=${rows.length}`);

  // 이진판정: "관측만으로 큰 효과"라고 본 것 vs "실제로 (대조군 대비) 마찰이 threshold 이상 줄었다"
  // actualReduction의 "큼" 기준도 같은 상대적 척도로: 대조군 사전창(=preSum, 처치 전이라 대조군과 동일) 대비 비율.
  let correct = 0;
  for (const r of rows) {
    const actualBig = r.preSum > EPS ? (r.actualReduction / r.preSum) >= THRESH : false;
    if (r.observedBigEffect === actualBig) correct++;
  }
  console.log(`  이진판정 정확도(관측만 vs 실제인과, threshold=${THRESH}) = ${(100 * correct / rows.length).toFixed(1)}%`);
  const alwaysBigAcc = 100 * rows.filter(r => (r.preSum > EPS ? (r.actualReduction / r.preSum) >= THRESH : false)).length / rows.length;
  console.log(`  기저선(항상 "효과 컸다"라고 판정): 실제로 그런 seed 비율 = ${alwaysBigAcc.toFixed(1)}%`);
  const alwaysSmallAcc = 100 - alwaysBigAcc;
  console.log(`  기저선(항상 "효과 작았다"라고 판정): 정확도 = ${alwaysSmallAcc.toFixed(1)}%`);

  const obs = rows.map(r => r.observedReduction);
  const act = rows.map(r => r.preSum > EPS ? r.actualReduction / r.preSum : 0);
  console.log(`  corr(관측 감소율, 실제인과 감소율) = ${corr(obs, act).toFixed(3)}`);
  const obsAbs = rows.map(r => r.preSum - r.postSum);
  const actAbs = rows.map(r => r.actualReduction);
  console.log(`  corr(관측 감소량, 실제인과 감소량, 절대값) = ${corr(obsAbs, actAbs).toFixed(3)}`);
  console.log(`  corr(관측 감소율, 실제 netWorth쌍차 day${EXPAND_DAY + W}) = ${corr(obs, rows.map(r => r.nwDiff)).toFixed(3)}`);
  console.log(`  평균: 관측감소율=${avg(obs).toFixed(3)} 실제인과감소율=${avg(act).toFixed(3)} netWorth쌍차=${avg(rows.map(r => r.nwDiff)).toFixed(0)}`);

  // 후보 신호 B/C 검증: 자기 궤적만으로 만든 다른 신호가 실제인과와 더 잘 맞는가.
  const postLevel = rows.map(r => -r.postLevel); // 낮을수록(마이너스가 클수록) "효과 컸다"와 같은 방향
  const trendAdj = rows.map(r => r.trendAdjReduction);
  console.log(`  [후보B] corr(-사후절대수준, 실제인과감소량) = ${corr(postLevel, actAbs).toFixed(3)}`);
  console.log(`  [후보C] corr(추세외삽 대비 개선율, 실제인과감소율) = ${corr(trendAdj, act).toFixed(3)}`);
  let correctB = 0, correctC = 0;
  for (const r of rows) {
    const actualBig = r.preSum > EPS ? (r.actualReduction / r.preSum) >= THRESH : false;
    const bBig = r.postLevel <= (avg(rows.map(x => x.postLevel))); // 중앙값 근사 대신 평균 이하를 "낮음"으로
    const cBig = r.trendAdjReduction >= THRESH;
    if (bBig === actualBig) correctB++;
    if (cBig === actualBig) correctC++;
  }
  console.log(`  [후보B] 이진판정 정확도(사후수준이 평균 이하 = 효과 큼) = ${(100 * correctB / rows.length).toFixed(1)}%`);
  console.log(`  [후보C] 이진판정 정확도(추세외삽 대비 ${THRESH * 100}%+ 개선 = 효과 큼) = ${(100 * correctC / rows.length).toFixed(1)}%`);
}

studyLever('intake', 'wIcap');
studyLever('sales', 'shipShortfall');

FF.C.cost = ORIGINAL_COST; FF.C.step = ORIGINAL_STEP;
