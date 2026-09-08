// 이슈 #8 2단계: Lease(판매 한도만) 단독 게임성 확인. none / buy / lease 세 정책.
// 커널 파일은 건드리지 않는다. buy는 실제 FF.Cmd.buy('sales')를 그대로 쓰고, lease는
// FF.expand('sales')로 즉시 확장한 뒤 만기일에 직접 FF.PLANT.value를 되돌리는 헤드리스
// 전용 오버레이다(리스 원상복구는 아직 실제 커널 기능이 아니다).
//
// #9(ex-ante identifiability)를 먼저 선언한다: 결정 신호는 "최근 5일 중 판매한도 병목
// (FF.histOf()의 b==='ship')이 며칠이었는가"다. 예측해야 하는 것은 "이 병목이 앞으로도
// 지속되는가"다. buy와 lease가 같은 신호를 쓰고 지급 방식(1회 영구 대 기간 소액)만
// 다르므로, 신호 자체의 가치가 아니라 지급 구조의 가치를 비교할 수 있다.
import fs from 'fs';

const stub = 'var FF={},FV={};';
const DOMAIN = ['src-core.js','src-store.js','src-access.js','src-uistate.js','src-kernel.js','src-runner.js','src-record.js','src-engine.js','src-counter.js','src-fact.js','src-report-data.js'];
const src = stub + DOMAIN.map(f => fs.readFileSync(f, 'utf8')).join('\n') + '\nreturn FF;';
const FF = new Function(src)();

const RECENT_WIN = 5;         // 신호를 보는 최근 창(일)
const SHIP_THRESHOLD = 3;     // 이 안에서 ship 병목이 몇 일 이상이면 신호로 본다
const LEASE_TERM = Number(process.argv[2] || 10);       // 리스 기간(일)
const LEASE_FACTOR = Number(process.argv[3] || 0.4);    // 영구매입 대비 리스 총비용 배수
const N_SEEDS = Number(process.argv[4] || 200);
const POLICIES = ['none', 'buy', 'lease'];

function shipSignal() {
  const h = FF.histOf();
  const win = h.slice(-RECENT_WIN);
  return win.filter(r => r.b === 'ship').length >= SHIP_THRESHOLD;
}
function shrinkSales() {
  const P = FF.plant();
  FF.PLANT.value = { cap: { intake: P.cap.intake, storage: P.cap.storage, sales: P.cap.sales - FF.C.step.sales }, buys: P.buys };
}

function runPolicy(seed, policyKey) {
  FF.reset(seed);
  let boughtCount = 0;      // buy: 실제 게임과 같은 상한(R.autoMax)까지 재구매 가능
  let lease = null;         // lease: {expireDay, dailyFee} 또는 null
  let leaseSpend = 0, buySpend = 0, missedTotal = 0, shipDays = 0;

  for (let day = 1; day <= FF.C.days; day++) {
    if (FF.isOver()) break;

    if (policyKey === 'buy' && boughtCount < FF.C.autoMax && day > RECENT_WIN && shipSignal() && FF.ledger().cash >= FF.C.cost.sales) {
      FF.stepDay(FF.Cmd.buy('sales'));
      boughtCount++; buySpend += FF.C.cost.sales;
    } else if (policyKey === 'lease' && !lease && day > RECENT_WIN && shipSignal()) {
      const dailyFee = Math.round(FF.C.cost.sales * LEASE_FACTOR / LEASE_TERM);
      if (FF.ledger().cash >= dailyFee) {
        FF.expand('sales');
        lease = { expireDay: day + LEASE_TERM, dailyFee };
        FF.addCash(-dailyFee); leaseSpend += dailyFee;
        FF.stepDay(FF.Cmd.wait());
      } else {
        FF.stepDay(FF.Cmd.wait());
      }
    } else {
      if (policyKey === 'lease' && lease && day <= FF.C.days) {
        FF.addCash(-lease.dailyFee); leaseSpend += lease.dailyFee;
      }
      FF.stepDay(FF.Cmd.wait());
    }

    if (policyKey === 'lease' && lease && day + 1 === lease.expireDay) {
      shrinkSales();
      lease = null;
    }

    const h = FF.histOf()[FF.histOf().length - 1];
    if (h) { missedTotal += h.missed || 0; if (h.b === 'ship') shipDays++; }
  }

  return {
    netWorth: FF.netWorth(FF.toKernelState()),
    missedTotal, shipDays, leaseSpend, buySpend,
    bust: FF.isBust(),
  };
}

const rows = {}; for (const p of POLICIES) rows[p] = [];
for (let seed = 1; seed <= N_SEEDS; seed++) for (const p of POLICIES) rows[p].push(runPolicy(seed, p));

function avg(a) { return a.reduce((x, y) => x + y, 0) / a.length; }

console.log('파라미터: leaseTerm=' + LEASE_TERM + ' leaseFactor=' + LEASE_FACTOR + ' seeds=' + N_SEEDS);
console.log('\n=== 정책별 평균 (n=' + N_SEEDS + ') ===');
for (const p of POLICIES) {
  const nw = rows[p].map(r => r.netWorth);
  console.log(p.padEnd(6),
    'netWorth avg=' + avg(nw).toFixed(0),
    'missed avg=' + avg(rows[p].map(r => r.missedTotal)).toFixed(2),
    'shipDays avg=' + avg(rows[p].map(r => r.shipDays)).toFixed(2),
    'leaseSpend avg=' + avg(rows[p].map(r => r.leaseSpend)).toFixed(0),
    'buySpend avg=' + avg(rows[p].map(r => r.buySpend)).toFixed(0),
    'bust=' + rows[p].filter(r => r.bust).length);
}

console.log('\n=== 승자 집계(순자산 최대) ===');
const wins = {}; for (const p of POLICIES) wins[p] = 0;
for (let i = 0; i < N_SEEDS; i++) {
  let best = null, bestNw = -Infinity;
  for (const p of POLICIES) if (rows[p][i].netWorth > bestNw) { bestNw = rows[p][i].netWorth; best = p; }
  wins[best]++;
}
for (const p of POLICIES) console.log(p.padEnd(6), 'wins=' + wins[p], 'winRate=' + (100 * wins[p] / N_SEEDS).toFixed(1) + '%');
