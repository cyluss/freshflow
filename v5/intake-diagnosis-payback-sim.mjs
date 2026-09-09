// 이슈 #19 첫 제품가설 end-to-end 검증: Intake capacity.
// "stock" 라벨은 쓰지 않는다. 결정 시점에 이미 매일 기록되는 wIcap(입고capacity 때문에
// 못 받은 양)·wIstore(창고 때문에 못 받은 양)·wS(현금 때문에 못 받은 양)만으로 원인을
// 구별할 수 있는지부터 본다(#9). 이 셋 중 어느 것이 지배적인지로 seed를 진단해 분류하고,
// intake-capacity가 실제 지배 원인인 집단에서만 intake 투자가 통하는지, cash가 지배
// 원인인 집단에서는 안 통하는지(판별 타당성)까지 같이 확인한다.
import fs from 'fs';

const stub = 'var FF={},FV={};';
const DOMAIN = ['src-core.js','src-store.js','src-access.js','src-uistate.js','src-kernel.js','src-runner.js','src-record.js','src-engine.js','src-counter.js','src-fact.js','src-report-data.js'];
const src = stub + DOMAIN.map(f => fs.readFileSync(f, 'utf8')).join('\n') + '\nreturn FF;';
const FF = new Function(src)();

const N_SEEDS = Number(process.argv[2] || 2000);
const HORIZON = 90;
FF.C.days = HORIZON;
const ORIGINAL_COST = Object.assign({}, FF.C.cost);
const ORIGINAL_STEP = Object.assign({}, FF.C.step);
FF.C.cost = Object.assign({}, ORIGINAL_COST, { intake: 490 });
FF.C.step = Object.assign({}, ORIGINAL_STEP, { intake: 2 });

const DIAG_WINDOW = 9;
const EXPAND_DAY = 10;
const CHECKPOINTS = [30, 45, 60, 90];
const EPS = 1;

function avg(a) { return a.length ? a.reduce((x, y) => x + y, 0) / a.length : NaN; }

// 1) 진단 가능성: day1~9 동안 기록되는 wIcap/wIstore/wS(전부 그날 결과 기록이라, "다음날
// 결정" 시점에는 이미 관측된 과거 사실이다)만으로 seed를 분류한다. stock/intake/ship 같은
// 사후 라벨(b)은 진단에 아예 쓰지 않는다.
const groups = { intake_cap: [], cash: [], storage: [], supply_only: [] };
for (let seed = 1; seed <= N_SEEDS; seed++) {
  FF.reset(seed);
  let sumCap = 0, sumStore = 0, sumCash = 0, sumWI = 0;
  for (let day = 1; day <= DIAG_WINDOW; day++) {
    if (FF.isOver()) break;
    FF.stepDay(FF.Cmd.wait());
    const d = FF.today();
    sumCap += d.wIcap; sumStore += d.wIstore; sumCash += d.wS; sumWI += d.wI;
  }
  if (sumWI <= EPS) { groups.supply_only.push(seed); continue; }
  const maxV = Math.max(sumCap, sumStore, sumCash);
  if (maxV <= EPS) { groups.supply_only.push(seed); continue; }
  if (sumCap === maxV) groups.intake_cap.push(seed);
  else if (sumCash === maxV) groups.cash.push(seed);
  else groups.storage.push(seed);
}
for (const [k, v] of Object.entries(groups)) console.log(`진단=${k.padEnd(12)} ${v.length}/${N_SEEDS}`);

function dailyNetWorth() { return FF.ledger().cash + FF.sumAmt(FF.arOf()) - FF.sumAmt(FF.apOf()); }
function prepEngine() { FF.ENGINE.value.phase.storage = FF.ENGINE.value.phase.storage || { dir: 0, n: 0 }; }

