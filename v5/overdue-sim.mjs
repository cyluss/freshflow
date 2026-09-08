// 이슈 #12: AP(7일/0%/K=1, #11 확정안)와 factoring(#8 검증값, 하루 0.5%)을 고정하고
// 연체비용(overdueRate)만 스윕한다. 목표는 최적 연체율을 찾는 게 아니라 factoring과
// 연체 사이에 상태에 따라 갈리는 비지배 영역이 있는지, 그리고 사전에 식별 가능한지를
// 보는 것이다.
import fs from 'fs';

const stub = 'var FF={},FV={};';
const DOMAIN = ['src-core.js','src-store.js','src-access.js','src-uistate.js','src-kernel.js','src-runner.js','src-record.js','src-engine.js','src-counter.js','src-fact.js','src-report-data.js'];
const src = stub + DOMAIN.map(f => fs.readFileSync(f, 'utf8')).join('\n') + '\nreturn FF;';
const FF = new Function(src)();

const N_SEEDS = Number(process.argv[2] || 300);
const AP_TERM = 7, AP_K = 1, FACTOR_RATE_PER_DAY = 0.005, MATURITY_WIN = 7;
// 0/낮음/중간/높음/매우높음. 하루 복리율이라 연체 며칠이면 금방 커진다.
const OVERDUE_RATES = { '0%': 0, '낮음(1%/일)': 0.01, '중간(3%/일)': 0.03, '높음(6%/일)': 0.06, '매우높음(10%/일)': 0.10 };
const POLICIES = ['overdue', 'factor-all-risk', 'factor-needed', 'runway-factor'];
const STYLES = {
  '소극적(cover=1)': { cover: 1, stance: null },
  '기본(cover=1.5)': { cover: null, stance: null },
  '적극적매입(cover=2)': { cover: 2, stance: null },
  '프랜차이즈우선': { cover: null, stance: [1, 2, 1] },
  '도매우선': { cover: null, stance: [1, 1, 2] },
};

function desiredStored() {
  const cap = FF.capsOf(), M = FF.marketOf();
  const need = FF.intakeNeed(M.di, cap.sales, FF.coverOf(), FF.inventory(), FF.C);
  const prod = FF.prodOf();
  const baseAcc = Math.min(prod, cap.intake, need);
  const freeNow = Math.max(0, cap.storage - FF.inventory());
  return Math.min(baseAcc, freeNow);
}

// maturityRunway: 가장 이른 AP 만기까지의 현금 여유. AP 만기 자체를 명시적으로 뺀다는 점이
// #8의 runway5(고정 5일 창)와 다르다.
function maturityRunway(ap, cash, day, want) {
  const nextDue = ap.length ? Math.min(...ap.map(x => x.due)) : day + MATURITY_WIN;
  const horizon = Math.max(1, Math.min(MATURITY_WIN, nextDue - day));
  const arList = FF.arOf() || [];
  const arDue = arList.filter(x => x.at <= day + horizon).reduce((a, x) => a + x.amt, 0);
  const apDue = ap.filter(x => x.due <= day + horizon).reduce((a, x) => a + x.amt, 0);
  return cash + arDue - apDue - horizon * FF.C.fixed - horizon * FF.C.farm * want;
}

function factorAmount(needed, day) {
  // 현재 보유 AR 중 만기가 가까운 것부터 필요한 만큼만(또는 전액) 조기현금화한다.
  const arList = (FF.arOf() || []).slice().sort((a, b) => a.at - b.at);
  let remaining = needed, cashIn = 0;
  const kept = [];
  for (const e of arList) {
    if (remaining <= 0) { kept.push(e); continue; }
    const take = Math.min(e.amt, remaining);
    const daysLeft = Math.max(0, e.at - day);
    cashIn += take * (1 - FACTOR_RATE_PER_DAY * daysLeft);
    remaining -= take;
    if (take < e.amt) kept.push({ at: e.at, amt: e.amt - take });
  }
  FF.AR.value = kept;
  if (cashIn > 0) FF.addCash(Math.round(cashIn));
  return cashIn;
}
function totalAR() { return (FF.arOf() || []).reduce((a, x) => a + x.amt, 0); }

