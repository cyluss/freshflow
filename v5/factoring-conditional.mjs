// 이슈 #8: 조건부 factoring. runway5 문턱값을 사전에 몇 개 선언하고(사후 최적화 금지),
// factor-all(조건 충족 시 오늘 새로 생긴 AR 전액 조기현금화)과 factor-needed(부족분만큼만)
// 두 방식을 비교한다. AP는 아직 안 섞는다(순수 factoring 조건부 검증 단계).
import fs from 'fs';

const stub = 'var FF={},FV={};';
const DOMAIN = ['src-core.js','src-store.js','src-access.js','src-uistate.js','src-kernel.js','src-runner.js','src-record.js','src-engine.js','src-counter.js','src-fact.js','src-report-data.js'];
const src = stub + DOMAIN.map(f => fs.readFileSync(f, 'utf8')).join('\n') + '\nreturn FF;';
const FF = new Function(src)();

const N_SEEDS = Number(process.argv[2] || 300);
const FACTOR_RATE_PER_DAY = Number(process.argv[3] || 0.005);
const RUNWAY_N = 5;
// 사전 선언한 문턱값 후보. -Infinity=none(전혀 안 함), Infinity=always(항상 factor, 순수 정책).
const THRESHOLDS = { 'none': -Infinity, 'runway<0': 0, 'runway<10000': 10000, 'runway<20000': 20000, 'runway<40000': 40000, 'always': Infinity };
const MODES = ['factor-all', 'factor-needed'];
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

function runPolicy(seed, style, threshold, mode) {
  FF.reset(seed);
  let day1cmd = FF.Cmd.wait();
  if (style.cover !== null) day1cmd = FF.Cmd.policy(style.cover);
  else if (style.stance) day1cmd = FF.Cmd.stance(style.stance);
  FF.stepDay(day1cmd);
  if (style.cover !== null && style.stance) FF.stepDay(FF.Cmd.stance(style.stance));

  let minCash = FF.ledger().cash, forgoneQty = 0, desiredQty = 0, bust = false, factorEvents = 0, factorCostTotal = 0;
  for (let day = FF.run().day; day <= FF.C.days; day++) {
    if (FF.isOver()) break;
    const cashBeforeIntake = FF.ledger().cash;
    const budget = Math.max(0, cashBeforeIntake - FF.C.fixed);
    const payable = FF.C.farm > 0 ? Math.floor(budget / FF.C.farm) : Infinity;
    const want = desiredStored();
    forgoneQty += Math.max(0, want - Math.min(want, payable)); desiredQty += want;

    const arBefore = FF.arOf() || [];
    FF.stepDay(FF.Cmd.wait());

    const arAfter = FF.arOf() || [];
    const nNew = arAfter.length - arBefore.length;
    if (nNew > 0) {
      const kept = arAfter.slice(0, arAfter.length - nNew);
      const newOnes = arAfter.slice(arAfter.length - nNew);
      const arDueSoon = arAfter.filter(x => x.at <= day + RUNWAY_N).reduce((a, x) => a + x.amt, 0);
      const runway = FF.ledger().cash + arDueSoon - RUNWAY_N * FF.C.fixed - RUNWAY_N * FF.C.farm * want;
      const shouldFactor = runway < threshold;
      if (shouldFactor) {
        const deficit = Math.max(0, threshold === Infinity ? Infinity : threshold - runway);
        let remaining = mode === 'factor-all' ? Infinity : deficit;
        const finalKept = [];
        for (const e of newOnes) {
          const daysLeft = Math.max(0, e.at - day);
          if (remaining <= 0) { finalKept.push(e); continue; }
          const takeAmt = Math.min(e.amt, remaining);
          const cashIn = takeAmt * (1 - FACTOR_RATE_PER_DAY * daysLeft);
          FF.addCash(Math.round(cashIn));
          factorEvents++; factorCostTotal += takeAmt - cashIn;
          remaining -= takeAmt;
          if (takeAmt < e.amt) finalKept.push({ at: e.at, amt: e.amt - takeAmt });
        }
        FF.AR.value = kept.concat(finalKept);
      }
    }

    minCash = Math.min(minCash, FF.ledger().cash);
    if (FF.isBust()) bust = true;
  }
  const relAvg = FF.relOf().reduce((a, b) => a + b, 0) / FF.relOf().length;
  return {
    netWorth: FF.netWorth(FF.toKernelState()), minCash,
    forgoneRatio: desiredQty > 0 ? forgoneQty / desiredQty : 0, bust, relAvg,
    inventory: FF.inventory(), factorEvents, factorCostTotal,
  };
}

function avg(a) { return a.length ? a.reduce((x, y) => x + y, 0) / a.length : NaN; }

for (const mode of MODES) {
  console.log('\n=== ' + mode + ' (n=' + N_SEEDS + ', 초기자본 42000) ===');
  for (const [name, th] of Object.entries(THRESHOLDS)) {
    const rows = [];
    for (const style of Object.values(STYLES)) for (let seed = 1; seed <= N_SEEDS; seed++) rows.push(runPolicy(seed, style, th, mode));
    console.log(name.padEnd(16),
      'netWorth avg=' + avg(rows.map(r => r.netWorth)).toFixed(0),
      '포기비율=' + (100 * avg(rows.map(r => r.forgoneRatio))).toFixed(2) + '%',
      'bust=' + (100 * rows.filter(r => r.bust).length / rows.length).toFixed(1) + '%',
      'factor건수 평균=' + avg(rows.map(r => r.factorEvents)).toFixed(2),
      'factor비용 평균=' + avg(rows.map(r => r.factorCostTotal)).toFixed(0));
  }
}
