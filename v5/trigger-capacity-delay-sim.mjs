// 이슈 #25 4~6번 트리거(Intake/Sales/Procurement capacity, 한 묶음): 이미 각각 좋은 원인근접
// fact가 있다(Intake: wIcap 롤링진단, Sales: shortfallRatio, Procurement: wIprocure 롤링진단).
// 신호 on/off에 따른 투자가치 방향성은 이미 검증됐다(intake-rolling-trigger-sim.mjs,
// sales-scale-invariant-signal-sim.mjs, procure-endtoend-sim.mjs). 여기서는 3번째 질문만
// 본다 - "즉시 pause가 필요한가, warning만으로 충분한가?" 신호가 켜진 뒤 실제 투자를
// 며칠 늦춰도 되는지를 즉시/3일/7일/14일/무대응 다섯 정책으로 비교한다(Stance/Factoring과
// 같은 지연비용 틀).
//
// CAPACITY(intake|sales|procure) 하나만 지연시키고 나머지 레버(Contract/Factoring/Stance,
// 그리고 다른 두 capacity)는 기존 검증된 즉시반응 정책 그대로 둬서, 그 capacity의 반응
// 타이밍 하나만 격리해서 본다.
import fs from 'fs';

const CAPACITY = process.argv[2] || 'intake'; // intake | sales | procure
const N_SEEDS = Number(process.argv[3] || 2000);

const stub = 'var FF={},FV={};';
const DOMAIN = ['src-core.js','src-store.js','src-access.js','src-uistate.js','src-kernel.js','src-runner.js','src-record.js','src-engine.js','src-counter.js','src-fact.js','src-report-data.js'];
const src = stub + DOMAIN.map(f => fs.readFileSync(f, 'utf8')).join('\n') + '\nreturn FF;';
const FF = new Function(src)();

const HORIZON = 365;
FF.C.days = HORIZON;
const ORIGINAL_COST = Object.assign({}, FF.C.cost);
const ORIGINAL_STEP = Object.assign({}, FF.C.step);
FF.C.cost = Object.assign({}, ORIGINAL_COST, { intake: 490 });
FF.C.step = Object.assign({}, ORIGINAL_STEP, { intake: 2 });

const EPS = 1, DIAG_WINDOW = 9, COOLDOWN = 60, SIG_WINDOW = 14, TH_SHORTFALL_RATIO = 0.10;
function avg(a) { return a.length ? a.reduce((x, y) => x + y, 0) / a.length : NaN; }
function dailyNetWorth() { return FF.ledger().cash + FF.sumAmt(FF.arOf()) - FF.sumAmt(FF.apOf()); }
function prepEngine() { FF.ENGINE.value.phase.storage = FF.ENGINE.value.phase.storage || { dir: 0, n: 0 }; }
function shipShortfall(d) { return (d.sold >= d.capS - FF.C.ui.eps && d.dem > d.sold + FF.C.ui.eps) ? (d.dem - d.sold) : 0; }
// intake_cap/procure_cap 둘 다 같은 롤링창 방식으로 진단한다(procure-endtoend-sim.mjs의
// day1-9 1회성 진단을 매일 갱신되는 롤링창으로 일반화한 것 - intake-rolling-trigger-sim.mjs와
// 같은 일반화).
function diagnoseAt(day, hist) {
  let sumCap = 0, sumProcure = 0, sumStore = 0, sumCash = 0, sumShip = 0;
  const from = Math.max(1, day - DIAG_WINDOW);
  for (const d of hist) { if (d.day < from || d.day >= day) continue; sumCap += d.wIcap; sumProcure += d.wIprocure; sumStore += d.wIstore; sumCash += d.wS; sumShip += shipShortfall(d); }
  const maxV = Math.max(sumCap, sumProcure, sumStore, sumCash, sumShip);
  if (maxV <= EPS) return 'none';
  if (sumCap === maxV) return 'intake_cap';
  if (sumProcure === maxV) return 'procure_cap';
  return 'other';
}
function shortfallRatioAt(day, hist) {
  const from = Math.max(1, day - SIG_WINDOW); let shortfall = 0, capSsum = 0;
  for (const d of hist) { if (d.day < from || d.day >= day) continue; shortfall += shipShortfall(d); capSsum += d.capS; }
  return capSsum > 0 ? shortfall / capSsum : 0;
}

