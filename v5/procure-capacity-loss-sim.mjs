// 이슈 #19: procure-capacity-exposure-sim.mjs가 찾은 후보 구간(capProcure=33~36,
// cap.intake=40의 82~90%)에서 "구별되는 조달병목일"이 실제 경제적 손실인지 먼저 본다.
// 노출(존재)과 손실(크기)은 별개다(#14의 DemandSurge 선례와 같은 순서).
//
// 같은 seed에서 capProcure 제한 있음 vs capProcure 없음(=원래 게임 그대로, 아무것도
// 건드리지 않음 - exposure 스윕에서 이미 capProcure=capIntake가 항등식임을 확인했으므로
// 대조군은 그냥 native run)을 쌍차로 비교한다. 정책은 두 arm 모두 FF.Cmd.wait()만 쓴다
// (구매/판로 결정이 섞이면 손실이 조달제약 때문인지 플레이어 선택 때문인지 갈라지지 않는다).
import fs from 'fs';

const stub = 'var FF={},FV={};';
const DOMAIN = ['src-core.js','src-store.js','src-access.js','src-uistate.js','src-kernel.js','src-runner.js','src-record.js','src-engine.js','src-counter.js','src-fact.js','src-report-data.js'];
const src = stub + DOMAIN.map(f => fs.readFileSync(f, 'utf8')).join('\n') + '\nreturn FF;';
const FF = new Function(src)();

const N_SEEDS = Number(process.argv[2] || 3000);
const HORIZON = 30;
const CANDIDATES = [33, 34, 35, 36];

function avg(a) { return a.length ? a.reduce((x, y) => x + y, 0) / a.length : NaN; }
function dailyNetWorth() { return FF.ledger().cash + FF.sumAmt(FF.arOf()) - FF.sumAmt(FF.apOf()); }

function runSeed(seed, capProcure) {
  FF.reset(seed);
  const hist = [];
  for (let day = FF.run().day; day <= HORIZON; day++) {
    if (FF.isOver()) break;
    if (capProcure !== null) {
      const raw = FF.prodOf();
      FF.setProd(Math.min(raw, capProcure));
    }
    FF.stepDay(FF.Cmd.wait());
    const d = FF.today();
    hist.push({ acc: d.acc, missed: d.missed, b: d.b, rel: avg(FF.relOf()) });
  }
  return {
    hist, bust: FF.isBust(),
    cash: FF.ledger().cash, ar: FF.sumAmt(FF.arOf()), ap: FF.sumAmt(FF.apOf()),
    nw: dailyNetWorth(),
  };
}

function bCounts(hist) {
  const c = {};
  for (const d of hist) c[d.b] = (c[d.b] || 0) + 1;
  return c;
}
function pctTable(c, n) {
  return Object.entries(c).sort((a, b) => b[1] - a[1])
    .map(([k, v]) => `${k}:${(100 * v / n).toFixed(1)}%`).join(' ');
}

for (const capProcure of CANDIDATES) {
  const accDiff = [], missedDiff = [], relDiff = [], cashDiff = [], arDiff = [], apDiff = [], nwDiff = [];
  let bustCtrl = 0, bustTreat = 0, n = 0;
  const bCtrlAgg = {}, bTreatAgg = {};
  let bDayN = 0;
  for (let seed = 1; seed <= N_SEEDS; seed++) {
    const ctrl = runSeed(seed, null);
    const treat = runSeed(seed, capProcure);
    if (ctrl.bust) bustCtrl++;
    if (treat.bust) bustTreat++;
    if (ctrl.bust || treat.bust) continue;
    if (ctrl.hist.length < HORIZON || treat.hist.length < HORIZON) continue;
    n++;
    const cumAccC = ctrl.hist.reduce((s, d) => s + d.acc, 0), cumAccT = treat.hist.reduce((s, d) => s + d.acc, 0);
    const cumMissC = ctrl.hist.reduce((s, d) => s + d.missed, 0), cumMissT = treat.hist.reduce((s, d) => s + d.missed, 0);
    accDiff.push(cumAccT - cumAccC);
    missedDiff.push(cumMissT - cumMissC);
    relDiff.push(avg(treat.hist.map(d => d.rel)) - avg(ctrl.hist.map(d => d.rel)));
    cashDiff.push(treat.cash - ctrl.cash);
    arDiff.push(treat.ar - ctrl.ar);
    apDiff.push(treat.ap - ctrl.ap);
    nwDiff.push(treat.nw - ctrl.nw);
    for (const d of ctrl.hist) bCtrlAgg[d.b] = (bCtrlAgg[d.b] || 0) + 1;
    for (const d of treat.hist) bTreatAgg[d.b] = (bTreatAgg[d.b] || 0) + 1;
    bDayN += ctrl.hist.length;
  }
  console.log(`\n========== capProcure=${capProcure}(cap.intake의 ${(100 * capProcure / FF.C.cap.intake).toFixed(0)}%), 완주쌍 n=${n}/${N_SEEDS} ==========`);
  console.log(`  파산(대조/처치) = ${bustCtrl}/${bustTreat}`);
  console.log(`  30일 누적 실제입고량 쌍차 = ${avg(accDiff).toFixed(2)} (음수면 조달제약으로 덜 받았다)`);
  console.log(`  30일 누적 missed demand 쌍차 = ${avg(missedDiff).toFixed(2)} (양수면 놓친 수요가 늘었다)`);
  console.log(`  평균 관계 쌍차 = ${avg(relDiff).toFixed(4)}`);
  console.log(`  day${HORIZON} cash 쌍차 = ${avg(cashDiff).toFixed(0)}  AR 쌍차 = ${avg(arDiff).toFixed(0)}  AP 쌍차 = ${avg(apDiff).toFixed(0)}`);
  console.log(`  day${HORIZON} netWorth 쌍차 = ${avg(nwDiff).toFixed(0)} (양수비율 ${(100 * nwDiff.filter(v => v > 0).length / n).toFixed(1)}%)`);
  console.log(`  병목분포(대조군) = ${pctTable(bCtrlAgg, bDayN)}`);
  console.log(`  병목분포(처치군) = ${pctTable(bTreatAgg, bDayN)}`);
}
