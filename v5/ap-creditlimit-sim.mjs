// 이슈 #8: AP에 신용한도를 건다. creditLimit(t)=최근 7일 평균 매입액(farm 비용)×K,
// availableCredit(t)=creditLimit(t)-outstandingAP(t)로 분리해서, 오늘 쓴 신용이 내일의
// 한도를 갉아먹는 진짜 희소성을 만든다. 자동정책은 가장 단순한 것만 쓴다: 쓸 수 있는
// AP가 있으면 AP, 초과분은 Cash. runway 기반 절약 정책은 2차 실험에서 다룬다.
import fs from 'fs';

const stub = 'var FF={},FV={};';
const DOMAIN = ['src-core.js','src-store.js','src-access.js','src-uistate.js','src-kernel.js','src-runner.js','src-record.js','src-engine.js','src-counter.js','src-fact.js','src-report-data.js'];
const src = stub + DOMAIN.map(f => fs.readFileSync(f, 'utf8')).join('\n') + '\nreturn FF;';
const FF = new Function(src)();

const N_SEEDS = Number(process.argv[2] || 300);
const AP_LAG = 7, AVG_WIN = 7;
const K_CANDIDATES = { 'K=0(none)': 0, 'K=1': 1, 'K=2': 2, 'K=3': 3, 'K=무제한': Infinity };
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

function runPolicy(seed, style, K) {
  FF.reset(seed);
  let day1cmd = FF.Cmd.wait();
  if (style.cover !== null) day1cmd = FF.Cmd.policy(style.cover);
  else if (style.stance) day1cmd = FF.Cmd.stance(style.stance);
  FF.stepDay(day1cmd);
  if (style.cover !== null && style.stance) FF.stepDay(FF.Cmd.stance(style.stance));

  let ap = [];
  const recentSpend = [];
  let minCash = FF.ledger().cash, forgoneQty = 0, desiredQty = 0, bust = false;
  let utilSum = 0, utilN = 0, apUsedTotal = 0;
  for (let day = FF.run().day; day <= FF.C.days; day++) {
    if (FF.isOver()) break;
    const cashBeforeIntake = FF.ledger().cash;
    const budget = Math.max(0, cashBeforeIntake - FF.C.fixed);
    const payable = FF.C.farm > 0 ? Math.floor(budget / FF.C.farm) : Infinity;
    const want = desiredStored();
    forgoneQty += Math.max(0, want - Math.min(want, payable)); desiredQty += want;

    ap = ap.filter(x => { if (x.due <= day) { FF.addCash(-x.amt); return false; } return true; });

    FF.stepDay(FF.Cmd.wait());
    const r = FF.today();
    const cost = r.acc * FF.C.farm;

    const avgSpend = recentSpend.length ? recentSpend.reduce((a, b) => a + b, 0) / recentSpend.length : 0;
    const creditLimit = K === Infinity ? Infinity : avgSpend * K;
    const outstandingAP = ap.reduce((a, x) => a + x.amt, 0);
    const availableCredit = Math.max(0, creditLimit - outstandingAP);
    const apPortion = Math.min(cost, availableCredit);
    if (apPortion > 0) {
      FF.addCash(apPortion);
      ap.push({ due: day + AP_LAG, amt: apPortion });
      apUsedTotal += apPortion;
    }
    if (creditLimit > 0 && creditLimit !== Infinity) { utilSum += outstandingAP / creditLimit; utilN++; }

    recentSpend.push(cost); if (recentSpend.length > AVG_WIN) recentSpend.shift();
    minCash = Math.min(minCash, FF.ledger().cash);
    if (FF.isBust()) bust = true;
  }
  const outstandingAP = ap.reduce((a, x) => a + x.amt, 0);
  const relAvg = FF.relOf().reduce((a, b) => a + b, 0) / FF.relOf().length;
  return {
    netWorth: FF.netWorth(FF.toKernelState()) - outstandingAP, minCash,
    forgoneRatio: desiredQty > 0 ? forgoneQty / desiredQty : 0, bust, relAvg,
    inventory: FF.inventory(), avgUtil: utilN ? utilSum / utilN : 0, apUsedTotal,
  };
}

function avg(a) { return a.length ? a.reduce((x, y) => x + y, 0) / a.length : NaN; }

console.log('=== AP 신용한도 K 스윕 (n=' + N_SEEDS + ', 초기자본 42000, N=' + AVG_WIN + '일) ===\n');
const allRows = {};
for (const name of Object.keys(K_CANDIDATES)) allRows[name] = [];
for (const style of Object.values(STYLES)) {
  for (let seed = 1; seed <= N_SEEDS; seed++) {
    for (const [name, K] of Object.entries(K_CANDIDATES)) allRows[name].push(runPolicy(seed, style, K));
  }
}
for (const [name, K] of Object.entries(K_CANDIDATES)) {
  const rows = allRows[name];
  console.log(name.padEnd(12),
    'netWorth avg=' + avg(rows.map(r => r.netWorth)).toFixed(0),
    '포기비율=' + (100 * avg(rows.map(r => r.forgoneRatio))).toFixed(2) + '%',
    'bust=' + (100 * rows.filter(r => r.bust).length / rows.length).toFixed(1) + '%',
    '한도이용률 평균=' + (100 * avg(rows.map(r => r.avgUtil))).toFixed(1) + '%',
    'AP사용총액 평균=' + avg(rows.map(r => r.apUsedTotal)).toFixed(0));
}

console.log('\n=== K별 none 대비 개별 승/패/동률 ===');
const EPS_TIE = 1;
for (const name of Object.keys(K_CANDIDATES)) {
  if (name === 'K=0(none)') continue;
  let better = 0, worse = 0, tie = 0;
  for (let i = 0; i < allRows['K=0(none)'].length; i++) {
    const d = allRows[name][i].netWorth - allRows['K=0(none)'][i].netWorth;
    if (d > EPS_TIE) better++; else if (d < -EPS_TIE) worse++; else tie++;
  }
  console.log(name.padEnd(12), 'none보다 나음=' + better, '못함=' + worse, '동률=' + tie);
}
