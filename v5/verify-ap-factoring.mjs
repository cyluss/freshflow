// 이슈 #11: AP/Factoring semantic parity 검증. headless 실험(ap-creditlimit-sim.mjs,
// factoring-conditional.mjs)이 검증하고 이슈 #11 코멘트가 확정한 공식이 실제 커널 구현과
// 정확히 같은 수치를 내는지 확인한다. verify-reveal.mjs와 같은 게이트 스타일이다.
//
// "동일 state + 동일 decision → headless와 실제 게임의 결과가 일치한다"(#11)를 확인하는
// 것이 이 스크립트의 목적이다. 그래서 게이트 A/B는 FF.apCreditLimit/FF.apAvailableCredit/
// FF.applyFactoring/FF.factorCashIn을 부르지 않고, 이슈 #11에서 확정한 상수(AP_TERM=7,
// AP_AVGWIN=7, AP_K=1, FACTOR_RATE=0.005)를 그대로 하드코딩해 손으로 다시 계산한 뒤,
// 실제 커널이 낸 값과 대조한다. 커널 구현이 이 공식에서 조용히 벗어나면(계수를 실수로
// 바꾸거나 순서를 바꾸면) 이 게이트가 반드시 실패해야 한다.
import fs from 'fs';
const stub = 'var FF={},FV={};';
const DOMAIN = ['src-core.js','src-store.js','src-access.js','src-uistate.js','src-kernel.js',
  'src-runner.js','src-record.js','src-engine.js','src-counter.js','src-fact.js','src-report-data.js'];
const src = stub + DOMAIN.map(f => fs.readFileSync(f, 'utf8')).join('\n') + '\nreturn FF;';
const FF = new Function(src)();

let ok = 0, bad = 0;
const gate = (n, name, cond, evidence) => {
  const mark = cond ? 'PASS' : 'FAIL';
  if (cond) ok++; else bad++;
  console.log(`[${mark}] ${n}. ${name}`);
  if (evidence !== undefined) console.log('    ' + evidence);
};

// ---- 이슈 #11에서 확정한 상수. FF.C를 읽지 않고 그대로 박아 둔다(하드코딩이 의도다) ----
const AP_TERM = 7, AP_AVGWIN = 7, AP_K = 1;
const FACTOR_RATE = 0.005;

console.log('=== gate A: AP creditLimit/availableCredit 시퀀스, 커널 vs 독립 재구현 ===');
{
  const SEEDS = [30699, 1, 22209];
  let allMatch = true, sample = '';
  for (const seed of SEEDS) {
    FF.reset(seed);
    let apHist = [], ap = []; // 독립 재구현 쪽 장부(커널 내부를 전혀 읽지 않고 스스로 쌓는다)
    for (let day = 1; day <= 20 && !FF.isOver(); day++) {
      // 오늘 매입 전: 만기 도달한 AP를 갚는다(커널의 stepState 상단 순서와 같다).
      ap = ap.filter(x => x.at > day);
      const avgSpend = apHist.length ? apHist.reduce((a, b) => a + b, 0) / apHist.length : 0;
      const creditLimit = avgSpend * AP_K;
      const outstanding = ap.reduce((a, x) => a + x.amt, 0);
      const availableCredit = Math.max(0, creditLimit - outstanding);

      FF.stepDay(FF.Cmd.wait());
      const r = FF.today();
      const farmCost = r.acc * FF.C.farm;
      const apPortion = Math.round(Math.min(farmCost, availableCredit));
      if (apPortion > 0) ap.push({ at: day + AP_TERM, amt: apPortion });
      apHist.push(farmCost); if (apHist.length > AP_AVGWIN) apHist.shift();

      const kernelAp = FF.apOf(), kernelHist = FF.apHistOf();
      const apMatch = JSON.stringify(ap) === JSON.stringify(kernelAp);
      const histMatch = JSON.stringify(apHist) === JSON.stringify(kernelHist);
      if (!apMatch || !histMatch) {
        allMatch = false;
        console.log(`    불일치 seed=${seed} day=${day}: 재구현 ap=${JSON.stringify(ap)} vs 커널=${JSON.stringify(kernelAp)}`);
        console.log(`                              재구현 hist=${JSON.stringify(apHist)} vs 커널=${JSON.stringify(kernelHist)}`);
        break;
      }
      if (seed === SEEDS[0] && day === 10) sample = `day10 ap=${JSON.stringify(ap)} avail=${availableCredit.toFixed(1)}`;
    }
  }
  gate('A1', '독립 재구현한 AP 장부(ap 배열·apHist)가 20일 내내 커널 상태와 완전히 같다(3개 시드)',
    allMatch, sample || '전 구간 일치');
}

