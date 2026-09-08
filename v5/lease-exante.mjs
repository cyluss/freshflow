// 이슈 #8/#9: Lease 결정 시점에 관측 가능한 "관계 여유도" 신호가 실제 lease-none 성과
// 차이를 사전에 구별하는지 검증한다. 모집단은 lease-conditional.mjs와 같은 27개 고정
// 시드(적극적매입 cover=2, none 기준선 maxRun>=5)를 그대로 쓴다.
//
// 신호 후보 두 가지를 리스 최초 개입일(그 날의 개입 전, 즉 전날까지의 관측)에서 계산한다.
//   minBuffer   = min_채널(최근 3일 평균 toCh[채널] - quota[채널]*0.5)
//                 채널별 관계 하락 임계치까지 남은 여유. 작을수록(0에 가깝거나 음수) 위험.
//   daysOfCover = 현재 재고 / 최근 3일 평균 총판매량. 작을수록 재고 소진이 임박했다는 뜻.
// 둘 다 FF.histOf()/FF.inventory() 기반이라 플레이어가 화면에서 보는 것과 같은 정보다.
import fs from 'fs';

const stub = 'var FF={},FV={};';
const DOMAIN = ['src-core.js','src-store.js','src-access.js','src-uistate.js','src-kernel.js','src-runner.js','src-record.js','src-engine.js','src-counter.js','src-fact.js','src-report-data.js'];
const src = stub + DOMAIN.map(f => fs.readFileSync(f, 'utf8')).join('\n') + '\nreturn FF;';
const FF = new Function(src)();

const RECENT_WIN = 5, SHIP_THRESHOLD = 3, LEASE_TERM = 10, LEASE_FACTOR = 0.4;
const seeds = [4, 10, 16, 23, 30, 36, 48, 65, 67, 68, 104, 112, 115, 121, 132, 152, 161, 164, 169, 178, 235, 240, 242, 250, 264, 279, 299];

function shipSignal() {
  const h = FF.histOf();
  return h.slice(-RECENT_WIN).filter(r => r.b === 'ship').length >= SHIP_THRESHOLD;
}
function shrinkSales() {
  const P = FF.plant();
  FF.PLANT.value = { cap: { intake: P.cap.intake, storage: P.cap.storage, sales: P.cap.sales - FF.C.step.sales }, buys: P.buys };
}
function signalAt() {
  const h = FF.histOf().slice(-3);
  const nch = FF.C.channels.length;
  const bufs = [];
  for (let ci = 0; ci < nch; ci++) {
    const avgToCh = h.reduce((s, r) => s + r.toCh[ci], 0) / h.length;
    bufs.push(avgToCh - FF.C.channels[ci].quota * 0.5);
  }
  const avgSold = h.reduce((s, r) => s + r.sold, 0) / h.length;
  return { minBuffer: Math.min(...bufs), daysOfCover: FF.inventory() / Math.max(1, avgSold) };
}

function runPolicy(seed, policyKey) {
  FF.reset(seed);
  FF.stepDay(FF.Cmd.policy(2));
  let lease = null, signal = null;
  for (let day = FF.run().day; day <= FF.C.days; day++) {
    if (FF.isOver()) break;
    if (policyKey === 'lease' && !lease && shipSignal()) {
      if (!signal) signal = signalAt(); // 최초 개입일, 개입 직전 상태로 신호를 고정한다
      const dailyFee = Math.round(FF.C.cost.sales * LEASE_FACTOR / LEASE_TERM);
      if (FF.ledger().cash >= dailyFee) {
        FF.expand('sales'); lease = { expireDay: day + LEASE_TERM, dailyFee }; FF.addCash(-dailyFee);
      }
      FF.stepDay(FF.Cmd.wait());
    } else {
      if (policyKey === 'lease' && lease) FF.addCash(-lease.dailyFee);
      FF.stepDay(FF.Cmd.wait());
    }
    if (policyKey === 'lease' && lease && day + 1 === lease.expireDay) { shrinkSales(); lease = null; }
  }
  return { netWorth: FF.netWorth(FF.toKernelState()), signal };
}

function corr(xs, ys) {
  const n = xs.length, mx = xs.reduce((a, b) => a + b, 0) / n, my = ys.reduce((a, b) => a + b, 0) / n;
  let sxy = 0, sxx = 0, syy = 0;
  for (let i = 0; i < n; i++) { const dx = xs[i] - mx, dy = ys[i] - my; sxy += dx * dy; sxx += dx * dx; syy += dy * dy; }
  return sxy / Math.sqrt(sxx * syy);
}

const rows = [];
for (const seed of seeds) {
  const none = runPolicy(seed, 'none');
  const lease = runPolicy(seed, 'lease');
  const diff = lease.netWorth - none.netWorth;
  rows.push({ seed, minBuffer: lease.signal.minBuffer, daysOfCover: lease.signal.daysOfCover, diff, win: diff > 0 });
  console.log('seed=' + String(seed).padStart(3), 'minBuffer=' + lease.signal.minBuffer.toFixed(2).padStart(7),
    'daysOfCover=' + lease.signal.daysOfCover.toFixed(2).padStart(6), 'netWorth차이=' + diff.toFixed(0).padStart(8),
    diff > 0 ? 'WIN' : 'lose');
}

const mb = rows.map(r => r.minBuffer), dc = rows.map(r => r.daysOfCover), df = rows.map(r => r.diff);
console.log('\n상관계수(minBuffer, netWorth차이) = ' + corr(mb, df).toFixed(3));
console.log('상관계수(daysOfCover, netWorth차이) = ' + corr(dc, df).toFixed(3));

const winRows = rows.filter(r => r.win), loseRows = rows.filter(r => !r.win);
function avg(a) { return a.reduce((x, y) => x + y, 0) / a.length; }
console.log('\n승(' + winRows.length + '개) minBuffer 평균=' + avg(winRows.map(r => r.minBuffer)).toFixed(2) +
  ' daysOfCover 평균=' + avg(winRows.map(r => r.daysOfCover)).toFixed(2));
console.log('패(' + loseRows.length + '개) minBuffer 평균=' + avg(loseRows.map(r => r.minBuffer)).toFixed(2) +
  ' daysOfCover 평균=' + avg(loseRows.map(r => r.daysOfCover)).toFixed(2));
