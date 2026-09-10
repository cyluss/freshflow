// 이슈 #27: cooldown 후보 비교 전에 episode를 먼저 고정한다.
//   false→true = 새 episode 시작 / true 지속 = 같은 episode / true→false = episode 종료
// cooldown은 "같은 episode 안의 재알림 억제"와 "새 episode 알림"을 구별해야 한다 - 새
// episode는 이전 알림으로부터 며칠이 지났든 항상 알린다. cooldown은 같은 episode가 길게
// 이어질 때만 마지막 알림 후 N일이 지나면 다시 한 번 알리는 것으로 정의한다.
//
// 핵심 질문은 "몇 일 cooldown이 좋은가"보다 먼저 "같은 문제가 계속되는 동안 다시 알려줄
// 필요가 실제로 있는가?"다. 그래서 5개 비교군을 둔다:
//   raw       : active인 매일 알림(현재 상태 - #25가 74% 활성이라고 측정한 것)
//   edge-only : episode당 딱 1회(시작일)만 알림, 이후 같은 episode 동안은 재알림 없음
//   cd7/14/21 : episode 시작에 1회 + 그 뒤로도 episode가 이어지면 마지막 알림 후 N일마다 재알림
//
// 각 seed에서 정책을 한 번만 재생해 트리거별 일별 신호(불리언)를 얻고, 그 신호에서
// episode 목록(시작일/종료일)을 뽑은 뒤 5개 비교군의 알림 횟수를 이 episode 목록 하나로부터
// 계산한다(정책을 5번 다시 돌릴 필요가 없다 - 알림 정책은 관측 사후 처리이지 게임 규칙이
// 아니다).
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

const EPS = 1, DIAG_WINDOW = 9, COOLDOWN_BUY = 60, SIG_WINDOW = 14, TH_SHORTFALL_RATIO = 0.10;
function avg(a) { return a.length ? a.reduce((x, y) => x + y, 0) / a.length : NaN; }
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

// 정책 재생 한 번으로 트리거별 일별 신호(1..HORIZON, 실제 진행한 날만) 배열을 얻는다.
function runSeedSignals(seed) {
  FF.reset(seed);
  prepEngine();
  const hist = [];
  let lastIntakeBuy = -Infinity, lastSalesBuy = -Infinity, lastProcureBuy = -Infinity;
  let prevRel = FF.relOf().slice(); let pendingStanceRaise = -1;
  const sigSeries = { stance: [], intake: [], sales: [], procure: [] };
  for (let day = FF.run().day; day <= HORIZON; day++) {
    if (FF.isOver()) break;
    let cmd = FF.Cmd.wait();
    let stanceDeclinedToday = false;
    if (day === 1) {
      const opts = FF.C.contract.options; const mid = opts[Math.floor(opts.length / 2)];
      const opt = FF.contractOption(mid.x);
      if (opt && FF.ledger().cash >= opt.price) cmd = FF.Cmd.contract(mid.x);
      for (const k of TRIGGERS) sigSeries[k].push(false);
    } else {
      const diag = day >= 10 ? diagnoseAt(day, hist) : 'none';
      const sfRatio = shortfallRatioAt(day, hist);
      if (diag === 'intake_cap' && day - lastIntakeBuy >= COOLDOWN_BUY) { cmd = FF.Cmd.buy('intake'); lastIntakeBuy = day; }
      else if (sfRatio > TH_SHORTFALL_RATIO && day - lastSalesBuy >= COOLDOWN_BUY) { cmd = FF.Cmd.buy('sales'); lastSalesBuy = day; }
      else if (diag === 'procure_cap' && day - lastProcureBuy >= COOLDOWN_BUY) { cmd = FF.Cmd.buy('procure'); lastProcureBuy = day; }
      else {
        const fp = FF.factorPlan();
        if (fp.eligible && fp.suggested > EPS) cmd = FF.Cmd.factor(fp.suggested);
        else if (pendingStanceRaise !== -1) {
          const stance = (FF.stanceOf() || FF.C.channels.map(() => FF.C.stance.start)).slice();
          if (stance[pendingStanceRaise] < 3) { stance[pendingStanceRaise]++; cmd = FF.Cmd.stance(stance); }
        }
      }
      sigSeries.intake.push(diag === 'intake_cap');
      sigSeries.sales.push(sfRatio > TH_SHORTFALL_RATIO);
      sigSeries.procure.push(diag === 'procure_cap');
    }
    pendingStanceRaise = -1;
    FF.stepDay(cmd);
    const curRel = FF.relOf();
    for (let i = 0; i < curRel.length; i++) if (curRel[i] < prevRel[i]) { pendingStanceRaise = i; stanceDeclinedToday = true; }
    prevRel = curRel.slice();
    if (day > 1) sigSeries.stance.push(stanceDeclinedToday); else sigSeries.stance[0] = false;
    hist.push(FF.today());
  }
  return { sigSeries, bust: FF.isBust(), days: hist.length };
}

