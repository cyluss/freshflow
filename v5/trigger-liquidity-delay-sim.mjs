// 이슈 #25 2번 트리거: liquidity 위험(Factoring). 질문은 "지금 멈추지 않으면 다음 며칠
// 안에 실제 행동가능성이 사라지거나 지급불능 위험이 커지는가?"다. Contract처럼 창이 아예
// 닫히는 사건이 아니라, factorPlan().eligible(runway<factorThreshold)이 뜬 시점부터 실제
// 대응까지 며칠 늦춰도 되는지를 즉시/1일/3일/무대응 네 정책으로 비교한다.
//
// eligible은 며칠씩 계속 켜져 있을 수 있어서(edge-triggered), "새로 켜진 날"(어제는 꺼짐,
// 오늘 켜짐)만 트리거로 잡고 그 시점 기준 며칠 뒤에 실행한다 - 실행 시점의 factorPlan()을
// 다시 읽어 그때 상황에 맞는 금액을 쓴다(지연 자체가 상황을 바꾸므로).
//
// 다른 레버(Intake/Stance/Sales/Contract)는 기존에 검증된 반응형 정책을 그대로 쓰고
// factoring만 네 정책으로 갈아끼워, factoring 타이밍 하나만 격리해서 본다.
import fs from 'fs';

const stub = 'var FF={},FV={};';
const DOMAIN = ['src-core.js','src-store.js','src-access.js','src-uistate.js','src-kernel.js','src-runner.js','src-record.js','src-engine.js','src-counter.js','src-fact.js','src-report-data.js'];
const src = stub + DOMAIN.map(f => fs.readFileSync(f, 'utf8')).join('\n') + '\nreturn FF;';
const FF = new Function(src)();

const N_SEEDS = Number(process.argv[2] || 1500);
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

