// 이슈 #27 마지막 질문: "장기 Procurement episode에서 재알림이 실제로 플레이어의
// 대응을 앞당겨 -9.1% 손실을 줄이는가?" 재알림을 받으면 반드시 투자한다고 가정하면
// 가치를 과대평가하므로, "플레이어는 procurement 신호를 알림이 온 날에만 확인한다"는
// 모델로 같은 반응 정책(신호+투자쿨다운 60일)을 유지한 채 알림 정책만 바꾼다. 알림이
// 왔다고 무조건 사는 게 아니라, 그날 실제로 캐시·투자쿨다운 조건이 맞아야 산다(커널의
// FF.Cmd.buy 자체가 이미 그 조건을 강제한다) - 알림은 "그날 살펴볼 기회"를 주는 것이지
// 구매를 강제하지 않는다.
//
// 알림 정책(Procurement만 대상, 다른 레버는 항상 매일 확인하는 기존 정책 그대로):
//   alwaysAttentive : 매일 확인(상한 기준선, #25/trigger-capacity-delay-sim의 immediate와 동일)
//   edgeOnly        : episode 시작일에만 확인
//   cd7/14/21       : episode 시작일 + 그 뒤로도 episode가 이어지면 마지막 확인 후 N일마다 확인
//   neverNotified   : 전혀 확인 안 함(하한 기준선, trigger-capacity-delay-sim의 never와 동일)
//
// 판정 기준(사전 고정): 재알림이 유의미하게 손실을 줄이면 가장 긴 유효 cooldown을 쓴다.
// 7일만 효과 있으면 7일. 14일과 21일이 사실상 같으면 21일. edgeOnly와 차이 없으면
// Procurement도 edgeOnly로 간다.
import fs from 'fs';

const N_SEEDS = Number(process.argv[2] || 2000);

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

const EPS = 1, DIAG_WINDOW = 9, COOLDOWN_BUY = 60, SIG_WINDOW = 14, TH_SHORTFALL_RATIO = 0.10;
function avg(a) { return a.length ? a.reduce((x, y) => x + y, 0) / a.length : NaN; }
function dailyNetWorth() { return FF.ledger().cash + FF.sumAmt(FF.arOf()) - FF.sumAmt(FF.apOf()); }
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

// notifyMode: 'always' | 'edge' | number(cooldown일) | 'never'
function runSeed(seed, notifyMode) {
  FF.reset(seed);
  prepEngine();
  const hist = [];
  let lastIntakeBuy = -Infinity, lastSalesBuy = -Infinity, lastProcureBuy = -Infinity;
  let prevRel = FF.relOf().slice(); let pendingStanceRaise = -1;
  let prevProcureSig = false, episodeStart = null, lastNotifyDay = null;
  let procureBuys = 0;
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
      const procureSig = diag === 'procure_cap';

      // episode 경계 갱신 + 오늘이 procurement에 대한 "확인일"인지 결정.
      if (procureSig && !prevProcureSig) { episodeStart = day; lastNotifyDay = day; }
      let checkToday = false;
      if (procureSig) {
        if (notifyMode === 'always') checkToday = true;
        else if (notifyMode === 'edge') checkToday = (day === episodeStart);
        else if (notifyMode === 'never') checkToday = false;
        else if (typeof notifyMode === 'number') {
          if (day === episodeStart) checkToday = true;
          else if (day - lastNotifyDay >= notifyMode) { checkToday = true; }
        }
        if (checkToday) lastNotifyDay = day;
      }
      prevProcureSig = procureSig;

      if (checkToday && day - lastProcureBuy >= COOLDOWN_BUY) { cmd = FF.Cmd.buy('procure'); lastProcureBuy = day; procureBuys++; }
      else {
        // Procurement 이외 레버는 항상 매일 확인하는 기존 정책 그대로(공정한 비교를 위해 고정).
        if (diag === 'intake_cap' && day - lastIntakeBuy >= COOLDOWN_BUY) { cmd = FF.Cmd.buy('intake'); lastIntakeBuy = day; }
        else if (sfRatio > TH_SHORTFALL_RATIO && day - lastSalesBuy >= COOLDOWN_BUY) { cmd = FF.Cmd.buy('sales'); lastSalesBuy = day; }
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
    hist.push(FF.today());
    nwSeries.push(dailyNetWorth());
  }
  return { nwSeries, bust: FF.isBust(), procureBuys, days: hist.length };
}

const POLICIES = [
  { key: 'alwaysAttentive', mode: 'always' },
  { key: 'edgeOnly', mode: 'edge' },
  { key: 'cd7', mode: 7 },
  { key: 'cd14', mode: 14 },
  { key: 'cd21', mode: 21 },
  { key: 'neverNotified', mode: 'never' },
];

const results = {}; for (const p of POLICIES) results[p.key] = [];
let completed = 0;
for (let seed = 1; seed <= N_SEEDS; seed++) {
  const runs = {};
  let ok = true;
  for (const p of POLICIES) { runs[p.key] = runSeed(seed, p.mode); if (runs[p.key].bust) ok = false; }
  if (!ok) continue;
  completed++;
  for (const p of POLICIES) results[p.key].push(runs[p.key]);
}
console.log(`완주(6정책 전부 무파산) n=${completed}/${N_SEEDS}`);

console.log(`\n[정책별 day365 평균]`);
for (const p of POLICIES) {
  const rows = results[p.key];
  const nw = avg(rows.map(r => r.nwSeries[r.nwSeries.length - 1]));
  console.log(`  ${p.key}: netWorth=${nw.toFixed(0)} 평균procure매입횟수=${avg(rows.map(r => r.procureBuys)).toFixed(2)}`);
}

console.log(`\n[alwaysAttentive 대비 쌍차 (같은 seed) - 재알림이 상한에 얼마나 가까워지는가]`);
for (const p of POLICIES) {
  if (p.key === 'alwaysAttentive') continue;
  const diffs = [];
  for (let i = 0; i < completed; i++) {
    diffs.push(results[p.key][i].nwSeries[results[p.key][i].nwSeries.length - 1]
      - results.alwaysAttentive[i].nwSeries[results.alwaysAttentive[i].nwSeries.length - 1]);
  }
  console.log(`  ${p.key} - alwaysAttentive: 평균=${avg(diffs).toFixed(0)}`);
}

console.log(`\n[edgeOnly 대비 쌍차 (같은 seed) - 재알림이 edgeOnly보다 실제로 나은가]`);
for (const p of POLICIES) {
  if (p.key === 'edgeOnly' || p.key === 'alwaysAttentive') continue;
  const diffs = [];
  for (let i = 0; i < completed; i++) {
    diffs.push(results[p.key][i].nwSeries[results[p.key][i].nwSeries.length - 1]
      - results.edgeOnly[i].nwSeries[results.edgeOnly[i].nwSeries.length - 1]);
  }
  console.log(`  ${p.key} - edgeOnly: 평균=${avg(diffs).toFixed(0)} 양수비율=${(100 * diffs.filter(v => v > 0).length / diffs.length).toFixed(1)}%`);
}

FF.C.cost = ORIGINAL_COST; FF.C.step = ORIGINAL_STEP; FF.C.days = 30;
