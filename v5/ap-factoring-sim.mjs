// 이슈 #8: 새 경제 기준선(초기자본 42000)에서 none/AP/factoring/both를 비교한다.
// price(sellUnit)는 순수취 단가로 이미 확정했으므로 별도 수수료 변수를 넣지 않는다.
// AP는 미래 현금 유출을 늦추고(오늘 낼 매입비를 뒤로 미룬다), factoring은 미래 현금
// 유입을 앞당긴다(만기 전 AR을 할인해서 지금 현금화한다). 둘 다 가격(price)은 그대로
// 두고 현금전환주기의 반대쪽만 조절한다. 커널 파일은 건드리지 않는다.
import fs from 'fs';

const stub = 'var FF={},FV={};';
const DOMAIN = ['src-core.js','src-store.js','src-access.js','src-uistate.js','src-kernel.js','src-runner.js','src-record.js','src-engine.js','src-counter.js','src-fact.js','src-report-data.js'];
const src = stub + DOMAIN.map(f => fs.readFileSync(f, 'utf8')).join('\n') + '\nreturn FF;';
const FF = new Function(src)();

const N_SEEDS = Number(process.argv[2] || 300);
const AP_LAG = Number(process.argv[3] || 7);
const AP_FEE = Number(process.argv[4] || 0); // 기본은 순수 시간이동(가격 불변)
const FACTOR_RATE_PER_DAY = Number(process.argv[5] || 0.005); // 만기까지 남은 하루당 할인율
const RUNWAY_N = 5;

const POLICIES = ['none', 'AP', 'factoring', 'both'];
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

function runPolicy(seed, style, policyKey) {
  FF.reset(seed);
  let day1cmd = FF.Cmd.wait();
  if (style.cover !== null) day1cmd = FF.Cmd.policy(style.cover);
  else if (style.stance) day1cmd = FF.Cmd.stance(style.stance);
  FF.stepDay(day1cmd);
  if (style.cover !== null && style.stance) FF.stepDay(FF.Cmd.stance(style.stance));

  const useAP = policyKey === 'AP' || policyKey === 'both';
  const useFactor = policyKey === 'factoring' || policyKey === 'both';
  let ap = [];
  let minCash = FF.ledger().cash, forgoneQty = 0, desiredQty = 0, bust = false;
  const days = [];
  for (let day = FF.run().day; day <= FF.C.days; day++) {
    if (FF.isOver()) break;
    const cashBefore = FF.ledger().cash;
    const budget = Math.max(0, cashBefore - FF.C.fixed);
    const payable = FF.C.farm > 0 ? Math.floor(budget / FF.C.farm) : Infinity;
    const want = desiredStored();
    forgoneQty += Math.max(0, want - Math.min(want, payable)); desiredQty += want;

    // 만기 도달한 AP를 오늘 갚는다(주문 시점의 자연 charge를 이미 상쇄해 둔 상태다).
    ap = ap.filter(x => { if (x.due <= day) { FF.addCash(-x.amt); return false; } return true; });

    const arBefore = FF.arOf() || [];
    FF.stepDay(FF.Cmd.wait());
    const r = FF.today();

    if (useAP && r.acc > 0) {
      const cost = r.acc * FF.C.farm;
      FF.addCash(cost); // 오늘 자동으로 뗀 매입비를 상쇄한다
      ap.push({ due: day + AP_LAG, amt: Math.round(cost * (1 + AP_FEE)) });
    }
    if (useFactor) {
      const arAfter = FF.arOf() || [];
      const nNew = arAfter.length - arBefore.length;
      if (nNew > 0) {
        const kept = arAfter.slice(0, arAfter.length - nNew);
        const newOnes = arAfter.slice(arAfter.length - nNew);
        let cashIn = 0;
        for (const e of newOnes) {
          const daysLeft = Math.max(0, e.at - day);
          cashIn += e.amt * (1 - FACTOR_RATE_PER_DAY * daysLeft);
        }
        FF.addCash(Math.round(cashIn));
        FF.AR.value = kept;
      }
    }

    minCash = Math.min(minCash, FF.ledger().cash);
    if (FF.isBust()) bust = true;
    const arList = FF.arOf() || [];
    const arDueSoon = arList.filter(x => x.at <= day + RUNWAY_N).reduce((a, x) => a + x.amt, 0);
    const apDueSoon = ap.filter(x => x.due <= day + RUNWAY_N).reduce((a, x) => a + x.amt, 0);
    const runway = FF.ledger().cash + arDueSoon - apDueSoon - RUNWAY_N * FF.C.fixed - RUNWAY_N * FF.C.farm * want;
    days.push({ day, forgone: (want - Math.min(want, payable)) > 0, runway });
  }
  const relAvg = FF.relOf().reduce((a, b) => a + b, 0) / FF.relOf().length;
  const outstandingAP = ap.reduce((a, x) => a + x.amt, 0);
  return {
    netWorth: FF.netWorth(FF.toKernelState()) - outstandingAP,
    minCash, forgoneRatio: desiredQty > 0 ? forgoneQty / desiredQty : 0, bust, relAvg, inventory: FF.inventory(), days,
  };
}

