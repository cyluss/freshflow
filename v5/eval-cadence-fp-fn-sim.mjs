// 이슈 #24 1관문 재검증: "주간 집계가 하루짜리 우연한 spike는 걸러내면서, 실제로 지속되는
// 문제는 보존하는가?" flip率 대신 위양성(FP)/위음성(FN)으로 다시 잰다.
//
// ground truth(지속 문제) = 오늘부터 앞으로 14일 중 10일 이상 같은 원인근접 fact(wIcap 등)가
// 발생한다. 이 기준은 노출률에 맞춰 튜닝한 게 아니라 "다음 2주 대부분 계속된다"는 가장
// 단순한 지속성 정의다. 일별 신호=오늘 값>0. 주간 신호=최근 7일 중 4일 이상 양성(직전
// 실험과 동일한 지속성 정의, 매 시행 재사용).
//
// FP = 신호가 켜졌는데 실제로는 고립된 spike였다(지속 문제 아님).
// FN = 신호가 꺼졌는데 실제로는 지속 문제였다.
// 주간 집계가 일별 대비 FP를 크게 줄이면서 FN 증가가 감당할 만하면 주간 주기를 유지한다.
// 둘 다 나빠지거나 trade-off가 무의미하면 주간 평가주기 자체를 기각한다 - 그것도 정상적인
// #24의 결과다(완료조건 자체가 "필요한 최소 평가주기만 남긴다"였다).
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
const GT_WINDOW = 14, GT_K = 10; // ground truth: 앞으로 14일 중 10일 이상 발생 = 지속 문제
const WEEK_K = 4; // 주간 신호: 최근 7일 중 4일 이상 양성(직전 실험과 동일)

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

const METRICS = [
  { key: 'wIcap', get: d => d.wIcap },
  { key: 'shipShortfall', get: d => shipShortfall(d) },
  { key: 'missed', get: d => d.missed },
];

// 혼동행렬 누적기
function newCM() { return { tp: 0, fp: 0, fn: 0, tn: 0 }; }
const cmDaily = {}, cmWeekly = {};
for (const m of METRICS) { cmDaily[m.key] = newCM(); cmWeekly[m.key] = newCM(); }

let completed = 0;
for (let seed = 1; seed <= N_SEEDS; seed++) {
  const r = runSeed(seed);
  if (r.bust || r.hist.length < HORIZON) continue;
  completed++;
  const n = r.hist.length;
  for (const m of METRICS) {
    const vals = r.hist.map(d => m.get(d));
    const pos = vals.map(v => v > EPS);
    // 평가 가능한 날: ground truth를 보려면 앞으로 GT_WINDOW일이 남아 있어야 한다.
    for (let i = 0; i < n - GT_WINDOW; i++) {
      let futureCount = 0;
      for (let j = i; j < i + GT_WINDOW; j++) if (pos[j]) futureCount++;
      const gt = futureCount >= GT_K;

      const dailySig = pos[i];
      let weekPos = 0, weekN = 0;
      for (let j = Math.max(0, i - 6); j <= i; j++) { if (pos[j]) weekPos++; weekN++; }
      const weeklySig = weekPos >= WEEK_K;

      const cmd = cmDaily[m.key], cmw = cmWeekly[m.key];
      if (dailySig && gt) cmd.tp++; else if (dailySig && !gt) cmd.fp++; else if (!dailySig && gt) cmd.fn++; else cmd.tn++;
      if (weeklySig && gt) cmw.tp++; else if (weeklySig && !gt) cmw.fp++; else if (!weeklySig && gt) cmw.fn++; else cmw.tn++;
    }
  }
}
console.log(`완주 n=${completed}/${N_SEEDS}, ground truth 정의: 앞으로 ${GT_WINDOW}일 중 ${GT_K}일 이상 발생`);

for (const m of METRICS) {
  const cmd = cmDaily[m.key], cmw = cmWeekly[m.key];
  const totalD = cmd.tp + cmd.fp + cmd.fn + cmd.tn, totalW = cmw.tp + cmw.fp + cmw.fn + cmw.tn;
  const gtPosD = cmd.tp + cmd.fn, sigPosD = cmd.tp + cmd.fp;
  const gtPosW = cmw.tp + cmw.fn, sigPosW = cmw.tp + cmw.fp;
  console.log(`\n[${m.key}] (평가일수=${totalD}, 실제 지속문제 비율=${(100 * gtPosD / totalD).toFixed(1)}%)`);
  console.log(`  일별   FP율(신호양성 중 오판)=${(100 * cmd.fp / Math.max(1, sigPosD)).toFixed(1)}%  FN율(실제문제 중 놓침)=${(100 * cmd.fn / Math.max(1, gtPosD)).toFixed(1)}%  정확도=${(100 * (cmd.tp + cmd.tn) / totalD).toFixed(1)}%`);
  console.log(`  주간   FP율(신호양성 중 오판)=${(100 * cmw.fp / Math.max(1, sigPosW)).toFixed(1)}%  FN율(실제문제 중 놓침)=${(100 * cmw.fn / Math.max(1, gtPosW)).toFixed(1)}%  정확도=${(100 * (cmw.tp + cmw.tn) / totalW).toFixed(1)}%`);
}

FF.C.cost = ORIGINAL_COST; FF.C.step = ORIGINAL_STEP; FF.C.days = 30;
