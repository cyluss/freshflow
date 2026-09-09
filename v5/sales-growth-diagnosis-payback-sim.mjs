// 이슈 #19: Sales capacity를 Intake capacity(intake-diagnosis-payback-sim.mjs)와
// 동일한 형식으로 end-to-end 검증한다. "stock" 라벨은 여기서도 쓰지 않는다 - 판매 병목의
// 원자료는 FF.bottleneck의 ship 판정식(sold>=capS-eps && dem>sold+eps)에서 그대로 가져온
// shipShortfall(=dem-sold, 이미 매일 기록되는 sold/capS/dem으로만 계산되는 결정 시점 사실)이다.
// 매일 기록되는 wIcap(입고capacity)/wIstore(창고)/wS(현금)/shipShortfall(판매capacity) 네
// 원자료 중 무엇이 지배적인지로 seed를 진단해 분류하고, sales capacity 투자가 ship 지배
// 진단군에서 통하는지, intake가 지배원인인 집단에서는 상대적으로 약한지(판별 타당성)를 본다.
//
// sales capacity는 원래 게임에 이미 있는 유일한 구매 가능 capacity라(FF.C.cost.sales=618,
// FF.C.step.sales=2) headless patch가 필요 없다 - FF.Cmd.buy('sales')를 그대로 쓴다.
// FF.C 커널 경제 파라미터는 절대 바꾸지 않는다(FF.C.days만 90으로 늘린다, 기존 관례).
//
// bottleneck-relief-settling-sim.mjs가 잡아낸 버그를 반복하지 않는다: capacity를 N번
// 사는 것은 같은 날 FF.stepDay(buy)를 N번 부르는 게 아니라(그러면 대조군과 날짜가
// 어긋난다) 서로 다른 날에 한 번씩 순차로 사야 한다 - 이 스크립트는 투자를 day10 1회만
// 하므로 해당하지 않지만, marginal-value 스크립트를 위해 원칙을 여기 다시 적어둔다.
import fs from 'fs';

const stub = 'var FF={},FV={};';
const DOMAIN = ['src-core.js','src-store.js','src-access.js','src-uistate.js','src-kernel.js','src-runner.js','src-record.js','src-engine.js','src-counter.js','src-fact.js','src-report-data.js'];
const src = stub + DOMAIN.map(f => fs.readFileSync(f, 'utf8')).join('\n') + '\nreturn FF;';
const FF = new Function(src)();

const N_SEEDS = Number(process.argv[2] || 12000);
const HORIZON = 90;
FF.C.days = HORIZON;

const DIAG_WINDOW = 9; // Intake 스크립트와 동일한 창(day1~9)
const PERSIST_WINDOW = [10, 19]; // 투자 없이도 진단이 그 다음 10일까지 유지되는지 확인
const EXPAND_DAY = 10;
const CHECKPOINTS = [30, 45, 60, 90];
const EPS = 1;

function avg(a) { return a.length ? a.reduce((x, y) => x + y, 0) / a.length : NaN; }
function shipShortfall(d) { return (d.sold >= d.capS - FF.C.ui.eps && d.dem > d.sold + FF.C.ui.eps) ? (d.dem - d.sold) : 0; }

// 1) 진단: day1~9 동안 기록되는 wIcap/wIstore/wS/shipShortfall(전부 그날 결과 기록이라
// "다음날 결정" 시점엔 이미 관측된 과거 사실) 네 원자료만으로 seed를 분류한다.
// 2) 지속성 확인: ship_cap으로 진단된 seed 중, 투자 없이도 day10~19에 shipShortfall이
// 여전히 발생하는(사라지지 않는) 부분집합을 ship_cap_sustained로 따로 뽑는다. day1~9의
// ship 우세가 상당수 일시적(warm-up 국면에서만 나타났다가 저절로 사라짐)이라는 걸
// 사전 조사에서 확인했기 때문에(전체 ship_cap의 54.8%가 day10~19에 shipShortfall=0),
// 이 구분 없이는 "day10에 sales를 산다"는 투자가 애초에 이미 사라진 병목을 겨냥하는
// 셈이 되어 경제성이 과소평가된다.
const groups = { ship_cap: [], ship_cap_sustained: [], intake_cap: [], cash: [], storage: [], none: [] };
for (let seed = 1; seed <= N_SEEDS; seed++) {
  FF.reset(seed);
  let sumCap = 0, sumStore = 0, sumCash = 0, sumShip = 0;
  for (let day = 1; day <= DIAG_WINDOW; day++) {
    if (FF.isOver()) break;
    FF.stepDay(FF.Cmd.wait());
    const d = FF.today();
    sumCap += d.wIcap; sumStore += d.wIstore; sumCash += d.wS; sumShip += shipShortfall(d);
  }
  const maxV = Math.max(sumCap, sumStore, sumCash, sumShip);
  if (maxV <= EPS) { groups.none.push(seed); continue; }
  if (sumShip === maxV) {
    groups.ship_cap.push(seed);
    let sumShip2 = 0;
    for (let day = PERSIST_WINDOW[0]; day <= PERSIST_WINDOW[1]; day++) {
      if (FF.isOver()) break;
      FF.stepDay(FF.Cmd.wait());
      sumShip2 += shipShortfall(FF.today());
    }
    if (sumShip2 > EPS) groups.ship_cap_sustained.push(seed);
  }
  else if (sumCap === maxV) groups.intake_cap.push(seed);
  else if (sumCash === maxV) groups.cash.push(seed);
  else groups.storage.push(seed);
}
for (const [k, v] of Object.entries(groups)) console.log(`진단=${k.padEnd(20)} ${v.length}/${N_SEEDS}`);