console.log('\n=== gate A2: creditLimit/availableCredit 불변식(200시드 x 30일) ===');
{
  // 주의: creditLimit은 최근 평균 매입액을 매일 다시 매기는 이동평균이라, 어제 그은 outstandingAP가
  // "오늘 다시 계산한" creditLimit보다 커지는 날이 있을 수 있다(최근 며칠 매입이 줄면 한도 자체가
  // 줄어든다) - 이건 실제 회전신용의 정상 동작이지 버그가 아니다(카드 한도가 줄어도 이미 쓴
  // 잔액이 저절로 사라지지 않는 것과 같다). 그래서 여기서 보는 불변식은 "그날 새로 그은 만큼
  // (apUsed)이 그날 결정 시점의 availableCredit을 넘지 않는가"다 - 이게 진짜 지켜야 할 제약이고,
  // gate A1이 20일 동안 독립 재구현으로 이미 이 순서 그대로 검증했다. 여기서는 200시드로 넓힌다.
  const EPS = 1; // apPortion=Math.round(min(farmCost,availableCredit))의 반올림 경계(최대 0.5)
  let checked = 0, badDraw = 0, badNonNeg = 0;
  for (let seed = 1; seed <= 200; seed++) {
    FF.reset(seed);
    for (let day = 1; day <= 30 && !FF.isOver(); day++) {
      // 오늘 결정 시점(=오늘치 stepDay를 부르기 전)의 availableCredit을 먼저 잰다.
      const before = FF.apStatus();
      FF.stepDay(FF.Cmd.wait());
      const r = FF.today();
      const after = FF.apStatus();
      checked++;
      if (after.available < 0) badNonNeg++;
      if (r.apUsed > before.available + EPS) badDraw++;
    }
  }
  gate('A2a', 'availableCredit는 어떤 날에도 음수가 아니다(200시드 x 30일)', badNonNeg === 0,
    `검사 ${checked}건, 위반 ${badNonNeg}건`);
  gate('A2b', '그날 새로 그은 AP(apUsed)는 그날 결정 시점의 availableCredit을 넘지 않는다(200시드 x 30일)',
    badDraw === 0, `검사 ${checked}건, 위반 ${badDraw}건`);
}

console.log('\n=== gate A3: 게임 종료 시 미상환 AP가 있어도 netWorth가 정확히 부채로 잡힌다 ===');
{
  // 24~30일차에 매입이 있으면(만기가 30일을 넘는다) 게임이 끝나도 s.ap가 안 빈다.
  // 그 경우 netWorth = cash+AR-AP가 성립해야 한다(#12 범위인 "연체"는 다루지 않는다 -
  // 그냥 상환 안 된 부채가 순자산에서 정확히 빠지는지만 본다).
  let found = false, allOk = true, evidence = '';
  for (let seed = 1; seed <= 60 && !(found && seed > 5); seed++) {
    FF.reset(seed);
    for (let day = 1; day <= 30 && !FF.isOver(); day++) FF.stepDay(FF.Cmd.wait());
    const s = FF.toKernelState();
    const outstandingAP = FF.sumAmt(s.ap);
    if (outstandingAP > 0) {
      found = true;
      const nw = FF.netWorth(s);
      const handNw = s.cash + FF.sumAmt(s.ar) - outstandingAP;
      if (Math.abs(nw - handNw) > 1e-6) { allOk = false; evidence += ` seed${seed}:불일치`; }
      else evidence = `seed=${seed} 미상환AP=${outstandingAP} netWorth=${nw} (cash+AR-AP 직접합=${handNw})`;
    }
  }
  gate('A3', '30일 종료 시 미상환 AP가 남아도 netWorth=cash+AR-AP가 정확히 성립한다',
    found && allOk, found ? evidence : '60개 시드 중 미상환 AP가 남는 시드를 찾지 못했다(조건 자체가 검증되지 않음)');
}

