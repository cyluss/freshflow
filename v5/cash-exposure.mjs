// 이슈 #8(AP): Lease를 배경조건으로 쓰지 않고, 현재 경제 자체의 현금압박 노출을 먼저
// 측정한다. 개입은 전혀 하지 않는다 - 실제 커널 그대로 관찰만 한다. bottleneck-exposure.mjs와
// 같은 다섯 플레이 스타일을 재사용한다(스타일을 결과 보고 고르지 않기 위해).
//
// "현금 때문에 포기한 매입량"은 FF.stepState의 실제 payable 계산(budget=cash-fixed,
// payable=floor(budget/farm))을 그대로 재현한다. 원하는 매입량(stored_desired)은
// FF.intakeNeed로 커널과 같은 공식으로 재구성한다. 둘 다 이미 실제 커널이 쓰는 함수라
// 새로 추정하는 게 아니라 같은 계산을 헤드리스에서 미리 해 보는 것이다.
import fs from 'fs';

const stub = 'var FF={},FV={};';
const DOMAIN = ['src-core.js','src-store.js','src-access.js','src-uistate.js','src-kernel.js','src-runner.js','src-record.js','src-engine.js','src-counter.js','src-fact.js','src-report-data.js'];
const src = stub + DOMAIN.map(f => fs.readFileSync(f, 'utf8')).join('\n') + '\nreturn FF;';
const FF = new Function(src)();

const N_SEEDS = Number(process.argv[2] || 300);

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
  // 계약(contract)은 다섯 스타일 어디서도 안 쓰므로 extra=0으로 둔다(재현 범위 밖).
  const freeNow = Math.max(0, cap.storage - FF.inventory());
  return Math.min(baseAcc, freeNow);
}

function runStyle(seed, style) {
  FF.reset(seed);
  let day1cmd = FF.Cmd.wait();
  if (style.cover !== null) day1cmd = FF.Cmd.policy(style.cover);
  else if (style.stance) day1cmd = FF.Cmd.stance(style.stance);
  FF.stepDay(day1cmd);
  if (style.cover !== null && style.stance) FF.stepDay(FF.Cmd.stance(style.stance));

  let minCash = FF.ledger().cash, forgoneTotal = 0, forgoneDays = 0;
  let farmSpendSum = 0, arSum = 0, revSum = 0, invSum = 0, n = 0;
  for (let day = FF.run().day; day <= FF.C.days; day++) {
    if (FF.isOver()) break;
    const cashBefore = FF.ledger().cash;
    const budget = Math.max(0, cashBefore - FF.C.fixed);
    const payable = FF.C.farm > 0 ? Math.min(Number.MAX_SAFE_INTEGER, Math.floor(budget / FF.C.farm)) : Infinity;
    const want = desiredStored();
    const forgone = Math.max(0, Math.min(want, FF.capsOf().storage) - Math.min(want, payable));
    if (forgone > 0) { forgoneTotal += forgone; forgoneDays++; }

    FF.stepDay(FF.Cmd.wait());
    const h = FF.histOf()[FF.histOf().length - 1];
    minCash = Math.min(minCash, FF.ledger().cash);
    farmSpendSum += (h.acc || 0) * FF.C.farm;
    revSum += (h.revCh || []).reduce((a, b) => a + b, 0);
    arSum += (FF.arOf() || []).reduce((a, x) => a + x.amt, 0);
    invSum += FF.inventory();
    n++;
  }
  const avgFarmSpend = farmSpendSum / n, avgAR = arSum / n, avgRev = revSum / n, avgInv = invSum / n;
  const dio = avgFarmSpend > 0 ? avgInv * FF.C.farm / avgFarmSpend : 0; // 재고일수(원가 기준)
  const dso = avgRev > 0 ? avgAR / avgRev : 0; // 매출채권 회수일수
  return { minCash, forgoneTotal, forgoneDays, avgAR, dio, dso, ccc: dio + dso, netWorth: FF.netWorth(FF.toKernelState()) };
}

function avg(a) { return a.reduce((x, y) => x + y, 0) / a.length; }

console.log('=== 플레이 스타일별 현금압박 노출 (n=' + N_SEEDS + ', 개입 없음) ===\n');
for (const [name, style] of Object.entries(STYLES)) {
  const rows = [];
  for (let seed = 1; seed <= N_SEEDS; seed++) rows.push(runStyle(seed, style));
  console.log(name.padEnd(16),
    '최소현금 평균=' + avg(rows.map(r => r.minCash)).toFixed(0),
    '최소현금<fixed 시드=' + rows.filter(r => r.minCash < FF.C.fixed).length + '/' + N_SEEDS,
    '포기매입량 평균=' + avg(rows.map(r => r.forgoneTotal)).toFixed(2),
    '포기발생 시드=' + rows.filter(r => r.forgoneTotal > 0).length + '/' + N_SEEDS,
    'AR잔액 평균=' + avg(rows.map(r => r.avgAR)).toFixed(0),
    'DIO=' + avg(rows.map(r => r.dio)).toFixed(2) + '일',
    'DSO=' + avg(rows.map(r => r.dso)).toFixed(2) + '일',
    'CCC=' + avg(rows.map(r => r.ccc)).toFixed(2) + '일');
}
