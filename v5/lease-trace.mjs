// 이슈 #8: none vs lease 턴별 differential trace. 표본을 늘리기 전에 최초 분기점을 찾아
// 인과경로를 확인한다. 세 시드: 큰 손실(152), 큰 이익(16), 거의 차이 없음(240, 대조군).
import fs from 'fs';

const stub = 'var FF={},FV={};';
const DOMAIN = ['src-core.js','src-store.js','src-access.js','src-uistate.js','src-kernel.js','src-runner.js','src-record.js','src-engine.js','src-counter.js','src-fact.js','src-report-data.js'];
const src = stub + DOMAIN.map(f => fs.readFileSync(f, 'utf8')).join('\n') + '\nreturn FF;';
const FF = new Function(src)();

const RECENT_WIN = 5, SHIP_THRESHOLD = 3, LEASE_TERM = 10, LEASE_FACTOR = 0.4;

function shipSignal() {
  const h = FF.histOf();
  return h.slice(-RECENT_WIN).filter(r => r.b === 'ship').length >= SHIP_THRESHOLD;
}
function shrinkSales() {
  const P = FF.plant();
  FF.PLANT.value = { cap: { intake: P.cap.intake, storage: P.cap.storage, sales: P.cap.sales - FF.C.step.sales }, buys: P.buys };
}

function runTrace(seed, policyKey) {
  FF.reset(seed);
  FF.stepDay(FF.Cmd.policy(2));
  let lease = null, leaseFee = 0;
  const rows = [];
  for (let day = FF.run().day; day <= FF.C.days; day++) {
    if (FF.isOver()) break;
    const arBefore = (FF.arOf() || []).length;
    leaseFee = 0;
    if (policyKey === 'lease' && !lease && shipSignal()) {
      const dailyFee = Math.round(FF.C.cost.sales * LEASE_FACTOR / LEASE_TERM);
      if (FF.ledger().cash >= dailyFee) {
        FF.expand('sales');
        lease = { expireDay: day + LEASE_TERM, dailyFee };
        FF.addCash(-dailyFee); leaseFee = dailyFee;
      }
      FF.stepDay(FF.Cmd.wait());
    } else {
      if (policyKey === 'lease' && lease) { FF.addCash(-lease.dailyFee); leaseFee = lease.dailyFee; }
      FF.stepDay(FF.Cmd.wait());
    }
    if (policyKey === 'lease' && lease && day + 1 === lease.expireDay) { shrinkSales(); lease = null; }

    const h = FF.histOf()[FF.histOf().length - 1];
    const arAfter = FF.arOf() || [];
    const arCreated = arAfter.length - arBefore; // 이번 턴에 새로 생긴 AR 건수(대략적 근사)
    rows.push({
      day, capS: h.capI !== undefined ? h.capS : null, b: h.b, sold: h.sold, missed: h.missed,
      toCh: h.toCh.slice(), rel: h.rel.slice(), cash: FF.ledger().cash, leaseFee,
      arCount: arAfter.length, arCreated,
      netWorth: FF.netWorth(FF.toKernelState()),
    });
  }
  return rows;
}

function fmtRow(r) {
  return 'day' + String(r.day).padStart(2) + ' capS=' + r.capS + ' b=' + r.b.padEnd(6) +
    ' sold=' + r.sold + ' missed=' + r.missed + ' toCh=[' + r.toCh.join(',') + ']' +
    ' rel=[' + r.rel.join(',') + ']' + ' cash=' + r.cash + ' leaseFee=' + r.leaseFee +
    ' ar#=' + r.arCount + ' netWorth=' + r.netWorth;
}

for (const seed of [152, 16, 240]) {
  console.log('\n########## seed=' + seed + ' ##########');
  const none = runTrace(seed, 'none');
  const lease = runTrace(seed, 'lease');
  let firstDiverge = -1;
  for (let i = 0; i < none.length; i++) {
    const n = none[i], l = lease[i];
    const same = n.capS === l.capS && n.sold === l.sold && n.missed === l.missed &&
      JSON.stringify(n.toCh) === JSON.stringify(l.toCh) && JSON.stringify(n.rel) === JSON.stringify(l.rel);
    if (!same) { firstDiverge = i; break; }
  }
  console.log('최초 분기일: ' + (firstDiverge === -1 ? '없음(끝까지 동일)' : none[firstDiverge].day));
  const from = Math.max(0, firstDiverge - 1), to = Math.min(none.length, firstDiverge + 6);
  for (let i = from; i < to; i++) {
    console.log('NONE ', fmtRow(none[i]));
    console.log('LEASE', fmtRow(lease[i]));
  }
  console.log('최종 netWorth: none=' + none[none.length - 1].netWorth + ' lease=' + lease[lease.length - 1].netWorth +
    ' 차이=' + (lease[lease.length - 1].netWorth - none[none.length - 1].netWorth));
}
