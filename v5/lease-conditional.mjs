// 이슈 #8: Lease의 조건부 가치 검증. 모집단을 결과가 아니라 none 기준선의 exposure로
// 먼저 고정한다: "적극적매입(cover=2) 스타일에서, 아무 개입도 안 한 none 기준선에서
// 판매한도(ship) 병목이 5일 이상 연속 발생하는 시드"만 쓴다. 이 시드 목록은 buy/lease를
// 전혀 실행하지 않은 상태에서 뽑으므로 결과에 의한 사후 선택(cherry-pick)이 아니다.
import fs from 'fs';

const stub = 'var FF={},FV={};';
const DOMAIN = ['src-core.js','src-store.js','src-access.js','src-uistate.js','src-kernel.js','src-runner.js','src-record.js','src-engine.js','src-counter.js','src-fact.js','src-report-data.js'];
const src = stub + DOMAIN.map(f => fs.readFileSync(f, 'utf8')).join('\n') + '\nreturn FF;';
const FF = new Function(src)();

const N_POOL = 300;
const RECENT_WIN = 5, SHIP_THRESHOLD = 3;
const LEASE_TERM = Number(process.argv[2] || 10);
const LEASE_FACTOR = Number(process.argv[3] || 0.4);

// 1) none 기준선(적극적매입, cover=2)에서 maxRun>=5인 시드를 먼저 고정한다. buy/lease는
// 여기서 전혀 안 쓴다.
function noneRunMaxRun(seed) {
  FF.reset(seed);
  FF.stepDay(FF.Cmd.policy(2));
  let curRun = 0, maxRun = 0;
  for (let day = FF.run().day; day <= FF.C.days; day++) {
    if (FF.isOver()) break;
    FF.stepDay(FF.Cmd.wait());
    const h = FF.histOf()[FF.histOf().length - 1];
    if (h && h.b === 'ship') { curRun++; maxRun = Math.max(maxRun, curRun); }
    else curRun = 0;
  }
  return maxRun;
}
const seeds = [];
for (let seed = 1; seed <= N_POOL; seed++) if (noneRunMaxRun(seed) >= 5) seeds.push(seed);
console.log('모집단 고정(none 기준선, cover=2, maxRun>=5): ' + seeds.length + '개 시드 = [' + seeds.join(',') + ']');

// 2) 고정된 시드에서만 none/buy/lease를 비교한다(#8 2단계와 동일한 신호·지급 구조, cover=2만 추가).
function shipSignal() {
  const h = FF.histOf();
  return h.slice(-RECENT_WIN).filter(r => r.b === 'ship').length >= SHIP_THRESHOLD;
}
function shrinkSales() {
  const P = FF.plant();
  FF.PLANT.value = { cap: { intake: P.cap.intake, storage: P.cap.storage, sales: P.cap.sales - FF.C.step.sales }, buys: P.buys };
}
function runPolicy(seed, policyKey) {
  FF.reset(seed);
  FF.stepDay(FF.Cmd.policy(2));
  let boughtCount = 0, lease = null, leaseSpend = 0, buySpend = 0, missedTotal = 0;
  for (let day = FF.run().day; day <= FF.C.days; day++) {
    if (FF.isOver()) break;
    if (policyKey === 'buy' && boughtCount < FF.C.autoMax && shipSignal() && FF.ledger().cash >= FF.C.cost.sales) {
      FF.stepDay(FF.Cmd.buy('sales'));
      boughtCount++; buySpend += FF.C.cost.sales;
    } else if (policyKey === 'lease' && !lease && shipSignal()) {
      const dailyFee = Math.round(FF.C.cost.sales * LEASE_FACTOR / LEASE_TERM);
      if (FF.ledger().cash >= dailyFee) {
        FF.expand('sales');
        lease = { expireDay: day + LEASE_TERM, dailyFee };
        FF.addCash(-dailyFee); leaseSpend += dailyFee;
      }
      FF.stepDay(FF.Cmd.wait());
    } else {
      if (policyKey === 'lease' && lease) { FF.addCash(-lease.dailyFee); leaseSpend += lease.dailyFee; }
      FF.stepDay(FF.Cmd.wait());
    }
    if (policyKey === 'lease' && lease && day + 1 === lease.expireDay) { shrinkSales(); lease = null; }
    const h = FF.histOf()[FF.histOf().length - 1];
    if (h) missedTotal += h.missed || 0;
  }
  return { netWorth: FF.netWorth(FF.toKernelState()), missedTotal, leaseSpend, buySpend };
}

const POLICIES = ['none', 'buy', 'lease'];
const rows = {}; for (const p of POLICIES) rows[p] = seeds.map(seed => runPolicy(seed, p));

function avg(a) { return a.reduce((x, y) => x + y, 0) / a.length; }
console.log('\n=== 조건부 검증 (n=' + seeds.length + ', 적극적매입 cover=2, maxRun>=5 부분모집단) ===');
for (const p of POLICIES) {
  console.log(p.padEnd(6),
    'netWorth avg=' + avg(rows[p].map(r => r.netWorth)).toFixed(0),
    'missed avg=' + avg(rows[p].map(r => r.missedTotal)).toFixed(1),
    'leaseSpend avg=' + avg(rows[p].map(r => r.leaseSpend)).toFixed(0),
    'buySpend avg=' + avg(rows[p].map(r => r.buySpend)).toFixed(0));
}

console.log('\n=== 시드별 승자 ===');
const winCount = { none: 0, buy: 0, lease: 0 };
for (let i = 0; i < seeds.length; i++) {
  let best = null, bestNw = -Infinity;
  for (const p of POLICIES) if (rows[p][i].netWorth > bestNw) { bestNw = rows[p][i].netWorth; best = p; }
  winCount[best]++;
}
console.log(JSON.stringify(winCount) + ' / 전체 ' + seeds.length);

console.log('\n=== lease vs none 개별 비교 (회피 손실 vs 리스 비용) ===');
let leaseBeatsNone = 0;
for (let i = 0; i < seeds.length; i++) {
  const n = rows.none[i], l = rows.lease[i];
  const avoidedLoss = n.missedTotal - l.missedTotal; // 리스 덕에 줄어든 놓친 판매량
  const nwDiff = l.netWorth - n.netWorth;
  if (nwDiff > 0) leaseBeatsNone++;
  console.log('seed=' + seeds[i], 'none.missed=' + n.missedTotal.toFixed(1), 'lease.missed=' + l.missedTotal.toFixed(1),
    'avoidedQty=' + avoidedLoss.toFixed(1), 'leaseSpend=' + l.leaseSpend, 'netWorth차이=' + nwDiff.toFixed(0));
}
console.log('lease가 none보다 순자산이 나은 시드: ' + leaseBeatsNone + '/' + seeds.length);