function dailyNetWorth() { return FF.ledger().cash + FF.sumAmt(FF.arOf()) - FF.sumAmt(FF.apOf()); }
function prepEngine() { FF.ENGINE.value.phase.storage = FF.ENGINE.value.phase.storage || { dir: 0, n: 0 }; }

function runSeed(seed, invest) {
  FF.reset(seed);
  prepEngine();
  const nw = [], sold = [], missed = [], b = [];
  for (let day = FF.run().day; day <= HORIZON; day++) {
    if (FF.isOver()) break;
    const cmd = (day === EXPAND_DAY && invest) ? FF.Cmd.buy('sales') : FF.Cmd.wait();
    FF.stepDay(cmd);
    nw.push(dailyNetWorth()); sold.push(FF.today().sold); missed.push(FF.today().missed); b.push(FF.today().b);
  }
  return { nw, sold, missed, b, rel: FF.relOf().slice(), bust: FF.isBust() };
}

function reportGroup(name, seeds) {
  if (!seeds.length) { console.log(`\n[${name}] 대상 seed 없음`); return; }
  console.log(`\n========== 진단군: ${name} (n=${seeds.length}) ==========`);
  const diffSeries = [];
  const missedDiffSeries = [];
  const soldDiffSeries = [];
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
    soldDiffSeries.push(inv.sold.slice(0, len).map((v, i) => v - ctrl.sold[i]));
    relDiffSum += avg(inv.rel) - avg(ctrl.rel); relN++;
  }
  console.log(`  완주 seed=${diffSeries.length}/${seeds.length}, bust(대조/투자)=${bustCtrl}/${bustInv}`);
  for (const cp of CHECKPOINTS) {
    const vals = diffSeries.map(s => s[cp - 1]);
    const missedCum = missedDiffSeries.map(s => s.slice(0, cp).reduce((a, b2) => a + b2, 0));
    const soldCum = soldDiffSeries.map(s => s.slice(0, cp).reduce((a, b2) => a + b2, 0));
    console.log(`  day${cp}: netWorth쌍차 avg=${avg(vals).toFixed(0)}(양수${(100 * vals.filter(v => v > 0).length / vals.length).toFixed(0)}%)` +
      ` 누적missed쌍차=${avg(missedCum).toFixed(1)} 누적실제판매쌍차=${avg(soldCum).toFixed(1)}`);
  }
  let paybackN = 0;
  for (const s of diffSeries) if (s[s.length - 1] > 0 && s.slice(-10).every(v => v > 0)) paybackN++;
  console.log(`  90일말 지속양수(payback 도달)=${(100 * paybackN / diffSeries.length).toFixed(1)}%, 평균관계쌍차=${(relDiffSum / relN).toFixed(3)}`);

  // 투자 후 다음 병목 분포(후반 21~90일, 투자군 기준) - ship이 top3에서 빠지고 무엇으로
  // 이동하는지 확인한다.
  const bCounts = {}; let bTotal = 0;
  for (const seed of seeds) {
    const inv = runSeed(seed, true);
    for (let i = 20; i < Math.min(inv.b.length, HORIZON); i++) { bCounts[inv.b[i]] = (bCounts[inv.b[i]] || 0) + 1; bTotal++; }
  }
  const top3 = Object.entries(bCounts).sort((a, b2) => b2[1] - a[1]).slice(0, 3).map(([k, v]) => `${k}:${(100 * v / bTotal).toFixed(1)}%`).join(' ');
  console.log(`  투자 후 21~90일 주요 병목: ${top3}`);
}

reportGroup('ship_cap(진단: 판매capacity가 지배원인, day1-9만)', groups.ship_cap);
reportGroup('ship_cap_sustained(진단이 day10-19까지 무투자로도 유지됨)', groups.ship_cap_sustained);
reportGroup('intake_cap(진단: 입고capacity가 지배원인 - 판별타당성 대조군)', groups.intake_cap);
reportGroup('cash(진단: 현금이 지배원인 - 판별타당성 대조군)', groups.cash);

FF.C.days = 30;