console.log('\n=== gate B: factoring 한 건, 커널 vs 손계산(실제 FF.transition 경로) ===');
{
  // 순수 상태를 손으로 빚는다: 판매/입고/창고 한도를 0으로 둬서 stepState의 다른 부수효과를
  // (매입·판매) 완전히 0으로 고정하고, 그날 비용을 R.fixed 하나로만 정확히 예측 가능하게 만든다.
  // 이렇게 하면 factoring 커맨드가 낸 cashIn/cost를 커널의 다른 계산과 완전히 분리해서 검산할 수 있다.
  const R = FF.C;
  const mkState = (day, ar, cash) => ({
    day, si: 1, di: 1, cash, lots: [],
    cap: { intake: 0, storage: 0, sales: 0 },
    pend: null, spent: 0, contract: 0, pendContract: null, todayProd: 0, cover: R.cover,
    ar: ar.map(x => ({ at: x.at, amt: x.amt })), ap: [], apHist: [],
    rel: R.channels.map(() => R.rel.start), alloc: null, stance: null,
    buys: { sales: 0, contract: 0 }, recent: []
  });
  const world = { supplyPhase: 1, nextSupplyPhase: 1, demandPhase: 1, nextDemandPhase: 1, demand: 0, production: 0 };

  const cases = [
    { day: 10, ar: [{ at: 15, amt: 10000 }, { at: 20, amt: 4000 }], amount: 8000 },   // 첫 항목만 일부 소진
    { day: 10, ar: [{ at: 15, amt: 10000 }, { at: 20, amt: 4000 }], amount: 12000 },  // 두 항목에 걸침
  ];
  let allPass = true, lines = [];
  for (const c of cases) {
    const cash0 = 50000;
    const s = mkState(c.day, c.ar, cash0);
    const out = FF.transition(s, FF.Cmd.factor(c.amount), world, R);

    // 손계산: 만기가 가장 가까운 항목부터 소진한다(FF.applyFactoring을 부르지 않는다).
    let remain = c.amount, cashIn = 0, kept = [];
    const items = c.ar.slice().sort((a, b) => a.at - b.at);
    for (const e of items) {
      if (remain <= 0) { kept.push({ ...e }); continue; }
      const take = Math.min(e.amt, remain);
      const daysLeft = Math.max(0, e.at - c.day);
      cashIn += Math.round(take * (1 - FACTOR_RATE * daysLeft));
      remain -= take;
      if (take < e.amt) kept.push({ at: e.at, amt: e.amt - take });
    }
    // 이 시나리오에서 stepState는 매입·판매가 전부 0이라 그날 비용은 고정비 하나뿐이다.
    const expectedCash = cash0 + cashIn - R.fixed;
    const arOk = JSON.stringify(out.state.ar) === JSON.stringify(kept);
    const cashOk = Math.abs(out.state.cash - expectedCash) < 1e-6;
    if (!arOk || !cashOk) allPass = false;
    lines.push(`amount=${c.amount} 손계산cashIn=${cashIn} 커널cashIn=${out.state.cash - cash0 + R.fixed} ` +
      `| 손계산ar=${JSON.stringify(kept)} 커널ar=${JSON.stringify(out.state.ar)} | cashOk=${cashOk} arOk=${arOk}`);
  }
  gate('B1', 'FF.transition(factor)의 실제 cashIn/남은 AR이 손으로 계산한 값과 정확히 같다(2개 시나리오)',
    allPass, lines.join('\n    '));
}

console.log('\n=== gate B2: factoring은 outstanding 이상을 만들어내지 않는다 ===');
{
  const R = FF.C;
  const s = { day: 5, si: 1, di: 1, cash: 10000, lots: [],
    cap: { intake: 0, storage: 0, sales: 0 }, pend: null, spent: 0, contract: 0, pendContract: null,
    todayProd: 0, cover: R.cover, ar: [{ at: 8, amt: 3000 }], ap: [], apHist: [],
    rel: R.channels.map(() => R.rel.start), alloc: null, stance: null,
    buys: { sales: 0, contract: 0 }, recent: [] };
  const world = { supplyPhase: 1, nextSupplyPhase: 1, demandPhase: 1, nextDemandPhase: 1, demand: 0, production: 0 };
  // outstanding(3000)보다 훨씬 큰 금액을 요청해도 실제로 현금화되는 건 outstanding만큼뿐이어야 한다.
  const out = FF.transition(s, FF.Cmd.factor(999999), world, R);
  const remainingAr = FF.sumAmt(out.state.ar);
  gate('B2', '보유 AR보다 큰 금액을 요청해도 outstanding 이상은 현금화되지 않는다(남은 AR<0 없음)',
    remainingAr === 0 && remainingAr >= 0,
    `요청 999999원, outstanding 3000원 → 남은 AR ${remainingAr}원`);
}

console.log('\n=== gate C: 캐시 보존 - AP가 관여한 날도 순자산 흐름이 profit과 정확히 맞는다 ===');
{
  let bad = 0, checked = 0;
  for (const seed of [1, 30699, 22209, 84206, 5]) {
    FF.reset(seed);
    let prevNw = FF.netWorth(FF.toKernelState());
    for (let day = 1; day <= 30 && !FF.isOver(); day++) {
      const spentBefore = FF.ledger().spent;
      FF.stepDay(FF.Cmd.wait());
      const r = FF.today();
      const salvage = FF.isOver() ? FF.ledger().salvaged : 0;
      const nwNow = FF.netWorth(FF.toKernelState());
      checked++;
      if (Math.abs(nwNow - (prevNw + r.profit + salvage)) > 1) bad++;
      prevNw = nwNow;
    }
  }
  gate('C', 'AP 자동 완충이 켜져 있어도 순자산 변화 = profit(+salvage)와 정확히 같다(5개 시드)',
    bad === 0, `검사 ${checked}건, 위반 ${bad}건`);
}

console.log(`\n=== 요약: ${ok} PASS, ${bad} FAIL ===`);
process.exit(bad ? 1 : 0);
