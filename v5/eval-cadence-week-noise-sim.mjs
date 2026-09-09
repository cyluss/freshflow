// 이슈 #24 1관문: "주간 집계가 일별 noise를 줄이는가?" 새 관측치를 만들지 않는다 - 이미
// 확정된 fact(wIcap/wIstore/wS/shipShortfall/missed)를 #21의 최종 5레버 reference
// trajectory 위에서 일 단위 그대로 볼 때와 7일 합으로 볼 때 어느 쪽이 "지금 문제가 있다/
// 없다"를 안정적으로 구별하는지 비교한다.
//
// noise 지표: 하루 단위로 "오늘 이 지표가 임계치를 넘었는가"를 이진판정하고, 그 판정이
// 전날과 얼마나 자주 뒤집히는지(flip rate)를 잰다. flip이 잦으면 하루 단위 판정은 노이즈에
// 취약하다는 뜻이다. 주간 합으로 같은 이진판정을 다시 하고 flip rate를 비교한다.
// 임계치는 노출률을 맞추기 위해 튜닝하지 않는다 - 각 지표가 0보다 큰가(발생 여부)라는
// 가장 단순하고 임의성 없는 기준을 쓴다.
import fs from 'fs';

const stub = 'var FF={},FV={};';
const DOMAIN = ['src-core.js','src-store.js','src-access.js','src-uistate.js','src-kernel.js','src-runner.js','src-record.js','src-engine.js','src-counter.js','src-fact.js','src-report-data.js'];
const src = stub + DOMAIN.map(f => fs.readFileSync(f, 'utf8')).join('\n') + '\nreturn FF;';
const FF = new Function(src)();

const N_SEEDS = Number(process.argv[2] || 500);
const HORIZON = 365;
FF.C.days = HORIZON;
const ORIGINAL_COST = Object.assign({}, FF.C.cost);
const ORIGINAL_STEP = Object.assign({}, FF.C.step);
FF.C.cost = Object.assign({}, ORIGINAL_COST, { intake: 490 });
FF.C.step = Object.assign({}, ORIGINAL_STEP, { intake: 2 });

const EPS = 1, DIAG_WINDOW = 9, COOLDOWN = 60, SIG_WINDOW = 14, TH_SHORTFALL_RATIO = 0.10;
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
function shortfallRatioAt(day, hist) {
  const from = Math.max(1, day - SIG_WINDOW); let shortfall = 0, capSsum = 0;
  for (const d of hist) { if (d.day < from || d.day >= day) continue; shortfall += shipShortfall(d); capSsum += d.capS; }
  return capSsum > 0 ? shortfall / capSsum : 0;
}
function prepEngine() { FF.ENGINE.value.phase.storage = FF.ENGINE.value.phase.storage || { dir: 0, n: 0 }; }
function avg(a) { return a.length ? a.reduce((x, y) => x + y, 0) / a.length : NaN; }

function runSeed(seed) {
  FF.reset(seed); prepEngine();
  const hist = [];
  let lastIntakeBuy = -Infinity, lastSalesBuy = -Infinity;
  let prevRel = FF.relOf().slice(); let pendingStanceRaise = -1;
  for (let day = FF.run().day; day <= HORIZON; day++) {
    if (FF.isOver()) break;
    let cmd = FF.Cmd.wait();
    if (day === 1) {
      const opts = FF.C.contract.options; const mid = opts[Math.floor(opts.length / 2)];
      const opt = FF.contractOption(mid.x);
      if (opt && FF.ledger().cash >= opt.price) cmd = FF.Cmd.contract(mid.x);
    } else {
      const diag = day >= 10 ? diagnoseAt(day, hist) : 'none';
      const sfRatio = shortfallRatioAt(day, hist);
      if (diag === 'intake_cap' && day - lastIntakeBuy >= COOLDOWN) { cmd = FF.Cmd.buy('intake'); lastIntakeBuy = day; }
      else if (sfRatio > TH_SHORTFALL_RATIO && day - lastSalesBuy >= COOLDOWN) { cmd = FF.Cmd.buy('sales'); lastSalesBuy = day; }
      else {
        const fp = FF.factorPlan();
        if (fp.eligible && fp.suggested > EPS) cmd = FF.Cmd.factor(fp.suggested);
        else if (pendingStanceRaise !== -1) {
          const stance = (FF.stanceOf() || FF.C.channels.map(() => FF.C.stance.start)).slice();
          if (stance[pendingStanceRaise] < 3) { stance[pendingStanceRaise]++; cmd = FF.Cmd.stance(stance); }
        }
      }
    }
    pendingStanceRaise = -1;
    FF.stepDay(cmd);
    const curRel = FF.relOf();
    for (let i = 0; i < curRel.length; i++) if (curRel[i] < prevRel[i]) { pendingStanceRaise = i; break; }
    prevRel = curRel.slice();
    hist.push(FF.today());
  }
  return { hist, bust: FF.isBust() };
}