function runPolicy(seed, style, overdueRate, policyKey) {
  FF.reset(seed);
  let day1cmd = FF.Cmd.wait();
  if (style.cover !== null) day1cmd = FF.Cmd.policy(style.cover);
  else if (style.stance) day1cmd = FF.Cmd.stance(style.stance);
  FF.stepDay(day1cmd);
  if (style.cover !== null && style.stance) FF.stepDay(FF.Cmd.stance(style.stance));

  let ap = [], overdueBalance = 0;
  const recentSpend = [];
  let minCash = FF.ledger().cash, forgoneQty = 0, desiredQty = 0, bust = false;
  let overdueDaysTotal = 0, overdueCostTotal = 0, maxOverdue = 0, everOverdue = false;
  let factorCostTotal = 0, factorEvents = 0;
  let apNormalRepay = 0, apTotalDue = 0;
  const decisions = []; // #9: {costFactor, costOverdue}

  for (let day = FF.run().day; day <= FF.C.days; day++) {
    if (FF.isOver()) break;
    const cashBeforeIntake = FF.ledger().cash;
    const budget0 = Math.max(0, cashBeforeIntake - FF.C.fixed);
    const payable0 = FF.C.farm > 0 ? Math.floor(budget0 / FF.C.farm) : Infinity;
    const want = desiredStored();
    forgoneQty += Math.max(0, want - Math.min(want, payable0)); desiredQty += want;

    // 만기 AP 처리: 갚을 수 있으면 전액 상환, 모자라면 남은 만큼만 갚고 나머지는 연체로 전환.
    const dueToday = ap.filter(x => x.due <= day);
    ap = ap.filter(x => x.due > day);
    for (const e of dueToday) {
      apTotalDue += e.amt;
      const avail = Math.max(0, FF.ledger().cash);
      const pay = Math.min(e.amt, avail);
      FF.addCash(-pay);
      const short = e.amt - pay;
      if (short > 0) { overdueBalance += short; everOverdue = true; } else { apNormalRepay += e.amt; }
    }
    if (overdueBalance > 0) {
      const interest = overdueBalance * overdueRate;
      overdueBalance += interest; overdueCostTotal += interest;
      overdueDaysTotal++; maxOverdue = Math.max(maxOverdue, overdueBalance);
      // 연체는 여유 현금이 생긴다고 즉시 자동 상환되지 않는다(그러면 하루도 못 버티고
      // 사라져서 어떤 연체율을 걸어도 비용이 무의미해진다). 정산은 게임 종료 시 부채로
      // 일괄 차감한다(#8의 고정 facility 실험과 같은 방식) - 연체율의 효과가 온전히
      // netWorth에 반영되게 하기 위해서다.
    }

    // #9 관측: 다가오는 AP 만기 위험을 사전에 본다.
    const runway = maturityRunway(ap, FF.ledger().cash, day, want);
    const nextDue = ap.length ? Math.min(...ap.map(x => x.due)) : null;
    const shortfallPred = Math.max(0, -runway);
    // runway-factor는 실제 부족이 확정되기 전, 느슨한 문턱값(RUNWAY_THRESHOLD)에서부터
    // 미리 손을 쓴다. factor-needed/factor-all-risk는 부족이 예측된 순간에만 반응한다 -
    // 이 시점 차이가 세 정책을 실제로 다르게 만든다.
    const RUNWAY_THRESHOLD = 10000;
    if (nextDue !== null) {
      const arAvail = totalAR();
      if (shortfallPred > 0) {
        const costFactor = Math.min(shortfallPred, arAvail) * FACTOR_RATE_PER_DAY * 3;
        const costOverdue = shortfallPred * overdueRate;
        decisions.push({ costFactor, costOverdue, day });
      }

      if (policyKey === 'factor-all-risk' && shortfallPred > 0) {
        const got = factorAmount(arAvail, day); if (got > 0) { factorEvents++; factorCostTotal += arAvail - got; }
      } else if (policyKey === 'factor-needed' && shortfallPred > 0) {
        const need = Math.min(shortfallPred, arAvail);
        const got = factorAmount(need, day); if (got > 0) { factorEvents++; factorCostTotal += need - got; }
      } else if (policyKey === 'runway-factor' && runway < RUNWAY_THRESHOLD) {
        const need = Math.min(Math.max(shortfallPred, RUNWAY_THRESHOLD - runway), arAvail);
        const got = factorAmount(need, day); if (got > 0) { factorEvents++; factorCostTotal += need - got; }
      }
      // 'overdue' 정책은 아무것도 안 하고 연체를 감수한다.
    }

    // 오늘 매입: AP 자동 사용(#11 모델).
    FF.stepDay(FF.Cmd.wait());
    const r = FF.today();
    const cost = r.acc * FF.C.farm;
    const avgSpend = recentSpend.length ? recentSpend.reduce((a, b) => a + b, 0) / recentSpend.length : 0;
    const creditLimit = avgSpend * AP_K;
    const outstandingAP = ap.reduce((a, x) => a + x.amt, 0);
    const availableCredit = Math.max(0, creditLimit - outstandingAP);
    const apPortion = Math.min(cost, availableCredit);
    if (apPortion > 0) { FF.addCash(apPortion); ap.push({ due: day + AP_TERM, amt: apPortion }); }
    recentSpend.push(cost); if (recentSpend.length > AP_TERM) recentSpend.shift();

    minCash = Math.min(minCash, FF.ledger().cash);
    if (FF.isBust()) bust = true;
  }
  const outstandingAP = ap.reduce((a, x) => a + x.amt, 0);
  const relAvg = FF.relOf().reduce((a, b) => a + b, 0) / FF.relOf().length;
  return {
    netWorth: FF.netWorth(FF.toKernelState()) - outstandingAP - overdueBalance,
    forgoneRatio: desiredQty > 0 ? forgoneQty / desiredQty : 0, bust, relAvg,
    everOverdue, overdueDaysTotal, maxOverdue, overdueCostTotal, factorCostTotal, factorEvents,
    apRepayRate: apTotalDue > 0 ? apNormalRepay / apTotalDue : 1, decisions,
  };
}

