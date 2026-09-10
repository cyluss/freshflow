// 이슈 #28 독립 검증: 실제 커널의 FF.updateWarnings()가 #25/#27이 검증한 episode/재알림
// semantics와 정확히 같은 결과를 내는지, FF.updateWarnings()를 전혀 모르는 별도 재구현과
// 대조한다(verify-ap-factoring.mjs와 같은 "커널 vs 손계산" 패턴).
import fs from 'fs';

const stub = 'var FF={},FV={};';
const DOMAIN = ['src-core.js','src-store.js','src-access.js','src-uistate.js','src-kernel.js','src-runner.js','src-record.js','src-engine.js','src-counter.js','src-fact.js','src-report-data.js'];
const src = stub + DOMAIN.map(f => fs.readFileSync(f, 'utf8')).join('\n') + '\nreturn FF;';
const FF = new Function(src)();

let pass = 0, fail = 0;
function gate(id, desc, ok, detail) {
  console.log(`[${ok ? 'PASS' : 'FAIL'}] ${id}. ${desc}`);
  if (detail) console.log('    ' + detail);
  ok ? pass++ : fail++;
}

const HORIZON = 365;
FF.C.days = HORIZON;
const ORIGINAL_COST = Object.assign({}, FF.C.cost);
const ORIGINAL_STEP = Object.assign({}, FF.C.step);
FF.C.cost = Object.assign({}, ORIGINAL_COST, { intake: 490 });
FF.C.step = Object.assign({}, ORIGINAL_STEP, { intake: 2 });