function avg(a) { return a.length ? a.reduce((x, y) => x + y, 0) / a.length : NaN; }
function pct(a, p) { const s = a.slice().sort((x, y) => x - y); return s.length ? s[Math.floor(s.length * p)] : NaN; }

console.log('=== none/AP/factoring/both 비교 (n=' + N_SEEDS + ', 초기자본 42000, AP_LAG=' + AP_LAG + ' AP_FEE=' + AP_FEE + ' FACTOR_RATE=' + FACTOR_RATE_PER_DAY + ') ===\n');
const allRows = {};
for (const p of POLICIES) allRows[p] = [];
for (const style of Object.values(STYLES)) {
  for (let seed = 1; seed <= N_SEEDS; seed++) {
    for (const p of POLICIES) allRows[p].push(runPolicy(seed, style, p));
  }
}
for (const p of POLICIES) {
  const rows = allRows[p];
  console.log(p.padEnd(10),
    'netWorth avg=' + avg(rows.map(r => r.netWorth)).toFixed(0),
    '포기비율=' + (100 * avg(rows.map(r => r.forgoneRatio))).toFixed(2) + '%',
    'bust=' + (100 * rows.filter(r => r.bust).length / rows.length).toFixed(1) + '%',
    '최저현금p10=' + pct(rows.map(r => r.minCash), 0.1).toFixed(0),
    'relAvg=' + avg(rows.map(r => r.relAvg)).toFixed(2),
    'inv avg=' + avg(rows.map(r => r.inventory)).toFixed(1));
}

console.log('\n=== 시드x스타일별 승자(순자산 최대, 동률은 별도 집계) ===');
const n = allRows.none.length;
const EPS_TIE = 1; // 반올림 오차 이하 차이는 동률로 본다
const wins = {}; for (const p of POLICIES) wins[p] = 0;
let ties = 0;
for (let i = 0; i < n; i++) {
  const vals = POLICIES.map(p => allRows[p][i].netWorth);
  const maxV = Math.max(...vals);
  const winners = POLICIES.filter((p, idx) => vals[idx] >= maxV - EPS_TIE);
  if (winners.length > 1) ties++; else wins[winners[0]]++;
}
for (const p of POLICIES) console.log(p.padEnd(10), 'wins=' + wins[p], 'winRate=' + (100 * wins[p] / n).toFixed(1) + '%');
console.log('전원동률=' + ties + ' (' + (100 * ties / n).toFixed(1) + '%)');

console.log('\n=== AP vs none 개별 비교 ===');
let apBetter = 0, noneBetter = 0, apTie = 0;
for (let i = 0; i < n; i++) {
  const d = allRows.AP[i].netWorth - allRows.none[i].netWorth;
  if (d > EPS_TIE) apBetter++; else if (d < -EPS_TIE) noneBetter++; else apTie++;
}
console.log('AP가 나음=' + apBetter, 'none이 나음=' + noneBetter, '동률=' + apTie);
