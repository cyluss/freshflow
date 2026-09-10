// 이슈 #25 3번 트리거: 관계 하락(Stance). 질문은 "1회 하락 자체가 즉시 개입할 가치가
// 있는가, 아니면 반복 하락만 중요한가?"다. relOf() 하락(어느 채널이 전날보다 내려간
// 순간)을 경보로 잡고, 즉시/3일/7일/14일/무대응 다섯 정책으로 그 채널의 stance를 올리는
// 타이밍만 바꿔서 비교한다. 다른 레버(Intake/Sales/Contract/Factoring)는 기존 검증된
// 반응형 정책을 그대로 쓴다.
//
// 지연 중 같은/다른 채널이 또 내려가면 가장 최근 하락으로 감시 대상을 갱신한다(가장 최근
// 신호에 반응하는 단순한 정책 - 이 세션 전체에서 일관되게 쓴 규칙).
import fs from 'fs';

const stub = 'var FF={},FV={};';
const DOMAIN = ['src-core.js','src-store.js','src-access.js','src-uistate.js','src-kernel.js','src-runner.js','src-record.js','src-engine.js','src-counter.js','src-fact.js','src-report-data.js'];
const src = stub + DOMAIN.map(f => fs.readFileSync(f, 'utf8')).join('\n') + '\nreturn FF;';
const FF = new Function(src)();

const N_SEEDS = Number(process.argv[2] || 2000);
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

function runSeed(seed, delay) {
  FF.reset(seed);
  prepEngine();
  const hist = [];
  let lastIntakeBuy = -Infinity, lastSalesBuy = -Infinity;
  let prevRel = FF.relOf().slice();
  let pendingChannel = -1, pendingSince = null;
  let declineEvents = 0, stanceRaises = 0;
  let zeroRelDays = 0; // 어느 채널이든 rel=0으로 지낸 채널-일수 합
  const nwSeries = [];
  for (let day = FF.run().day; day <= HORIZON; day++) {
    if (FF.isOver()) break;
    let cmd = FF.Cmd.wait();
    if (day === 1) {
      const opts = FF.C.contract.options; const mid = opts[Math.floor(opts.length / 2)];
      const opt = FF.contractOption(mid.x);
      if (opt && FF.ledger().cash >= opt.price) cmd = FF.Cmd.contract(mid.x);
    } else {
      // 지연이 끝났고 아직 그 채널에 아무도 안 손댔으면 stance를 올린다(최우선 - 관계는
      // 자연 회복 경로가 stance 인상뿐이다).
      if (pendingChannel !== -1 && isFinite(delay) && day >= pendingSince + delay) {
        const stance = (FF.stanceOf() || FF.C.channels.map(() => FF.C.stance.start)).slice();
        if (stance[pendingChannel] < 3) { stance[pendingChannel]++; cmd = FF.Cmd.stance(stance); stanceRaises++; }
        pendingChannel = -1;
      }
      if (cmd.type === 'wait') {
        const fp = FF.factorPlan();
        const diag = day >= 10 ? diagnoseAt(day, hist) : 'none';
        const sfRatio = shortfallRatioAt(day, hist);
        if (diag === 'intake_cap' && day - lastIntakeBuy >= COOLDOWN) { cmd = FF.Cmd.buy('intake'); lastIntakeBuy = day; }
        else if (sfRatio > TH_SHORTFALL_RATIO && day - lastSalesBuy >= COOLDOWN) { cmd = FF.Cmd.buy('sales'); lastSalesBuy = day; }
        else if (fp.eligible && fp.suggested > EPS) cmd = FF.Cmd.factor(fp.suggested);
      }
    }
    FF.stepDay(cmd);
    const curRel = FF.relOf();
    for (let i = 0; i < curRel.length; i++) {
      if (curRel[i] < prevRel[i]) { declineEvents++; pendingChannel = i; pendingSince = day; }
      if (curRel[i] === 0) zeroRelDays++;
    }
    prevRel = curRel.slice();
    const d = FF.today();
    hist.push(d);
    nwSeries.push(dailyNetWorth());
  }
  return { hist, nwSeries, bust: FF.isBust(), declineEvents, stanceRaises, zeroRelDays,
    finalRelAvg: avg(FF.relOf()) };
}

const POLICIES = [
  { key: 'immediate', delay: 0 },
  { key: 'delay3', delay: 3 },
  { key: 'delay7', delay: 7 },
  { key: 'delay14', delay: 14 },
  { key: 'never', delay: Infinity },
];

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
console.log('  ' + ['policy','netWorth','stanceRaises','declineEvents(참고)','finalRelAvg','zeroRelDays'].join('\t'));
for (const p of POLICIES) {
  const rows = results[p.key];
  const nw = avg(rows.map(r => r.nwSeries[r.nwSeries.length-1]));
  console.log('  ' + [p.key, nw.toFixed(0), avg(rows.map(r=>r.stanceRaises)).toFixed(2),
    avg(rows.map(r=>r.declineEvents)).toFixed(2), avg(rows.map(r=>r.finalRelAvg)).toFixed(3),
    avg(rows.map(r=>r.zeroRelDays)).toFixed(1)].join('\t'));
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