// 일별 불리언 배열 -> episode 목록 [{start,end}] (1-based day index로 변환).
function toEpisodes(sig) {
  const episodes = [];
  let start = null;
  for (let i = 0; i < sig.length; i++) {
    const day = i + 1;
    if (sig[i] && start === null) start = day;
    if (!sig[i] && start !== null) { episodes.push({ start, end: day - 1 }); start = null; }
  }
  if (start !== null) episodes.push({ start, end: sig.length });
  return episodes;
}

// episode 하나에 대해 정책별 알림 횟수를 낸다.
function notifyCounts(ep) {
  const dur = ep.end - ep.start + 1;
  const raw = dur;
  const edgeOnly = 1;
  const cd = {};
  for (const N of [7, 14, 21]) {
    let count = 1, last = ep.start;
    for (let day = ep.start + 1; day <= ep.end; day++) {
      if (day - last >= N) { count++; last = day; }
    }
    cd[N] = count;
  }
  return { raw, edgeOnly, cd, dur };
}

const POLICY_KEYS = ['raw', 'edgeOnly', 'cd7', 'cd14', 'cd21'];
const agg = {};
for (const k of TRIGGERS) {
  agg[k] = { episodes: 0, notif: { raw: 0, edgeOnly: 0, cd7: 0, cd14: 0, cd21: 0 },
    dup: { raw: 0, edgeOnly: 0, cd7: 0, cd14: 0, cd21: 0 }, // episode당 2회 이상
    missed: { raw: 0, edgeOnly: 0, cd7: 0, cd14: 0, cd21: 0 } }; // episode인데 알림 0회(항상 0이어야 정상)
}
let completed = 0, seedsWithYear = 0;
for (let seed = 1; seed <= N_SEEDS; seed++) {
  const r = runSeedSignals(seed);
  if (r.bust || r.days < HORIZON) continue;
  completed++;
  for (const k of TRIGGERS) {
    const eps = toEpisodes(r.sigSeries[k]);
    for (const ep of eps) {
      agg[k].episodes++;
      const nc = notifyCounts(ep);
      agg[k].notif.raw += nc.raw; agg[k].notif.edgeOnly += nc.edgeOnly;
      agg[k].notif.cd7 += nc.cd[7]; agg[k].notif.cd14 += nc.cd[14]; agg[k].notif.cd21 += nc.cd[21];
      if (nc.raw >= 2) agg[k].dup.raw++; // raw는 dur>=2일 때 사실상 항상 "매일 알림"이라 다른 정의(아래 출력에서 별도 설명)
      if (nc.edgeOnly >= 2) agg[k].dup.edgeOnly++;
      if (nc.cd[7] >= 2) agg[k].dup.cd7++; if (nc.cd[14] >= 2) agg[k].dup.cd14++; if (nc.cd[21] >= 2) agg[k].dup.cd21++;
      if (nc.raw === 0) agg[k].missed.raw++; if (nc.edgeOnly === 0) agg[k].missed.edgeOnly++;
      if (nc.cd[7] === 0) agg[k].missed.cd7++; if (nc.cd[14] === 0) agg[k].missed.cd14++; if (nc.cd[21] === 0) agg[k].missed.cd21++;
    }
  }
}
console.log(`완주 n=${completed}/${N_SEEDS}`);

for (const k of TRIGGERS) {
  const a = agg[k];
  console.log(`\n===== ${k} (episode 총 ${a.episodes}건, 완주시드 ${completed}) =====`);
  console.log('  정책\t연간알림수(합/완주시드)\tepisode당 2회이상 알림 비율\t새episode인데 알림0회 비율');
  for (const key of POLICY_KEYS) {
    const perYear = a.notif[key] / completed;
    const dupRate = 100 * a.dup[key] / a.episodes;
    const missRate = 100 * a.missed[key] / a.episodes;
    console.log(`  ${key}\t${perYear.toFixed(2)}\t${dupRate.toFixed(1)}%\t${missRate.toFixed(2)}%`);
  }
}

FF.C.cost = ORIGINAL_COST; FF.C.step = ORIGINAL_STEP; FF.C.days = 30;
