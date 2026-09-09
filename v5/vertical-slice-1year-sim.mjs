// 이슈 #21: 1년 Vertical Slice. 새 경제규칙을 추가하지 않는다 - 이미 검증된 action space와
// 성장 레버(Intake capacity, #19)만 그대로 써서 365일 동안 의미 있는 경영 사이클이 여러 번
// 자연 발생하는지 본다. Contract/Factoring/Stance는 이번 1차 통합시험에서는 기본 게임
// 그대로(수동 개입 없음) 두고, 유일한 능동 결정은 분기 진단 기반 Intake 재투자다 - 핵심
// 가설(#19)이 자본배분 루프 하나로도 365일 동안 살아 있는지부터 격리해서 본다.
//
// 진단은 intake-diagnosis-payback-sim.mjs와 동일한 방식(day 구간의 wIcap/wIstore/wS
// 원자료 합, "b" 라벨 아님)을 4분기 경계에서 반복한다. 실패조건은 사용자가 명시한 그대로:
// "1년으로 늘렸는데 30일 운영을 열두 번 반복할 뿐"인지 - 분기별 병목분포가 실제로
// 달라지는지, 같은 결정이 기계적으로 반복되는지를 직접 측정한다.
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

const EPS = 1;
const DIAG_WINDOW = 9; // 분기 결정일 직전 9일
const QUARTERS = [10, 101, 192, 283]; // 사이클 시작일(intake-marginal-value-sim.mjs와 같은 간격 구조를 4분기로 확장)

function avg(a) { return a.length ? a.reduce((x, y) => x + y, 0) / a.length : NaN; }
function dailyNetWorth() { return FF.ledger().cash + FF.sumAmt(FF.arOf()) - FF.sumAmt(FF.apOf()); }
function prepEngine() { FF.ENGINE.value.phase.storage = FF.ENGINE.value.phase.storage || { dir: 0, n: 0 }; }
function shipShortfall(d) { return (d.sold >= d.capS - FF.C.ui.eps && d.dem > d.sold + FF.C.ui.eps) ? (d.dem - d.sold) : 0; }

// 분기 진단: 결정일 직전 DIAG_WINDOW일의 wIcap/wIstore/wS(+ship 참고용)를 합산해 최댓값으로 분류.
// 이건 그 분기에 "투자할 근거가 있는가"를 보는 것이지 b 라벨을 쓰지 않는다(#19 방법론 재사용).
function diagnose(day) {
  let sumCap = 0, sumStore = 0, sumCash = 0, sumShip = 0;
  const from = Math.max(1, day - DIAG_WINDOW);
  const hist = FF.histOf();
  for (let i = 0; i < hist.length; i++) {
    const d = hist[i];
    if (d.day < from || d.day >= day) continue;
    sumCap += d.wIcap; sumStore += d.wIstore; sumCash += d.wS; sumShip += shipShortfall(d);
  }
  const maxV = Math.max(sumCap, sumStore, sumCash, sumShip);
  if (maxV <= EPS) return 'none';
  if (sumCap === maxV) return 'intake_cap';
  if (sumShip === maxV) return 'ship_cap';
  if (sumStore === maxV) return 'storage';
  return 'cash';
}

