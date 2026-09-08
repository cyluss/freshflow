// 이슈 #8/#9 4차: AP를 판 전체에서 딱 하나 존재하는 고정 신용한도(facility)로 만든다.
// 이전 실험(ap-30day-sim.mjs)은 만기만 30일로 늘렸을 뿐 creditLimit이 최근 7일 평균
// 매입액으로 매일 다시 계산돼서, 지출 패턴이 바뀌면 한도 자체가 같이 늘거나 줄었다.
// 이번엔 한도를 게임 시작 시 고정값으로 못박고(K x 매일 재계산 아님), "운영 종료" 시점에
// 모든 outstanding AP를 일괄 정산한다(수학적으로는 여전히 netWorth에서 한 번에 차감하는
// 것과 같지만, 한도 자체가 판 내내 재생되지 않는다는 점이 이전 실험과 다르다).
import fs from 'fs';

const stub = 'var FF={},FV={};';
const DOMAIN = ['src-core.js','src-store.js','src-access.js','src-uistate.js','src-kernel.js','src-runner.js','src-record.js','src-engine.js','src-counter.js','src-fact.js','src-report-data.js'];
const src = stub + DOMAIN.map(f => fs.readFileSync(f, 'utf8')).join('\n') + '\nreturn FF;';
const FF = new Function(src)();

const N_SEEDS = Number(process.argv[2] || 300);
const RUNWAY_N = 5;
const FACILITY_SIZES = { '10000': 10000, '20000': 20000, '30000': 30000, '40000': 40000, '무제한': Infinity };
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

function runPolicy(seed, style, facilitySize, guardT) {
  FF.reset(seed);
  let day1cmd = FF.Cmd.wait();
  if (style.cover !== null) day1cmd = FF.Cmd.policy(style.cover);
  else if (style.stance) day1cmd = FF.Cmd.stance(style.stance);
  FF.stepDay(day1cmd);
  if (style.cover !== null && style.stance) FF.stepDay(FF.Cmd.stance(style.stance));

  let outstandingAP = 0; // 판 전체 하나뿐인 고정 한도. 상환은 게임 종료 시 일괄뿐이라 도중엔 안 줄어든다.
  let minCash = FF.ledger().cash, forgoneQty = 0, desiredQty = 0, bust = false;
  let creditAtBinding = [];
  for (let day = FF.run().day; day <= FF.C.days; day++) {
    if (FF.isOver()) break;
    const cashBeforeIntake = FF.ledger().cash;
    const budget = Math.max(0, cashBeforeIntake - FF.C.fixed);
    const payable = FF.C.farm > 0 ? Math.floor(budget / FF.C.farm) : Infinity;
    const want = desiredStored();
    const forgoneToday = Math.max(0, want - Math.min(want, payable));
    forgoneQty += forgoneToday; desiredQty += want;

    const arList = FF.arOf() || [];
    const arDueSoon = arList.filter(x => x.at <= day + RUNWAY_N).reduce((a, x) => a + x.amt, 0);
    const runway5 = FF.ledger().cash + arDueSoon - RUNWAY_N * FF.C.fixed - RUNWAY_N * FF.C.farm * want;
    const availableCredit = Math.max(0, facilitySize - outstandingAP);
    if (forgoneToday > 0) creditAtBinding.push(availableCredit);
    const wantsAP = guardT === null ? true : runway5 < guardT;

    FF.stepDay(FF.Cmd.wait());
    const r = FF.today();
    const cost = r.acc * FF.C.farm;

    if (wantsAP && cost > 0) {
      const apPortion = Math.min(cost, availableCredit);
      if (apPortion > 0) { FF.addCash(apPortion); outstandingAP += apPortion; }
    }

    minCash = Math.min(minCash, FF.ledger().cash);
    if (FF.isBust()) bust = true;
  }
  const relAvg = FF.relOf().reduce((a, b) => a + b, 0) / FF.relOf().length;
  return {
    netWorth: FF.netWorth(FF.toKernelState()) - outstandingAP, // 운영 종료 시 일괄 정산과 수학적으로 동일
    forgoneRatio: desiredQty > 0 ? forgoneQty / desiredQty : 0, bust, relAvg, creditAtBinding,
  };
}

function avg(a) { return a.length ? a.reduce((x, y) => x + y, 0) / a.length : NaN; }

for (const [sizeName, size] of Object.entries(FACILITY_SIZES)) {
  console.log('\n=== 고정 신용한도 ' + sizeName + ' (n=' + N_SEEDS + ') ===');
  const allRows = {};
  for (const name of Object.keys(GUARD_T)) allRows[name] = [];
  for (const style of Object.values(STYLES)) {
    for (let seed = 1; seed <= N_SEEDS; seed++) {
      for (const [name, T] of Object.entries(GUARD_T)) allRows[name].push(runPolicy(seed, style, size, T));
    }
  }
  for (const [name] of Object.entries(GUARD_T)) {
    const rows = allRows[name];
    const cab = rows.flatMap(r => r.creditAtBinding);
    console.log(name.padEnd(16),
      'netWorth avg=' + avg(rows.map(r => r.netWorth)).toFixed(0),
      '포기비율=' + (100 * avg(rows.map(r => r.forgoneRatio))).toFixed(2) + '%',
      'bust=' + (100 * rows.filter(r => r.bust).length / rows.length).toFixed(1) + '%',
      '제약시점가용신용=' + (cab.length ? avg(cab).toFixed(0) : 'N/A') + '(n=' + cab.length + ')');
  }
}