function runSeed(seed, invest) {
  FF.reset(seed);
  prepEngine();
  const nw = [], acc = [], missed = [], b = [];
  for (let day = FF.run().day; day <= HORIZON; day++) {
    if (FF.isOver()) break;
    const cmd = (day === EXPAND_DAY && invest) ? FF.Cmd.buy('intake') : FF.Cmd.wait();
    FF.stepDay(cmd);
    nw.push(dailyNetWorth()); acc.push(FF.today().acc); missed.push(FF.today().missed); b.push(FF.today().b);
  }
  return { nw, acc, missed, b, rel: FF.relOf().slice(), bust: FF.isBust() };
}

function reportGroup(name, seeds) {
  if (!seeds.length) { console.log(`\n[${name}] 대상 seed 없음`); return; }
  console.log(`\n========== 진단군: ${name} (n=${seeds.length}) ==========`);
  const diffSeries = [];
  const missedDiffSeries = [];
  const accDiffSeries = [];
  let relDiffSum = 0, relN = 0;
  let bustCtrl = 0, bustInv = 0;
  for (const seed of seeds) {
    const ctrl = runSeed(seed, false);
    const inv = runSeed(seed, true);
    if (ctrl.bust) bustCtrl++; if (inv.bust) bustInv++;
    const len = Math.min(ctrl.nw.length, inv.nw.length);
    if (len < HORIZON) continue;
    diffSeries.push(inv.nw.slice(0, len).map((v, i) => v - ctrl.nw[i]));
    missedDiffSeries.push(inv.missed.slice(0, len).map((v, i) => v - ctrl.missed[i]));
    accDiffSeries.push(inv.acc.slice(0, len).map((v, i) => v - ctrl.acc[i]));
    relDiffSum += avg(inv.rel) - avg(ctrl.rel); relN++;
  }
  console.log(`  완주 seed=${diffSeries.length}/${seeds.length}, bust(대조/투자)=${bustCtrl}/${bustInv}`);
  for (const cp of CHECKPOINTS) {
    const vals = diffSeries.map(s => s[cp - 1]);
    const missedCum = missedDiffSeries.map(s => s.slice(0, cp).reduce((a, b2) => a + b2, 0));
    const accCum = accDiffSeries.map(s => s.slice(0, cp).reduce((a, b2) => a + b2, 0));
    console.log(`  day${cp}: netWorth쌍차 avg=${avg(vals).toFixed(0)}(양수${(100 * vals.filter(v => v > 0).length / vals.length).toFixed(0)}%)` +
      ` 누적missed쌍차=${avg(missedCum).toFixed(1)} 누적실제입고쌍차=${avg(accCum).toFixed(1)}`);
  }
  let paybackN = 0;
  for (const s of diffSeries) if (s[s.length - 1] > 0 && s.slice(-10).every(v => v > 0)) paybackN++;
  console.log(`  90일말 지속양수(payback 도달)=${(100 * paybackN / diffSeries.length).toFixed(1)}%, 평균관계쌍차=${(relDiffSum / relN).toFixed(3)}`);

  // 투자 후 다음 병목 분포(후반 21~90일, 투자군 기준)
  const bCounts = {}; let bTotal = 0;
  for (const seed of seeds) {
    const inv = runSeed(seed, true);
    for (let i = 20; i < Math.min(inv.b.length, HORIZON); i++) { bCounts[inv.b[i]] = (bCounts[inv.b[i]] || 0) + 1; bTotal++; }
  }
  const top3 = Object.entries(bCounts).sort((a, b2) => b2[1] - a[1]).slice(0, 3).map(([k, v]) => `${k}:${(100 * v / bTotal).toFixed(1)}%`).join(' ');
  console.log(`  투자 후 21~90일 주요 병목: ${top3}`);
}

reportGroup('intake_cap(진단: 입고capacity가 지배원인)', groups.intake_cap);
reportGroup('cash(진단: 현금이 지배원인 - 판별타당성 대조군)', groups.cash);

FF.C.cost = ORIGINAL_COST; FF.C.step = ORIGINAL_STEP; FF.C.days = 30;
