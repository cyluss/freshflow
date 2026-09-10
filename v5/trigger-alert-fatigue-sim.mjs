// 이슈 #25 마지막 제품화 검증: 4개 독립 WARNING(관계 하락/Intake/Sales/Procurement
// shortfall)을 실제 자동진행 환경에 동시에 넣고 알림 폭주가 있는지 본다. 개별 trigger의
// decision value는 이미 확인했으니(trigger-stance-delay-sim.mjs/trigger-capacity-delay-
// sim.mjs), 여기서는 "네 개를 합쳤을 때 플레이어에게 하나의 지속 경고음처럼 느껴지는가"만
// 측정한다. 경제 문턱 재튜닝이 아니라 UI 억제(ack/cooldown) 필요 여부를 판단하는 게 목적이다.
//
// 신호 정의(기존과 동일):
//   stance  : 어제보다 관계가 내려간 채널이 하나라도 있는 날(원래도 이산 사건)
//   intake  : 롤링 9일창 진단이 intake_cap일 때
//   sales   : 롤링 14일창 shortfallRatio > 0.10일 때
//   procure : 롤링 9일창 진단이 procure_cap일 때
// "새 알림"은 각 신호의 rising edge(어제 꺼짐→오늘 켜짐)만 센다 - 지속되는 문제를 매일
// 다시 알리는 건 폭주 정의상 의미가 다르다(#9: 관측된 사실이지 매일 새 사건이 아니다).
// "활성 일수"는 그 신호가 켜져 있는 모든 날을 센다(배너가 떠 있는 기간).
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
function median(a) { if (!a.length) return NaN; const s = a.slice().sort((x, y) => x - y); const m = Math.floor(s.length / 2); return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; }
function prepEngine() { FF.ENGINE.value.phase.storage = FF.ENGINE.value.phase.storage || { dir: 0, n: 0 }; }
function shipShortfall(d) { return (d.sold >= d.capS - FF.C.ui.eps && d.dem > d.sold + FF.C.ui.eps) ? (d.dem - d.sold) : 0; }
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
  const from = Math.max(1, day - SIG_WINDOW); let s = 0, c = 0;
  for (const d of hist) { if (d.day < from || d.day >= day) continue; s += shipShortfall(d); c += d.capS; }
  return c > 0 ? s / c : 0;
}

const TRIGGERS = ['stance', 'intake', 'sales', 'procure'];

function runSeed(seed) {
  FF.reset(seed);
  prepEngine();
  const hist = [];
  let lastIntakeBuy = -Infinity, lastSalesBuy = -Infinity, lastProcureBuy = -Infinity;
  let prevRel = FF.relOf().slice(); let pendingStanceRaise = -1;
  const prevSig = { stance: false, intake: false, sales: false, procure: false };
  const onsetCount = { stance: 0, intake: 0, sales: 0, procure: 0 };
  const activeDays = { stance: 0, intake: 0, sales: 0, procure: 0 };
  const lastOnsetDay = { stance: null, intake: null, sales: null, procure: null };
  const gaps = { stance: [], intake: [], sales: [], procure: [] };
  let anyActiveDays = 0, multiActiveDays = 0;
  let curRun = 0, runs = [];

  for (let day = FF.run().day; day <= HORIZON; day++) {
    if (FF.isOver()) break;
    let cmd = FF.Cmd.wait();
    let stanceDeclinedToday = false;
    if (day === 1) {
      const opts = FF.C.contract.options; const mid = opts[Math.floor(opts.length / 2)];
      const opt = FF.contractOption(mid.x);
      if (opt && FF.ledger().cash >= opt.price) cmd = FF.Cmd.contract(mid.x);
    } else {
      const diag = day >= 10 ? diagnoseAt(day, hist) : 'none';
      const sfRatio = shortfallRatioAt(day, hist);
      const sig = {
        intake: diag === 'intake_cap',
        sales: sfRatio > TH_SHORTFALL_RATIO,
        procure: diag === 'procure_cap',
        stance: false, // 아래서 stepDay 이후 실제 관측으로 채운다
      };
      if (diag === 'intake_cap' && day - lastIntakeBuy >= COOLDOWN) { cmd = FF.Cmd.buy('intake'); lastIntakeBuy = day; }
      else if (sfRatio > TH_SHORTFALL_RATIO && day - lastSalesBuy >= COOLDOWN) { cmd = FF.Cmd.buy('sales'); lastSalesBuy = day; }
      else if (diag === 'procure_cap' && day - lastProcureBuy >= COOLDOWN) { cmd = FF.Cmd.buy('procure'); lastProcureBuy = day; }
      else {
        const fp = FF.factorPlan();
        if (fp.eligible && fp.suggested > EPS) cmd = FF.Cmd.factor(fp.suggested);
        else if (pendingStanceRaise !== -1) {
          const stance = (FF.stanceOf() || FF.C.channels.map(() => FF.C.stance.start)).slice();
          if (stance[pendingStanceRaise] < 3) { stance[pendingStanceRaise]++; cmd = FF.Cmd.stance(stance); }
        }
      }
      for (const k of ['intake', 'sales', 'procure']) {
        if (sig[k] && !prevSig[k]) { onsetCount[k]++; if (lastOnsetDay[k] !== null) gaps[k].push(day - lastOnsetDay[k]); lastOnsetDay[k] = day; }
        if (sig[k]) activeDays[k]++;
        prevSig[k] = sig[k];
      }
    }
    pendingStanceRaise = -1;
    FF.stepDay(cmd);
    const curRel = FF.relOf();
    for (let i = 0; i < curRel.length; i++) if (curRel[i] < prevRel[i]) { pendingStanceRaise = i; stanceDeclinedToday = true; }
    prevRel = curRel.slice();
    if (day > 1) {
      if (stanceDeclinedToday && !prevSig.stance) { onsetCount.stance++; if (lastOnsetDay.stance !== null) gaps.stance.push(day - lastOnsetDay.stance); lastOnsetDay.stance = day; }
      if (stanceDeclinedToday) activeDays.stance++;
      prevSig.stance = stanceDeclinedToday;

      const activeCount = TRIGGERS.filter(k => prevSig[k]).length;
      if (activeCount > 0) { anyActiveDays++; curRun++; } else { if (curRun > 0) runs.push(curRun); curRun = 0; }
      if (activeCount >= 2) multiActiveDays++;
    }
    hist.push(FF.today());
  }
  if (curRun > 0) runs.push(curRun);
  return { onsetCount, activeDays, gaps, anyActiveDays, multiActiveDays, runs, days: hist.length };
}

