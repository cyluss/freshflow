// 이슈 #8/#9: 1회성 거래신용(공급처 긴급 신용지원 1회). 0% 수수료, 7일 유예는 그대로
// 두고 "한도"가 아니라 "판 전체에서 딱 한 번만 행사 가능한 권리"로 희소성을 만든다.
// 이러면 비용 없이도 지금 쓸까 미래를 위해 아낄까라는 진짜 기회비용이 생기는지 본다.
import fs from 'fs';

const stub = 'var FF={},FV={};';
const DOMAIN = ['src-core.js','src-store.js','src-access.js','src-uistate.js','src-kernel.js','src-runner.js','src-record.js','src-engine.js','src-counter.js','src-fact.js','src-report-data.js'];
const src = stub + DOMAIN.map(f => fs.readFileSync(f, 'utf8')).join('\n') + '\nreturn FF;';
const FF = new Function(src)();

const N_SEEDS = Number(process.argv[2] || 300);
const AP_LAG = 7, RUNWAY_N = 5;
// 사전 선언한 행사 규칙. immediate/never가 두 극단, 나머지가 문턱값 후보다.
const POLICIES = {
  'immediate': (runway5, cost) => cost > 0,
  'runway<40000': (runway5, cost) => cost > 0 && runway5 < 40000,
  'runway<20000': (runway5, cost) => cost > 0 && runway5 < 20000,
  'runway<0': (runway5, cost) => cost > 0 && runway5 < 0,
  'never': () => false,
};
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

function runPolicy(seed, style, rule) {
  FF.reset(seed);
  let day1cmd = FF.Cmd.wait();
  if (style.cover !== null) day1cmd = FF.Cmd.policy(style.cover);
  else if (style.stance) day1cmd = FF.Cmd.stance(style.stance);
  FF.stepDay(day1cmd);
  if (style.cover !== null && style.stance) FF.stepDay(FF.Cmd.stance(style.stance));

  let apDue = null; // {due,amt} 또는 null. 상환 전까지 재사용 불가라 굳이 배열 안 써도 된다(1회성).
  let used = false, useDay = null;
  let minCash = FF.ledger().cash, forgoneQty = 0, desiredQty = 0, bust = false;
  for (let day = FF.run().day; day <= FF.C.days; day++) {
    if (FF.isOver()) break;
    const cashBeforeIntake = FF.ledger().cash;
    const budget = Math.max(0, cashBeforeIntake - FF.C.fixed);
    const payable = FF.C.farm > 0 ? Math.floor(budget / FF.C.farm) : Infinity;
    const want = desiredStored();
    forgoneQty += Math.max(0, want - Math.min(want, payable)); desiredQty += want;

    if (apDue && apDue.due <= day) { FF.addCash(-apDue.amt); apDue = null; }

    const arList = FF.arOf() || [];
    const arDueSoon = arList.filter(x => x.at <= day + RUNWAY_N).reduce((a, x) => a + x.amt, 0);
    const runway5 = FF.ledger().cash + arDueSoon - RUNWAY_N * FF.C.fixed - RUNWAY_N * FF.C.farm * want;

    FF.stepDay(FF.Cmd.wait());
    const r = FF.today();
    const cost = r.acc * FF.C.farm;

    if (!used && !apDue && rule(runway5, cost)) {
      FF.addCash(cost);
      apDue = { due: day + AP_LAG, amt: cost };
      used = true; useDay = day;
    }

    minCash = Math.min(minCash, FF.ledger().cash);
    if (FF.isBust()) bust = true;
  }
  const outstanding = apDue ? apDue.amt : 0;
  const relAvg = FF.relOf().reduce((a, b) => a + b, 0) / FF.relOf().length;
  return {
    netWorth: FF.netWorth(FF.toKernelState()) - outstanding,
    forgoneRatio: desiredQty > 0 ? forgoneQty / desiredQty : 0, bust, relAvg, used, useDay,
  };
}

function avg(a) { return a.length ? a.reduce((x, y) => x + y, 0) / a.length : NaN; }

console.log('=== 1회성 거래신용, 행사 규칙 비교 (n=' + N_SEEDS + ', 초기자본 42000) ===\n');
const allRows = {};
for (const name of Object.keys(POLICIES)) allRows[name] = [];
for (const style of Object.values(STYLES)) {
  for (let seed = 1; seed <= N_SEEDS; seed++) {
    for (const [name, rule] of Object.entries(POLICIES)) allRows[name].push(runPolicy(seed, style, rule));
  }
}
for (const [name] of Object.entries(POLICIES)) {
  const rows = allRows[name];
  const usedRows = rows.filter(r => r.used);
  console.log(name.padEnd(14),
    'netWorth avg=' + avg(rows.map(r => r.netWorth)).toFixed(0),
    '포기비율=' + (100 * avg(rows.map(r => r.forgoneRatio))).toFixed(2) + '%',
    'bust=' + (100 * rows.filter(r => r.bust).length / rows.length).toFixed(1) + '%',
    '행사비율=' + (100 * usedRows.length / rows.length).toFixed(1) + '%',
    '행사일 평균=' + (usedRows.length ? avg(usedRows.map(r => r.useDay)).toFixed(1) : 'N/A'));
}

console.log('\n=== none(never) 대비 개별 승/패/동률 ===');
const EPS_TIE = 1;
for (const name of Object.keys(POLICIES)) {
  if (name === 'never') continue;
  let better = 0, worse = 0, tie = 0;
  for (let i = 0; i < allRows['never'].length; i++) {
    const d = allRows[name][i].netWorth - allRows['never'][i].netWorth;
    if (d > EPS_TIE) better++; else if (d < -EPS_TIE) worse++; else tie++;
  }
  console.log(name.padEnd(14), 'never보다 나음=' + better, '못함=' + worse, '동률=' + tie);
}