function flipRate(bools) {
  let flips = 0;
  for (let i = 1; i < bools.length; i++) if (bools[i] !== bools[i - 1]) flips++;
  return bools.length > 1 ? flips / (bools.length - 1) : NaN;
}

const METRICS = [
  { key: 'wIcap', get: d => d.wIcap },
  { key: 'shipShortfall', get: d => shipShortfall(d) },
  { key: 'missed', get: d => d.missed },
];

const dailyFlipAgg = {}, weeklyFlipAgg = {};
const dailyPosRateAgg = {}, weeklyPosRateAgg = {};
for (const m of METRICS) { dailyFlipAgg[m.key] = []; weeklyFlipAgg[m.key] = []; dailyPosRateAgg[m.key] = []; weeklyPosRateAgg[m.key] = []; }

let completed = 0;
for (let seed = 1; seed <= N_SEEDS; seed++) {
  const r = runSeed(seed);
  if (r.bust || r.hist.length < HORIZON) continue;
  completed++;
  for (const m of METRICS) {
    const daily = r.hist.map(d => m.get(d) > EPS);
    dailyFlipAgg[m.key].push(flipRate(daily));
    dailyPosRateAgg[m.key].push(100 * daily.filter(Boolean).length / daily.length);
    // 7일 합으로 재구성(달력주 경계 없이 순차 7일 블록 - 간단한 근사). "값>0인 날이 하루라도
    // 있으면 양성"은 너무 관대해서(단 하루 튐에도 발동) 공정한 비교가 아니다 - 그 주의
    // 과반(4/7) 이상에서 값>0이었는가로 잡는다(지속성 기준, 임의 튜닝 아님).
    const weekly = [];
    for (let i = 0; i < r.hist.length; i += 7) {
      let posDays = 0, n = 0;
      for (let j = i; j < Math.min(i + 7, r.hist.length); j++) { if (m.get(r.hist[j]) > EPS) posDays++; n++; }
      weekly.push(posDays / n >= 0.5);
    }
    weeklyFlipAgg[m.key].push(flipRate(weekly));
    weeklyPosRateAgg[m.key].push(100 * weekly.filter(Boolean).length / weekly.length);
  }
}
console.log(`완주 n=${completed}/${N_SEEDS}`);
for (const m of METRICS) {
  console.log(`\n[${m.key}] "값>0" 이진판정`);
  console.log(`  일 단위: flip率(전날 대비 판정 뒤집힘) 평균=${(100 * avg(dailyFlipAgg[m.key])).toFixed(1)}%  양성비율 평균=${avg(dailyPosRateAgg[m.key]).toFixed(1)}%`);
  console.log(`  주 단위(7일 합): flip率 평균=${(100 * avg(weeklyFlipAgg[m.key])).toFixed(1)}%  양성비율 평균=${avg(weeklyPosRateAgg[m.key]).toFixed(1)}%`);
}

FF.C.cost = ORIGINAL_COST; FF.C.step = ORIGINAL_STEP; FF.C.days = 30;
