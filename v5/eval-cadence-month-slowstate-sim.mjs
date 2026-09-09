// 이슈 #24 2관문 마지막 확인: 월간이 wIcap/shipShortfall/missed 같은 빠른 운영지표에는
// 추가 가치가 없다는 것까지만 확인됐다. rel(관계)과 DIO 같은 느린 상태변수에서도 같은지
// 확인해야 "월간 평가주기 자체가 필요 없다"고 넓게 결론지을 수 있다.
//
// 질문은 그대로: "느린 상태변수에서 월간 관측이 일별 관측보다 다음 기간의 구조적 상태를
// 더 잘 식별하는가?" ground truth/신호 구성은 앞 실험과 동일(다음 30일 중 15일 이상
// "문제" 상태 = 구조적 지속, 월간신호 = 지난 30일 중 15일 이상 "문제" 상태).
//
// "문제" 정의는 이미 이 세션에서 확인된 자연 기준값을 그대로 쓴다(새로 튜닝하지 않는다):
//   관계 문제 = 채널평균 rel < 1.5 (stance-effect-attribution-sim.mjs에서 확인한 완전방치
//     시 자연 평형값 ≈1.8보다 낮은 수준 - 방치해도 도달하는 수준보다 나쁜 상태)
//   DIO 문제 = 그날의 실현 가중평균 나이(ageMix+폐기) > 0.35 (vertical-slice-1year-sim.mjs
//     분기평균 DIO 0.27~0.39 구간의 중간값 부근 - 관측된 자연 범위 기준)
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

const EPS = 1, DIAG_WINDOW = 9, COOLDOWN = 60, SIG_WINDOW = 14, TH_SHORTFALL_RATIO = 0.10;
const MONTH = 30;
const REL_TH = 1.5;
const DIO_TH = 0.35;
const TTL = FF.C.ttl;

function avg(a) { return a.length ? a.reduce((x, y) => x + y, 0) / a.length : NaN; }
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
function dioOf(d) {
  let sw = 0, su = 0;
  (d.ageMix || []).forEach(({ a, q }) => { sw += a * q; su += q; });
  sw += TTL * d.wT; su += d.wT;
  return su > 0 ? sw / su : 0;
}

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

const METRICS = [
  { key: 'relLow(rel<1.5)', get: d => avg(d.rel) < REL_TH },
  { key: 'dioHigh(DIO>0.35)', get: d => dioOf(d) > DIO_TH },
];

function newCM() { return { tp: 0, fp: 0, fn: 0, tn: 0 }; }
const cmDaily = {}, cmMonthly = {};
for (const m of METRICS) { cmDaily[m.key] = newCM(); cmMonthly[m.key] = newCM(); }

let completed = 0;
for (let seed = 1; seed <= N_SEEDS; seed++) {
  const r = runSeed(seed);
  if (r.bust || r.hist.length < HORIZON) continue;
  completed++;
  const n = r.hist.length;
  for (const m of METRICS) {
    const pos = r.hist.map(m.get);
    for (let i = MONTH; i < n - MONTH; i++) {
      let futureCount = 0;
      for (let j = i + 1; j <= i + MONTH; j++) if (pos[j]) futureCount++;
      const gt = futureCount >= MONTH / 2;

      const dailySig = pos[i];
      let pastCount = 0;
      for (let j = i - MONTH + 1; j <= i; j++) if (pos[j]) pastCount++;
      const monthlySig = pastCount >= MONTH / 2;

      const cmd = cmDaily[m.key], cmM = cmMonthly[m.key];
      if (dailySig && gt) cmd.tp++; else if (dailySig && !gt) cmd.fp++; else if (!dailySig && gt) cmd.fn++; else cmd.tn++;
      if (monthlySig && gt) cmM.tp++; else if (monthlySig && !gt) cmM.fp++; else if (!monthlySig && gt) cmM.fn++; else cmM.tn++;
    }
  }
}
console.log(`완주 n=${completed}/${N_SEEDS}, ground truth: 다음 30일 중 15일 이상 발생`);

for (const m of METRICS) {
  const cmd = cmDaily[m.key], cmM = cmMonthly[m.key];
  const totalD = cmd.tp + cmd.fp + cmd.fn + cmd.tn, totalM = cmM.tp + cmM.fp + cmM.fn + cmM.tn;
  const gtPosD = cmd.tp + cmd.fn, sigPosD = cmd.tp + cmd.fp;
  const gtPosM = cmM.tp + cmM.fn, sigPosM = cmM.tp + cmM.fp;
  console.log(`\n[${m.key}] (평가일수=${totalD}, 다음달 지속 비율=${(100 * gtPosD / totalD).toFixed(1)}%)`);
  console.log(`  일별(오늘 하루만)   FP율=${(100 * cmd.fp / Math.max(1, sigPosD)).toFixed(1)}%  FN율=${(100 * cmd.fn / Math.max(1, gtPosD)).toFixed(1)}%  정확도=${(100 * (cmd.tp + cmd.tn) / totalD).toFixed(1)}%`);
  console.log(`  월간(지난 30일)     FP율=${(100 * cmM.fp / Math.max(1, sigPosM)).toFixed(1)}%  FN율=${(100 * cmM.fn / Math.max(1, gtPosM)).toFixed(1)}%  정확도=${(100 * (cmM.tp + cmM.tn) / totalM).toFixed(1)}%`);
}

FF.C.cost = ORIGINAL_COST; FF.C.step = ORIGINAL_STEP; FF.C.days = 30;