const agg = { onsetCount: { stance: [], intake: [], sales: [], procure: [] },
  activeDays: { stance: [], intake: [], sales: [], procure: [] },
  gaps: { stance: [], intake: [], sales: [], procure: [] },
  anyActiveDays: [], multiActiveDays: [], allRuns: [] };

let completed = 0;
for (let seed = 1; seed <= N_SEEDS; seed++) {
  const r = runSeed(seed);
  if (FF.isBust() || r.days < HORIZON) continue;
  completed++;
  for (const k of TRIGGERS) { agg.onsetCount[k].push(r.onsetCount[k]); agg.activeDays[k].push(r.activeDays[k]); agg.gaps[k].push(...r.gaps[k]); }
  agg.anyActiveDays.push(r.anyActiveDays);
  agg.multiActiveDays.push(r.multiActiveDays);
  agg.allRuns.push(...r.runs);
}
console.log(`완주 n=${completed}/${N_SEEDS}`);

console.log(`\n[트리거별 365일당 새 알림(onset) 횟수 / 활성 일수]`);
for (const k of TRIGGERS) {
  console.log(`  ${k}: onset평균=${avg(agg.onsetCount[k]).toFixed(2)}회/년  활성일수평균=${avg(agg.activeDays[k]).toFixed(1)}일/년  재발간격 중앙값=${median(agg.gaps[k]).toFixed(0)}일 (n=${agg.gaps[k].length})`);
}

console.log(`\n[전체 경보 부담]`);
console.log(`  어느 하나라도 활성인 날: 평균 ${avg(agg.anyActiveDays).toFixed(1)}일/년 (${(100*avg(agg.anyActiveDays)/365).toFixed(1)}%)`);
console.log(`  2개 이상 동시 활성인 날: 평균 ${avg(agg.multiActiveDays).toFixed(1)}일/년 (활성일 중 ${(100*avg(agg.multiActiveDays)/Math.max(1,avg(agg.anyActiveDays))).toFixed(1)}%)`);

console.log(`\n[연속 경보 run 길이 분포 (하나 이상 활성 상태가 끊기지 않고 이어지는 일수)]`);
const runsSorted = agg.allRuns.slice().sort((a,b)=>a-b);
const pct = p => runsSorted.length ? runsSorted[Math.min(runsSorted.length-1, Math.floor(runsSorted.length*p))] : NaN;
console.log(`  n=${runsSorted.length} 평균=${avg(agg.allRuns).toFixed(1)}일 중앙값=${pct(0.5)}일 p90=${pct(0.9)}일 최댓값=${runsSorted[runsSorted.length-1]}일`);

FF.C.cost = ORIGINAL_COST; FF.C.step = ORIGINAL_STEP; FF.C.days = 30;