// delay: 0=즉시, 1, 3, Infinity=무대응. pending은 {day: 실행 예정일}.
function runSeed(seed, delay) {
  FF.reset(seed);
  prepEngine();
  const hist = [];
  let lastIntakeBuy = -Infinity, lastSalesBuy = -Infinity;
  let prevRel = FF.relOf().slice(); let pendingStanceRaise = -1;
  let prevEligible = false, alertDay = null;
  let factorEvents = 0, factorTotal = 0, triggerCount = 0;
  const nwSeries = [];
  for (let day = FF.run().day; day <= HORIZON; day++) {
    if (FF.isOver()) break;
    let cmd = FF.Cmd.wait();
    if (day === 1) {
      const opts = FF.C.contract.options; const mid = opts[Math.floor(opts.length / 2)];
      const opt = FF.contractOption(mid.x);
      if (opt && FF.ledger().cash >= opt.price) cmd = FF.Cmd.contract(mid.x);
    } else {
      const P = FF.factorPlan();
      // 새로 켜진 순간(edge)만 새 경보로 잡는다. 경보가 꺼지면(문제가 스스로 풀리면) 감시를 접는다.
      if (P.eligible && !prevEligible) { triggerCount++; alertDay = day; }
      if (!P.eligible) alertDay = null;
      prevEligible = P.eligible;

      // delay: 경보 후 며칠까지는 아예 안 본다(무대응은 영영 안 본다). 그 뒤로는 매일 다시
      // 확인해서 suggested가 실제로 양수가 되는 첫날 행동한다(경보 도중 상황이 나아지면
      // suggested가 계속 0일 수 있다 - 그건 "아직 행동할 필요가 없었다"는 정상 결과다).
      if (alertDay !== null && isFinite(delay) && day >= alertDay + delay) {
        if (P.suggested > EPS) { cmd = FF.Cmd.factor(P.suggested); factorEvents++; factorTotal += P.suggested; alertDay = null; }
      }
      if (cmd.type === 'wait') {
        const diag = day >= 10 ? diagnoseAt(day, hist) : 'none';
        const sfRatio = shortfallRatioAt(day, hist);
        if (diag === 'intake_cap' && day - lastIntakeBuy >= COOLDOWN) { cmd = FF.Cmd.buy('intake'); lastIntakeBuy = day; }
        else if (sfRatio > TH_SHORTFALL_RATIO && day - lastSalesBuy >= COOLDOWN) { cmd = FF.Cmd.buy('sales'); lastSalesBuy = day; }
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
    const d = FF.today();
    hist.push(d);
    nwSeries.push(dailyNetWorth());
  }
  return { hist, nwSeries, bust: FF.isBust(), triggerCount, factorEvents, factorTotal, finalDay: hist.length };
}

const POLICIES = [
  { key: 'immediate', delay: 0 },
  { key: 'delay1', delay: 1 },
  { key: 'delay3', delay: 3 },
  { key: 'never', delay: Infinity },
];

const results = {}; for (const p of POLICIES) results[p.key] = [];
let completed = 0, anyTrigger = 0;
for (let seed = 1; seed <= N_SEEDS; seed++) {
  const runs = {};
  for (const p of POLICIES) runs[p.key] = runSeed(seed, p.delay);
  if (runs.never.triggerCount > 0) anyTrigger++;
  completed++;
  for (const p of POLICIES) results[p.key].push(runs[p.key]);
}
console.log(`완주 n=${completed}/${N_SEEDS}, 최소 1회 이상 eligible 발생 시드 비율=${(100*anyTrigger/completed).toFixed(1)}%`);

console.log(`\n[정책별 파산율]`);
for (const p of POLICIES) {
  const rows = results[p.key];
  const bustN = rows.filter(r => r.bust).length;
  console.log(`  ${p.key}: 파산 ${bustN}/${completed} (${(100*bustN/completed).toFixed(1)}%)`);
}

console.log(`\n[정책별 day365 netWorth 평균 (완주자만, 둘 다 무파산인 시드 쌍대비 기준은 아래 참조)]`);
for (const p of POLICIES) {
  const rows = results[p.key].filter(r => !r.bust);
  const nw = rows.map(r => r.nwSeries[r.nwSeries.length - 1]);
  console.log(`  ${p.key}: n=${rows.length} 평균netWorth=${avg(nw).toFixed(0)} 평균factor횟수=${avg(rows.map(r=>r.factorEvents)).toFixed(2)} 평균factor총액=${avg(rows.map(r=>r.factorTotal)).toFixed(0)}`);
}

// immediate 대비 각 지연정책의 쌍차(같은 seed 기준) - 둘 다 무파산인 seed만.
console.log(`\n[immediate 대비 쌍차 (둘 다 무파산인 seed만)]`);
for (const p of POLICIES) {
  if (p.key === 'immediate') continue;
  const diffs = [];
  for (let i = 0; i < completed; i++) {
    const a = results.immediate[i], b = results[p.key][i];
    if (a.bust || b.bust) continue;
    diffs.push(b.nwSeries[b.nwSeries.length-1] - a.nwSeries[a.nwSeries.length-1]);
  }
  console.log(`  ${p.key} - immediate: n=${diffs.length} 평균=${avg(diffs).toFixed(0)} 양수비율(지연이 더 나음)=${(100*diffs.filter(v=>v>0).length/diffs.length).toFixed(1)}%`);
}

// 지연정책이 immediate에는 없던 파산을 새로 만드는가(같은 seed에서 immediate는 생존, 지연은 파산).
console.log(`\n[지연이 새로 만드는 파산 (immediate는 생존했는데 지연정책에서 파산한 seed 수)]`);
for (const p of POLICIES) {
  if (p.key === 'immediate') continue;
  let newBust = 0;
  for (let i = 0; i < completed; i++) {
    if (!results.immediate[i].bust && results[p.key][i].bust) newBust++;
  }
  console.log(`  ${p.key}: ${newBust}/${completed} (${(100*newBust/completed).toFixed(2)}%)`);
}

FF.C.cost = ORIGINAL_COST; FF.C.step = ORIGINAL_STEP; FF.C.days = 30;
