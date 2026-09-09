// 이슈 #24 2관문(월간): 주간과 같은 noise 감소 질문을 반복하지 않는다. 월간의 역할은
// 다르다 - "최근 한 달의 관측으로 다음 달에도 지속될 구조적 제약을 식별할 수 있는가?"
//
// 월말까지의 observable fact만 입력으로 쓰고, 다음 30일의 실제 지속성을 정답으로 둔다.
//   일별 신호 = 오늘(day d) 값>0 (한 시점의 원자료만 본다)
//   월간 신호 = 최근 30일[d-29,d] 중 절반(15일) 이상 양성(지난달 동안의 구조적 경향)
//   ground truth = 다음 30일[d+1,d+30] 중 절반(15일) 이상 양성(다음달에도 지속되는가)
// 같은 ground truth에 대해 "오늘 하루만 보는 판단"과 "지난 한 달을 보는 판단" 중 어느 쪽이
// 다음 달 지속성을 더 잘 맞히는지 비교한다. 월간이 추가 정보를 못 주면(FP/FN이 일별과
// 다르지 않거나 더 나쁘면) 월 해상도 자체를 기각한다 - 살리기 위한 실험이 아니다.
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
const MONTH = 30; // 관측창/예측창 둘 다 30일, 과반(15일)을 "지속"으로 본다

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
    const vals = r.hist.map(d => m.get(d));
    const pos = vals.map(v => v > EPS);
    // 평가 가능한 날: 지난 30일(입력)과 다음 30일(정답)이 둘 다 있어야 한다.
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
