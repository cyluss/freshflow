// 이슈 #10: 저자본(B) vs 고정비압박(C/D/E) 중 어느 쪽이 더 의미있고 사전식별 가능한
// 운전자본 제약을 만드는지 비교한다. 시나리오는 결과를 보기 전에 고정한다.
//   A 현재: cash=60000(100%), fixed=현재
//   B 저자본: cash=42000(70%), fixed=현재
//   C/D/E 고정비압박: cash=50000, fixed=현재의 1.5/2/3배
import fs from 'fs';

const stub = 'var FF={},FV={};';
const DOMAIN = ['src-core.js','src-store.js','src-access.js','src-uistate.js','src-kernel.js','src-runner.js','src-record.js','src-engine.js','src-counter.js','src-fact.js','src-report-data.js'];
const src = stub + DOMAIN.map(f => fs.readFileSync(f, 'utf8')).join('\n') + '\nreturn FF;';
const FF = new Function(src)();

const N_SEEDS = Number(process.argv[2] || 300);
const BASE_CASH = FF.C.cash, BASE_FIXED = FF.C.fixed;

const SCENARIOS = {
  'A현재':        { cash: BASE_CASH,        fixed: BASE_FIXED },
  'B저자본(42k)':  { cash: Math.round(BASE_CASH * 0.7), fixed: BASE_FIXED },
  'C고정비x1.5':   { cash: Math.round(BASE_CASH * 50000 / 60000), fixed: Math.round(BASE_FIXED * 1.5) },
  'D고정비x2':     { cash: Math.round(BASE_CASH * 50000 / 60000), fixed: Math.round(BASE_FIXED * 2) },
  'E고정비x3':     { cash: Math.round(BASE_CASH * 50000 / 60000), fixed: Math.round(BASE_FIXED * 3) },
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

// 하루치 관측 + 개입 없는 진행. days 배열(제약일 상세)까지 남긴다.
function runFull(seed, style) {
  FF.reset(seed);
  let day1cmd = FF.Cmd.wait();
  if (style.cover !== null) day1cmd = FF.Cmd.policy(style.cover);
  else if (style.stance) day1cmd = FF.Cmd.stance(style.stance);
  FF.stepDay(day1cmd);
  if (style.cover !== null && style.stance) FF.stepDay(FF.Cmd.stance(style.stance));

  const days = []; // {day, forgone, cash, arBalance, runway5}
  let minCash = FF.ledger().cash, forgoneValue = 0, desiredValue = 0, bust = false;
  for (let day = FF.run().day; day <= FF.C.days; day++) {
    if (FF.isOver()) break;
    const cashBefore = FF.ledger().cash;
    const budget = Math.max(0, cashBefore - FF.C.fixed);
    const payable = FF.C.farm > 0 ? Math.floor(budget / FF.C.farm) : Infinity;
    const want = desiredStored();
    const forgone = Math.max(0, want - Math.min(want, payable));
    forgoneValue += forgone * FF.C.farm; desiredValue += want * FF.C.farm;
    const arList = FF.arOf() || [];
    const arBalance = arList.reduce((a, x) => a + x.amt, 0);
    const arDue5 = arList.filter(x => x.at <= day + 5).reduce((a, x) => a + x.amt, 0);
    const runway5 = cashBefore + arDue5 - 5 * FF.C.fixed;

    FF.stepDay(FF.Cmd.wait());
    minCash = Math.min(minCash, FF.ledger().cash);
    if (FF.isBust()) bust = true;
    days.push({ day, forgone: forgone > 0, arBalance, runway5 });
  }
  return { days, minCash, forgoneValue, desiredValue, bust, netWorth: FF.netWorth(FF.toKernelState()) };
}

function avg(a) { return a.length ? a.reduce((x, y) => x + y, 0) / a.length : NaN; }
function pct(a, p) { const s = a.slice().sort((x, y) => x - y); return s.length ? s[Math.floor(s.length * p)] : NaN; }

// === 1~2단계: 제약 강도 측정, B와 가장 비슷한 C/D/E 찾기 ===
console.log('=== 1~2단계: 시나리오별 제약 강도 (n=' + N_SEEDS + ', 5스타일 평균) ===\n');
const summary = {};
for (const [name, sc] of Object.entries(SCENARIOS)) {
  FF.C.cash = sc.cash; FF.C.fixed = sc.fixed;
  let allForgoneRatio = [], allMinCash = [], allBust = [];
  for (const style of Object.values(STYLES)) {
    for (let seed = 1; seed <= N_SEEDS; seed++) {
      const r = runFull(seed, style);
      allForgoneRatio.push(r.desiredValue > 0 ? r.forgoneValue / r.desiredValue : 0);
      allMinCash.push(r.minCash); allBust.push(r.bust ? 1 : 0);
    }
  }
  summary[name] = { forgoneRatio: avg(allForgoneRatio), bustRate: avg(allBust), minCashP10: pct(allMinCash, 0.1) };
  console.log(name.padEnd(14), 'cash=' + sc.cash, 'fixed=' + sc.fixed,
    '포기비율=' + (100 * summary[name].forgoneRatio).toFixed(2) + '%',
    'bust율=' + (100 * summary[name].bustRate).toFixed(1) + '%',
    '최저현금p10=' + summary[name].minCashP10.toFixed(0));
}
FF.C.cash = BASE_CASH; FF.C.fixed = BASE_FIXED;

let matched = null, bestDiff = Infinity;
for (const name of ['C고정비x1.5', 'D고정비x2', 'E고정비x3']) {
  const diff = Math.abs(summary[name].forgoneRatio - summary['B저자본(42k)'].forgoneRatio) +
    Math.abs(summary[name].bustRate - summary['B저자본(42k)'].bustRate);
  if (diff < bestDiff) { bestDiff = diff; matched = name; }
}
console.log('\nB와 제약 강도가 가장 비슷한 고정비압박 시나리오: ' + matched);

// === 3단계: 제약의 모양 비교(B vs matched) ===
function shapeStats(name, sc) {
  FF.C.cash = sc.cash; FF.C.fixed = sc.fixed;
  const firsts = [], lasts = [], runs = [], recoverFracs = [], arAtConstraint = [];
  const bucket = { early: 0, mid: 0, late: 0 };
  for (const style of Object.values(STYLES)) {
    for (let seed = 1; seed <= N_SEEDS; seed++) {
      const r = runFull(seed, style);
      const cdays = r.days.filter(d => d.forgone).map(d => d.day);
      if (!cdays.length) continue;
      firsts.push(cdays[0]); lasts.push(cdays[cdays.length - 1]);
      for (const d of cdays) { if (d <= 10) bucket.early++; else if (d <= 20) bucket.mid++; else bucket.late++; }
      let curRun = 0, maxRun = 0;
      for (const d of r.days) { if (d.forgone) { curRun++; maxRun = Math.max(maxRun, curRun); } else curRun = 0; }
      runs.push(maxRun);
      let recovered = 0, total = 0;
      for (let i = 0; i < r.days.length - 1; i++) {
        if (r.days[i].forgone) { total++; if (!r.days[i + 1].forgone) recovered++; }
      }
      if (total > 0) recoverFracs.push(recovered / total);
      for (const d of r.days) if (d.forgone) arAtConstraint.push(d.arBalance);
    }
  }
  FF.C.cash = BASE_CASH; FF.C.fixed = BASE_FIXED;
  console.log('\n--- ' + name + ' 제약의 모양 ---');
  console.log('첫 제약일 평균=' + avg(firsts).toFixed(1), '마지막 제약일 평균=' + avg(lasts).toFixed(1));
  console.log('제약일 분포: 초반(1-10)=' + bucket.early, '중반(11-20)=' + bucket.mid, '후반(21-30)=' + bucket.late);
  console.log('최장 연속 제약일수 평균=' + avg(runs).toFixed(2));
  console.log('제약 다음날 회복률=' + (100 * avg(recoverFracs)).toFixed(1) + '%');
  console.log('제약 발생 시 AR잔액 평균=' + avg(arAtConstraint).toFixed(0));
}
shapeStats('B저자본(42k)', SCENARIOS['B저자본(42k)']);
shapeStats(matched, SCENARIOS[matched]);

// === 4단계: #9 유동성 활주로(runway5) 신호 검증 ===
function runwaySignal(name, sc) {
  FF.C.cash = sc.cash; FF.C.fixed = sc.fixed;
  const runwayWhenSoonConstraint = [], runwayOtherwise = [];
  for (const style of Object.values(STYLES)) {
    for (let seed = 1; seed <= N_SEEDS; seed++) {
      const r = runFull(seed, style);
      for (let i = 0; i < r.days.length; i++) {
        const soon = r.days.slice(i + 1, i + 6).some(d => d.forgone);
        if (soon) runwayWhenSoonConstraint.push(r.days[i].runway5);
        else runwayOtherwise.push(r.days[i].runway5);
      }
    }
  }
  FF.C.cash = BASE_CASH; FF.C.fixed = BASE_FIXED;
  console.log('\n--- ' + name + ' runway5 신호 ---');
  console.log('3~5일 내 제약 발생 예정일의 runway5 평균=' + avg(runwayWhenSoonConstraint).toFixed(0) + ' (n=' + runwayWhenSoonConstraint.length + ')');
  console.log('그 외 날의 runway5 평균=' + avg(runwayOtherwise).toFixed(0) + ' (n=' + runwayOtherwise.length + ')');
}
console.log('\n=== 4단계: #9 유동성 활주로 신호 ===');
runwaySignal('B저자본(42k)', SCENARIOS['B저자본(42k)']);
runwaySignal(matched, SCENARIOS[matched]);