function bCensus(hist, fromDay, toDay) {
  const c = {};
  let n = 0;
  for (const d of hist) {
    if (d.day < fromDay || d.day > toDay) continue;
    c[d.b] = (c[d.b] || 0) + 1; n++;
  }
  const top = Object.entries(c).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k}:${(100 * v / n).toFixed(0)}%`).join(' ');
  return { top, n };
}

function runSeed(seed, reactive) {
  FF.reset(seed);
  prepEngine();
  const decisions = [];
  const quarterCensus = [];
  const nwByQuarter = [];
  const relByQuarter = [];
  const dioByQuarter = [];
  let qStart = 1;
  for (let day = FF.run().day; day <= HORIZON; day++) {
    if (FF.isOver()) break;
    let cmd = FF.Cmd.wait();
    const qi = QUARTERS.indexOf(day);
    if (qi !== -1 && reactive) {
      const diag = diagnose(day);
      if (diag === 'intake_cap') { cmd = FF.Cmd.buy('intake'); decisions.push({ day, diag, action: 'buy_intake' }); }
      else decisions.push({ day, diag, action: 'none' });
    }
    FF.stepDay(cmd);
    // 분기 경계(다음 QUARTERS 시작일 또는 HORIZON)에서 직전 구간을 요약
    const nextBoundary = QUARTERS.find(q => q > qStart) || (HORIZON + 1);
    if (day === nextBoundary - 1 || day === HORIZON) {
      const hist = FF.histOf();
      quarterCensus.push(bCensus(hist, qStart, day));
      nwByQuarter.push(dailyNetWorth());
      relByQuarter.push(avg(FF.relOf()));
      const dioSlice = hist.filter(d => d.day >= qStart && d.day <= day);
      let sw = 0, su = 0;
      for (const d of dioSlice) { (d.ageMix || []).forEach(({ a, q }) => { sw += a * q; su += q; }); sw += FF.C.ttl * d.wT; su += d.wT; }
      dioByQuarter.push(su > 0 ? sw / su : 0);
      qStart = day + 1;
    }
  }
  return { decisions, quarterCensus, nwByQuarter, relByQuarter, dioByQuarter, bust: FF.isBust(), nw: dailyNetWorth() };
}

let completed = 0, bustReactive = 0, bustCtrl = 0;
const decisionCounts = [0, 0, 0, 0]; // 분기별 실제 투자 횟수
const diagAtQuarter = [{}, {}, {}, {}];
const repeatSameAction = []; // seed별: 4분기 결정이 전부 같은 진단이었는가(단순 반복 여부)
const finalDiff = [];
const quarterNwSeries = [];
const quarterRelSeries = [];
const quarterDioSeries = [];
const quarterDiffSeries = []; // 기간별 쌍차(반응형-무성장) - 성장이 특정 시점에 몰리는지 계속 나는지 확인
const censusExamples = [];

for (let seed = 1; seed <= N_SEEDS; seed++) {
  const r = runSeed(seed, true);
  const c = runSeed(seed, false);
  if (r.bust) bustReactive++;
  if (c.bust) bustCtrl++;
  if (r.bust || c.bust) continue;
  completed++;
  for (let qi = 0; qi < 4; qi++) {
    const dec = r.decisions[qi];
    if (dec) {
      diagAtQuarter[qi][dec.diag] = (diagAtQuarter[qi][dec.diag] || 0) + 1;
      if (dec.action === 'buy_intake') decisionCounts[qi]++;
    }
  }
  const diags = r.decisions.map(d => d.diag);
  repeatSameAction.push(diags.every(d => d === diags[0]));
  finalDiff.push(r.nw - c.nw);
  quarterNwSeries.push(r.nwByQuarter);
  quarterRelSeries.push(r.relByQuarter);
  quarterDioSeries.push(r.dioByQuarter);
  quarterDiffSeries.push(r.nwByQuarter.map((v, i) => v - c.nwByQuarter[i]));
  if (seed <= 5) censusExamples.push({ seed, decisions: r.decisions, census: r.quarterCensus.map(x => x.top) });
}

console.log(`완주(양쪽 무파산) n=${completed}/${N_SEEDS}, 파산(반응형/무성장) = ${bustReactive}/${bustCtrl}`);

console.log(`\n분기별 진단 분포(반응형 정책 기준):`);
for (let qi = 0; qi < 4; qi++) {
  const total = Object.values(diagAtQuarter[qi]).reduce((a, b) => a + b, 0);
  const dist = Object.entries(diagAtQuarter[qi]).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k}:${(100 * v / total).toFixed(1)}%`).join(' ');
  console.log(`  Q${qi + 1}(day${QUARTERS[qi]}): ${dist}  (그중 실제 투자=${(100 * decisionCounts[qi] / total).toFixed(1)}%)`);
}

console.log(`\n4분기 내내 같은 진단이 반복된 seed 비율(단순반복 의심) = ${(100 * repeatSameAction.filter(Boolean).length / completed).toFixed(1)}%`);

console.log(`\n분기별 병목 구성(seed 1~5 예시, 반응형):`);
for (const ex of censusExamples) {
  console.log(`  seed=${ex.seed} 결정=${JSON.stringify(ex.decisions.map(d => d.diag + (d.action === 'buy_intake' ? '→투자' : '')))}`);
  ex.census.forEach((c, i) => console.log(`    Q${i + 1}: ${c}`));
}

console.log(`\n분기말 netWorth 평균 추이(반응형): ${quarterNwSeries[0].map((_, qi) => Math.round(avg(quarterNwSeries.map(s => s[qi])))).join(' → ')}`);
console.log(`분기말 관계 평균 추이(반응형): ${quarterRelSeries[0].map((_, qi) => avg(quarterRelSeries.map(s => s[qi])).toFixed(3)).join(' → ')}`);
console.log(`분기말 DIO 평균 추이(반응형): ${quarterDioSeries[0].map((_, qi) => avg(quarterDioSeries.map(s => s[qi])).toFixed(3)).join(' → ')}`);

console.log(`\n기간말 netWorth 쌍차(반응형-무성장) 평균 추이: ${quarterDiffSeries[0].map((_, qi) => Math.round(avg(quarterDiffSeries.map(s => s[qi])))).join(' → ')}`);
console.log(`365일말 netWorth 쌍차(반응형-무성장) 평균 = ${avg(finalDiff).toFixed(0)}  양수비율 = ${(100 * finalDiff.filter(v => v > 0).length / completed).toFixed(1)}%`);

FF.C.cost = ORIGINAL_COST; FF.C.step = ORIGINAL_STEP; FF.C.days = 30;