function avg(a) { return a.length ? a.reduce((x, y) => x + y, 0) / a.length : NaN; }

for (const [rateName, rate] of Object.entries(OVERDUE_RATES)) {
  console.log('\n=== 연체율 ' + rateName + ' (n=' + N_SEEDS + ') ===');
  const allRows = {};
  for (const p of POLICIES) allRows[p] = [];
  for (const style of Object.values(STYLES)) {
    for (let seed = 1; seed <= N_SEEDS; seed++) {
      for (const p of POLICIES) allRows[p].push(runPolicy(seed, style, rate, p));
    }
  }
  for (const p of POLICIES) {
    const rows = allRows[p];
    console.log(p.padEnd(16),
      'netWorth=' + avg(rows.map(r => r.netWorth)).toFixed(0),
      '연체발생=' + (100 * rows.filter(r => r.everOverdue).length / rows.length).toFixed(1) + '%',
      '연체일수avg=' + avg(rows.map(r => r.overdueDaysTotal)).toFixed(2),
      'maxOverdue avg=' + avg(rows.map(r => r.maxOverdue)).toFixed(0),
      '연체비용=' + avg(rows.map(r => r.overdueCostTotal)).toFixed(0),
      'factor비용=' + avg(rows.map(r => r.factorCostTotal)).toFixed(0),
      'AP정상상환율=' + (100 * avg(rows.map(r => r.apRepayRate))).toFixed(1) + '%',
      '포기비율=' + (100 * avg(rows.map(r => r.forgoneRatio))).toFixed(2) + '%',
      'bust=' + (100 * rows.filter(r => r.bust).length / rows.length).toFixed(1) + '%');
  }

  // 비지배 영역: overdue와 factor-needed 개별 비교
  let overdueBetter = 0, factorBetter = 0, tie = 0;
  const EPS = 1;
  for (let i = 0; i < allRows.overdue.length; i++) {
    const d = allRows['factor-needed'][i].netWorth - allRows.overdue[i].netWorth;
    if (d > EPS) factorBetter++; else if (d < -EPS) overdueBetter++; else tie++;
  }
  console.log('factor-needed vs overdue: factoring이 나음=' + factorBetter + ' 연체가 나음=' + overdueBetter + ' 동률=' + tie);

  // #9: costFactor<costOverdue였던 결정 비율과, 해당 시드에서 factor-needed가 overdue를 이겼는지의 관계
  const predictFactorFrac = [], seedFactorWins = [];
  for (let i = 0; i < allRows.overdue.length; i++) {
    const ds = allRows['factor-needed'][i].decisions;
    if (!ds.length) continue;
    const fracFactorCheaper = ds.filter(d => d.costFactor < d.costOverdue).length / ds.length;
    predictFactorFrac.push(fracFactorCheaper);
    seedFactorWins.push(allRows['factor-needed'][i].netWorth > allRows.overdue[i].netWorth ? 1 : 0);
  }
  if (predictFactorFrac.length > 5) {
    const hiGroup = [], loGroup = [];
    for (let i = 0; i < predictFactorFrac.length; i++) (predictFactorFrac[i] >= 0.5 ? hiGroup : loGroup).push(seedFactorWins[i]);
    console.log('#9: costFactor<costOverdue 비율>=0.5인 시드의 factoring 승률=' + (hiGroup.length ? (100 * avg(hiGroup)).toFixed(1) : 'N/A') + '%(n=' + hiGroup.length + ')',
      '  <0.5인 시드의 factoring 승률=' + (loGroup.length ? (100 * avg(loGroup)).toFixed(1) : 'N/A') + '%(n=' + loGroup.length + ')');
  }
}