function runSeed(seed, delay) {
  FF.reset(seed);
  prepEngine();
  const hist = [];
  let lastIntakeBuy = -Infinity, lastSalesBuy = -Infinity, lastProcureBuy = -Infinity;
  let prevRel = FF.relOf().slice(); let pendingStanceRaise = -1;
  let signalOnSince = null, prevSignal = false;
  let testedBuys = 0;
  const nwSeries = [];
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
      const signal = CAPACITY === 'intake' ? (diag === 'intake_cap')
        : CAPACITY === 'procure' ? (diag === 'procure_cap')
        : (sfRatio > TH_SHORTFALL_RATIO);
      if (signal && !prevSignal) signalOnSince = day;
      if (!signal) signalOnSince = null;
      prevSignal = signal;

      const lastBuy = CAPACITY === 'intake' ? lastIntakeBuy : CAPACITY === 'procure' ? lastProcureBuy : lastSalesBuy;
      if (signalOnSince !== null && isFinite(delay) && day >= signalOnSince + delay && day - lastBuy >= COOLDOWN) {
        cmd = FF.Cmd.buy(CAPACITY);
        if (CAPACITY === 'intake') lastIntakeBuy = day; else if (CAPACITY === 'procure') lastProcureBuy = day; else lastSalesBuy = day;
        testedBuys++;
        signalOnSince = null;
      }
      if (cmd.type === 'wait') {
        // 시험 대상이 아닌 두 capacity는 기존 검증된 즉시반응 그대로.
        if (CAPACITY !== 'intake' && diag === 'intake_cap' && day - lastIntakeBuy >= COOLDOWN) { cmd = FF.Cmd.buy('intake'); lastIntakeBuy = day; }
        else if (CAPACITY !== 'sales' && sfRatio > TH_SHORTFALL_RATIO && day - lastSalesBuy >= COOLDOWN) { cmd = FF.Cmd.buy('sales'); lastSalesBuy = day; }
        else if (CAPACITY !== 'procure' && diag === 'procure_cap' && day - lastProcureBuy >= COOLDOWN) { cmd = FF.Cmd.buy('procure'); lastProcureBuy = day; }
        else {
          const fp = FF.factorPlan();
          if (fp.eligible && fp.suggested > EPS) cmd = FF.Cmd.factor(fp.suggested);
          else if (pendingStanceRaise !== -1) {
            const stance = (FF.stanceOf() || FF.C.channels.map(() => FF.C.stance.start)).slice();
            if (stance[pendingStanceRaise] < 3) { stance[pendingStanceRaise]++; cmd = FF.Cmd.stance(stance); }
          }
        }
      }
    }
    pendingStanceRaise = -1;
    FF.stepDay(cmd);
    const curRel = FF.relOf();
    for (let i = 0; i < curRel.length; i++) if (curRel[i] < prevRel[i]) { pendingStanceRaise = i; break; }
    prevRel = curRel.slice();
    const d = FF.today();
    hist.push(d);
    nwSeries.push(dailyNetWorth());
  }
  return { hist, nwSeries, bust: FF.isBust(), testedBuys };
}

const POLICIES = [
  { key: 'immediate', delay: 0 },
  { key: 'delay3', delay: 3 },
  { key: 'delay7', delay: 7 },
  { key: 'delay14', delay: 14 },
  { key: 'never', delay: Infinity },
];

console.log(`\n===== CAPACITY=${CAPACITY} (N=${N_SEEDS}) =====`);
const results = {}; for (const p of POLICIES) results[p.key] = [];
let completed = 0;
for (let seed = 1; seed <= N_SEEDS; seed++) {
  const runs = {};
  let ok = true;
  for (const p of POLICIES) { runs[p.key] = runSeed(seed, p.delay); if (runs[p.key].bust) ok = false; }
  if (!ok) continue;
  completed++;
  for (const p of POLICIES) results[p.key].push(runs[p.key]);
}
console.log(`완주(5정책 전부 무파산) n=${completed}/${N_SEEDS}`);

console.log(`\n[정책별 day365 평균]`);
for (const p of POLICIES) {
  const rows = results[p.key];
  const nw = avg(rows.map(r => r.nwSeries[r.nwSeries.length-1]));
  console.log(`  ${p.key}: netWorth=${nw.toFixed(0)} 평균매입횟수=${avg(rows.map(r=>r.testedBuys)).toFixed(2)}`);
}

console.log(`\n[immediate 대비 쌍차 (같은 seed)]`);
for (const p of POLICIES) {
  if (p.key === 'immediate') continue;
  const diffs = [];
  for (let i = 0; i < completed; i++) {
    diffs.push(results[p.key][i].nwSeries[results[p.key][i].nwSeries.length-1]
      - results.immediate[i].nwSeries[results.immediate[i].nwSeries.length-1]);
  }
  console.log(`  ${p.key} - immediate: 평균=${avg(diffs).toFixed(0)} 양수비율(지연이 더 나음)=${(100*diffs.filter(v=>v>0).length/diffs.length).toFixed(1)}%`);
}

FF.C.cost = ORIGINAL_COST; FF.C.step = ORIGINAL_STEP; FF.C.days = 30;