const EPS = 1, DIAG_WINDOW = 9, SIG_WINDOW = 14, TH = 0.10, COOLDOWN_BUY = 60, RENOTIFY = { procure: 21 };
function shipShortfall(d) { return (d.sold >= d.capS - FF.C.ui.eps && d.dem > d.sold + FF.C.ui.eps) ? (d.dem - d.sold) : 0; }
function diagAt(day, hist) {
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

function prepEngine() { FF.ENGINE.value.phase.storage = FF.ENGINE.value.phase.storage || { dir: 0, n: 0 }; }

// 독립 재구현: FF.updateWarnings/ENGINE.warn을 전혀 안 쓰고 직접 episode를 추적한다.
function independentModel() {
  const w = { stance: { active: false, lastNotifyDay: null }, intake: { active: false, lastNotifyDay: null },
    sales: { active: false, lastNotifyDay: null }, procure: { active: false, lastNotifyDay: null } };
  return {
    step(day, hist) {
      const diag = diagAt(day, hist);
      const sig = {
        stance: (() => { const idx = hist.findIndex(h => h.day === day - 1); if (idx <= 0) return false; const cur = hist[idx].rel, prev = hist[idx - 1].rel; for (let c = 0; c < cur.length; c++) if (cur[c] < prev[c]) return true; return false; })(),
        intake: diag === 'intake_cap',
        sales: shortfallRatioAt(day, hist) > TH,
        procure: diag === 'procure_cap',
      };
      const fired = [];
      for (const k of Object.keys(sig)) {
        const on = sig[k], s = w[k];
        if (on && !s.active) { s.active = true; s.lastNotifyDay = day; fired.push(k); }
        else if (on && s.active) { const rn = RENOTIFY[k]; if (rn && day - s.lastNotifyDay >= rn) { s.lastNotifyDay = day; fired.push(k); } }
        else if (!on) { s.active = false; }
      }
      return { fired, snapshot: JSON.parse(JSON.stringify(w)) };
    }
  };
}

function runSeed(seed) {
  FF.reset(seed); prepEngine();
  const hist = [];
  let lastIntakeBuy = -Infinity, lastSalesBuy = -Infinity, lastProcureBuy = -Infinity;
  let pendingStanceRaise = -1, prevRel = FF.relOf().slice();
  const model = independentModel();
  let mismatches = 0, totalChecks = 0, allFired = [];
  for (let day = FF.run().day; day <= HORIZON; day++) {
    if (FF.isOver()) break;
    let cmd = FF.Cmd.wait();
    if (day === 1) {
      const opts = FF.C.contract.options; const mid = opts[Math.floor(opts.length / 2)];
      const opt = FF.contractOption(mid.x);
      if (opt && FF.ledger().cash >= opt.price) cmd = FF.Cmd.contract(mid.x);
    } else {
      const diag = day >= 10 ? diagAt(day, hist) : 'none';
      const sfRatio = shortfallRatioAt(day, hist);
      if (diag === 'intake_cap' && day - lastIntakeBuy >= COOLDOWN_BUY) { cmd = FF.Cmd.buy('intake'); lastIntakeBuy = day; }
      else if (sfRatio > TH && day - lastSalesBuy >= COOLDOWN_BUY) { cmd = FF.Cmd.buy('sales'); lastSalesBuy = day; }
      else if (diag === 'procure_cap' && day - lastProcureBuy >= COOLDOWN_BUY) { cmd = FF.Cmd.buy('procure'); lastProcureBuy = day; }
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
    FF.stepDay(cmd); // 이 안에서 FF.updateWarnings()가 이미 돌았다(day가 다음 날로 넘어간 뒤).
    const curRel = FF.relOf();
    for (let i = 0; i < curRel.length; i++) if (curRel[i] < prevRel[i]) { pendingStanceRaise = i; break; }
    prevRel = curRel.slice();
    hist.push(FF.today());

    const nextDay = FF.dayOf(); // stepDay가 이미 다음 날로 넘겨놓은 상태
    const { fired, snapshot } = model.step(nextDay, hist);
    allFired.push(...fired.map(k => `${k}@${nextDay}`));
    // FF.updateWarnings()는 게임이 끝나면 더 이상 갱신하지 않는다(실제 코드의 isOver 가드).
    // 종료 후 "다음 날" 비교는 이 가드가 없는 손계산과 어긋나는 게 정상이라 건너뛴다.
    if (FF.isOver()) continue;
    const real = FF.warnOf();
    totalChecks++;
    for (const k of Object.keys(snapshot)) {
      if (real[k].active !== snapshot[k].active || real[k].lastNotifyDay !== snapshot[k].lastNotifyDay) mismatches++;
    }
  }
  return { mismatches, totalChecks, allFired, bust: FF.isBust() };
}

let totalMismatch = 0, totalChecks = 0, seeds = 0, totalFired = 0;
const N = 300;
for (let seed = 1; seed <= N; seed++) {
  const r = runSeed(seed);
  totalMismatch += r.mismatches; totalChecks += r.totalChecks; totalFired += r.allFired.length; seeds++;
}
gate('W1', `독립 재구현과 실제 FF.updateWarnings()가 매일 일치한다(${N}시드 x 365일)`,
  totalMismatch === 0, `검사 ${totalChecks}일, 불일치 ${totalMismatch}건, 총 알림 ${totalFired}건`);

// 자동 PAUSE가 없다는 것: WARNING이 발생해도 FF.PHASE는 bust/done이 아니면 항상 play다.
{
  FF.reset(42); prepEngine();
  let sawWarnDay = false, sawAutoPause = false;
  for (let day = FF.run().day; day <= 60; day++) {
    if (FF.isOver()) break;
    FF.stepDay(FF.Cmd.wait());
    const W = FF.warnOf();
    if (Object.keys(W).some(k => W[k].active)) sawWarnDay = true;
    if (FF.isOver() && FF.run().day <= 60) sawAutoPause = true; // 60일 전에 게임이 스스로 멈췄다면 이상
  }
  gate('W2', 'WARNING이 떠도 자동으로 게임을 멈추지 않는다(60일 강제 진행 확인)', sawWarnDay && !sawAutoPause,
    `WARNING 발생 관측=${sawWarnDay}, 조기 자동정지 관측=${sawAutoPause}`);
}

// episode가 끝났다가 다시 열리면 새 알림이 나가는지(재발 가능성) - stance는 흔하므로 이걸로 확인.
{
  FF.reset(7); prepEngine();
  const notifyDays = { stance: [] };
  for (let day = FF.run().day; day <= 200; day++) {
    if (FF.isOver()) break;
    const before = FF.warnOf() ? Object.assign({}, FF.warnOf().stance) : null;
    FF.stepDay(FF.Cmd.wait());
    const after = FF.warnOf().stance;
    if (after.active && after.lastNotifyDay === FF.dayOf()) notifyDays.stance.push(FF.dayOf());
  }
  const distinctEpisodes = notifyDays.stance.length;
  gate('W3', '관계 하락 episode가 여러 번 새로 열리면 그때마다 새 알림이 나간다(200일, 재발 확인)',
    distinctEpisodes >= 2, `200일 동안 관계 하락 알림 ${distinctEpisodes}건: ${notifyDays.stance.slice(0,10).join(',')}`);
}

console.log(`\n=== 요약: ${pass} PASS, ${fail} FAIL ===`);
FF.C.cost = ORIGINAL_COST; FF.C.step = ORIGINAL_STEP; FF.C.days = 30;
process.exit(fail ? 1 : 0);
