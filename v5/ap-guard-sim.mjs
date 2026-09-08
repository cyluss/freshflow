// 이슈 #8/#9 2차: K=1,2를 고정하고 alwaysAP(가능하면 항상 AP)와 guardAP(T)(runway5>=T면
// 현금 지급, 신용 보존, 아니면 AP)를 비교한다. 핵심 질문은 정상 시점에 아낀 신용이 실제
// trough에서 쓰였는가다.
import fs from 'fs';

const stub = 'var FF={},FV={};';
const DOMAIN = ['src-core.js','src-store.js','src-access.js','src-uistate.js','src-kernel.js','src-runner.js','src-record.js','src-engine.js','src-counter.js','src-fact.js','src-report-data.js'];
const src = stub + DOMAIN.map(f => fs.readFileSync(f, 'utf8')).join('\n') + '\nreturn FF;';
const FF = new Function(src)();

const N_SEEDS = Number(process.argv[2] || 300);
const AP_LAG = 7, AVG_WIN = 7, RUNWAY_N = 5;
const K_LIST = [1, 2];
const GUARD_T = { 'alwaysAP': null, 'guard(T=0)': 0, 'guard(T=10000)': 10000, 'guard(T=20000)': 20000, 'guard(T=40000)': 40000 };
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

function runPolicy(seed, style, K, guardT) {
  FF.reset(seed);
  let day1cmd = FF.Cmd.wait();
  if (style.cover !== null) day1cmd = FF.Cmd.policy(style.cover);
  else if (style.stance) day1cmd = FF.Cmd.stance(style.stance);
  FF.stepDay(day1cmd);
  if (style.cover !== null && style.stance) FF.stepDay(FF.Cmd.stance(style.stance));

  let ap = [];
  const recentSpend = [];
  let minCash = FF.ledger().cash, forgoneQty = 0, desiredQty = 0, bust = false;
  let apUsedTotal = 0, outstandingSum = 0, outstandingMax = 0, outstandingN = 0;
  let creditAtBinding = [], apUsedDuringBinding = 0;

  for (let day = FF.run().day; day <= FF.C.days; day++) {
    if (FF.isOver()) break;
    const cashBeforeIntake = FF.ledger().cash;
    const budget = Math.max(0, cashBeforeIntake - FF.C.fixed);
    const payable = FF.C.farm > 0 ? Math.floor(budget / FF.C.farm) : Infinity;
    const want = desiredStored();
    const forgoneToday = Math.max(0, want - Math.min(want, payable));
    forgoneQty += forgoneToday; desiredQty += want;

    ap = ap.filter(x => { if (x.due <= day) { FF.addCash(-x.amt); return false; } return true; });

    // runway5(오늘, AP 반영 전): 현재현금+N일내AR-N일치고정비-N일치예상매입비
    const arList = FF.arOf() || [];
    const arDueSoon = arList.filter(x => x.at <= day + RUNWAY_N).reduce((a, x) => a + x.amt, 0);
    const runway5 = FF.ledger().cash + arDueSoon - RUNWAY_N * FF.C.fixed - RUNWAY_N * FF.C.farm * want;

    const avgSpend = recentSpend.length ? recentSpend.reduce((a, b) => a + b, 0) / recentSpend.length : 0;
    const creditLimit = avgSpend * K;
    const outstandingBefore = ap.reduce((a, x) => a + x.amt, 0);
    const availableCredit = Math.max(0, creditLimit - outstandingBefore);
    if (forgoneToday > 0) creditAtBinding.push(availableCredit);

    const wantsAP = guardT === null ? true : runway5 < guardT;

    FF.stepDay(FF.Cmd.wait());
    const r = FF.today();
    const cost = r.acc * FF.C.farm;

    let apPortion = 0;
    if (wantsAP) apPortion = Math.min(cost, availableCredit);
    if (apPortion > 0) {
      FF.addCash(apPortion);
      ap.push({ due: day + AP_LAG, amt: apPortion });
      apUsedTotal += apPortion;
      if (forgoneToday > 0 || runway5 < 0) apUsedDuringBinding += apPortion;
    }

    recentSpend.push(cost); if (recentSpend.length > AVG_WIN) recentSpend.shift();
    minCash = Math.min(minCash, FF.ledger().cash);
    if (FF.isBust()) bust = true;
    const outstandingAfter = ap.reduce((a, x) => a + x.amt, 0);
    outstandingSum += outstandingAfter; outstandingMax = Math.max(outstandingMax, outstandingAfter); outstandingN++;
  }
  const outstandingAP = ap.reduce((a, x) => a + x.amt, 0);
  return {
    netWorth: FF.netWorth(FF.toKernelState()) - outstandingAP,
    forgoneRatio: desiredQty > 0 ? forgoneQty / desiredQty : 0, bust,
    apUsedTotal, avgOutstanding: outstandingN ? outstandingSum / outstandingN : 0, maxOutstanding: outstandingMax,
    creditAtBinding, apUsedDuringBinding,
  };
}

function avg(a) { return a.length ? a.reduce((x, y) => x + y, 0) / a.length : NaN; }

for (const K of K_LIST) {
  console.log('\n=== K=' + K + ' (n=' + N_SEEDS + ') ===');
  const allRows = {};
  for (const name of Object.keys(GUARD_T)) allRows[name] = [];
  for (const style of Object.values(STYLES)) {
    for (let seed = 1; seed <= N_SEEDS; seed++) {
      for (const [name, T] of Object.entries(GUARD_T)) allRows[name].push(runPolicy(seed, style, K, T));
    }
  }
  for (const [name, T] of Object.entries(GUARD_T)) {
    const rows = allRows[name];
    const allCreditAtBinding = rows.flatMap(r => r.creditAtBinding);
    console.log(name.padEnd(16),
      'netWorth avg=' + avg(rows.map(r => r.netWorth)).toFixed(0),
      '포기비율=' + (100 * avg(rows.map(r => r.forgoneRatio))).toFixed(2) + '%',
      'bust=' + (100 * rows.filter(r => r.bust).length / rows.length).toFixed(1) + '%',
      'AP사용액=' + avg(rows.map(r => r.apUsedTotal)).toFixed(0),
      '평균outstanding=' + avg(rows.map(r => r.avgOutstanding)).toFixed(0),
      '제약시점 가용신용 평균=' + (allCreditAtBinding.length ? avg(allCreditAtBinding).toFixed(0) : 'N/A') + '(n=' + allCreditAtBinding.length + ')',
      '위기중 AP사용액=' + avg(rows.map(r => r.apUsedDuringBinding)).toFixed(0));
  }
}
