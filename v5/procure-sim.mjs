// 이슈 #5 1단계: 조달(procurement) 후보 3개를 커널 밖 오버레이로 구현한다.
// 커널 파일은 건드리지 않는다. FF.reset/FF.stepDay/FF.transition을 그대로 쓰고,
// 매일 stepDay 전에 FF.setProd로 확정 생산량을 살짝 올리는 방식으로만 개입한다.
// 신용(credit) 매입의 대금 지급 유예는 이 스크립트 안에서만 도는 외부 ap 배열로 흉내낸다
// (커널의 s.ap는 지금 죽은 코드라 건드리지 않는다).
import fs from 'fs';

const stub = 'var FF={},FV={};';
const DOMAIN = ['src-core.js','src-store.js','src-access.js','src-uistate.js','src-kernel.js','src-runner.js','src-record.js','src-engine.js','src-counter.js','src-fact.js','src-report-data.js'];
const src = stub + DOMAIN.map(f => fs.readFileSync(f, 'utf8')).join('\n') + '\nreturn FF;';
const FF = new Function(src)();

// 1차 300시드 결과(할인10%/수수료3%)에서 선불이 83.3% 승률로 지배했고 신용은
// cashOnly 대비 296/300에서 열세였다. 파라미터를 조정해 재검증하기 위해 CLI 인자로 받는다.
// node procure-sim.mjs [discount] [fee] [lag] [seeds]
const PREPAID_DISCOUNT = process.argv[2] !== undefined ? Number(process.argv[2]) : 0.10; // 선불 즉시 할인
const CREDIT_FEE = process.argv[3] !== undefined ? Number(process.argv[3]) : 0.03;       // 외상 수수료(원금 대비)
const CREDIT_LAG = process.argv[4] !== undefined ? Number(process.argv[4]) : 7;          // 외상 대금이 며칠 뒤 빠지는지
const N_SEEDS_ARG = process.argv[5] !== undefined ? Number(process.argv[5]) : 300;

const POLICIES = ['none', 'cashOnly', 'creditFirst', 'prepaidFirst'];

// 하루치 조달량 계산. 오늘 자연 생산(prod)이 목표 입고량(need)에 못 미치고
// 입고 한도(cap.intake)에도 여유가 있을 때만, 그 부족분만큼만 시장에서 더 산다.
// 남는 만큼만 채우므로(over-생산으로 인한 폐기량 왜곡이 없다) 정책 간 비교가 공정하다.
function computeExtra() {
  const prod = FF.prodOf();
  const cap = FF.capsOf();
  const M = FF.marketOf();
  const need = FF.intakeNeed(M.di, cap.sales, FF.coverOf(), FF.inventory(), FF.C);
  const baseAcc = Math.min(prod, cap.intake, need);
  const shortfall = Math.max(0, need - baseAcc);
  const headroom = Math.max(0, cap.intake - prod);
  return { prod, extra: Math.min(shortfall, headroom) };
}

function runPolicy(seed, policyKey) {
  FF.reset(seed);
  let ap = []; // {due,amt} 외상매입금. 커널 밖에서만 관리한다.
  let procured = 0, procureDays = 0;
  for (let day = 1; day <= FF.C.days; day++) {
    if (FF.isOver()) break;
    const { prod, extra } = computeExtra();
    const unitCost = FF.C.farm;

    if (extra > 0 && policyKey !== 'none') {
      procured += extra; procureDays++;
      FF.setProd(prod + extra);
      if (policyKey === 'creditFirst') {
        // 오늘 커널이 자동으로 뗄 extra*unitCost를 먼저 채워 넣어 오늘의 현금 압박을 없앤다.
        FF.addCash(extra * unitCost);
        ap.push({ due: day + CREDIT_LAG, amt: Math.round(extra * unitCost * (1 + CREDIT_FEE)) });
      }
    }

    // 만기 도달한 외상매입금을 오늘 갚는다.
    ap = ap.filter(x => {
      if (x.due <= day) { FF.addCash(-x.amt); return false; }
      return true;
    });

    FF.stepDay(FF.Cmd.wait());

    if (policyKey === 'prepaidFirst' && extra > 0) {
      FF.addCash(extra * unitCost * PREPAID_DISCOUNT); // 선불 할인 환급
    }
  }
  const outstandingAP = ap.reduce((s, x) => s + x.amt, 0);
  const s = FF.toKernelState();
  return {
    netWorth: FF.netWorth(s) - outstandingAP,
    cash: FF.ledger().cash,
    inventory: FF.inventory(),
    rel: FF.relOf().slice(),
    relAvg: FF.relOf().reduce((a, b) => a + b, 0) / FF.relOf().length,
    outstandingAP,
    procured, procureDays,
    bust: FF.isBust()
  };
}

const N_SEEDS = N_SEEDS_ARG;
const seeds = Array.from({ length: N_SEEDS }, (_, i) => i + 1);
console.log('파라미터: discount=' + PREPAID_DISCOUNT + ' fee=' + CREDIT_FEE + ' lag=' + CREDIT_LAG + ' seeds=' + N_SEEDS);

const rows = {}; // policyKey -> array of results
for (const p of POLICIES) rows[p] = [];

for (const seed of seeds) {
  for (const p of POLICIES) rows[p].push(runPolicy(seed, p));
}

function avg(a) { return a.reduce((x, y) => x + y, 0) / a.length; }
function stdev(a) { const m = avg(a); return Math.sqrt(avg(a.map(x => (x - m) * (x - m)))); }

console.log('=== 시드별 순자산 요약 (n=' + N_SEEDS + ') ===');
for (const p of POLICIES) {
  const nw = rows[p].map(r => r.netWorth);
  const inv = rows[p].map(r => r.inventory);
  const rel = rows[p].map(r => r.relAvg);
  const cash = rows[p].map(r => r.cash);
  const busts = rows[p].filter(r => r.bust).length;
  const procured = rows[p].map(r => r.procured);
  console.log(p.padEnd(12),
    'netWorth avg=' + avg(nw).toFixed(0), 'sd=' + stdev(nw).toFixed(0),
    'inv avg=' + avg(inv).toFixed(2),
    'relAvg avg=' + avg(rel).toFixed(3),
    'cash avg=' + avg(cash).toFixed(0),
    'procured avg=' + avg(procured).toFixed(2),
    'bust=' + busts);
}

console.log('\n=== 시드별 승자(순자산 최대) 집계 ===');
const wins = {}; for (const p of POLICIES) wins[p] = 0;
const margin = [];
for (let i = 0; i < seeds.length; i++) {
  let best = null, bestNw = -Infinity, second = -Infinity;
  const vals = POLICIES.map(p => rows[p][i].netWorth).sort((a, b) => b - a);
  for (const p of POLICIES) {
    if (rows[p][i].netWorth > bestNw) { bestNw = rows[p][i].netWorth; best = p; }
  }
  second = vals[1];
  wins[best]++;
  margin.push(bestNw - second);
}
for (const p of POLICIES) {
  console.log(p.padEnd(12), 'wins=' + wins[p], 'winRate=' + (100 * wins[p] / N_SEEDS).toFixed(1) + '%');
}
console.log('best-second 격차 avg=' + avg(margin).toFixed(1), 'min=' + Math.min(...margin).toFixed(1));

console.log('\n=== 정책 간 물리량(재고/관계) 차이 검사: cashOnly 대비 ===');
for (const p of ['creditFirst', 'prepaidFirst']) {
  let maxInvDiff = 0, maxRelDiff = 0;
  for (let i = 0; i < seeds.length; i++) {
    maxInvDiff = Math.max(maxInvDiff, Math.abs(rows[p][i].inventory - rows.cashOnly[i].inventory));
    maxRelDiff = Math.max(maxRelDiff, Math.abs(rows[p][i].relAvg - rows.cashOnly[i].relAvg));
  }
  console.log(p.padEnd(12), 'cashOnly 대비 재고 최대차=' + maxInvDiff, '관계 최대차=' + maxRelDiff.toFixed(3));
}

console.log('\n=== credit vs cashOnly 개별 비교 ===');
let creditBetter = 0, cashBetter = 0, tie = 0;
const diffs = [];
for (let i = 0; i < seeds.length; i++) {
  const d = rows.creditFirst[i].netWorth - rows.cashOnly[i].netWorth;
  diffs.push(d);
  if (d > 1) creditBetter++; else if (d < -1) cashBetter++; else tie++;
}
console.log('credit이 나음=' + creditBetter, 'cash가 나음=' + cashBetter, '동률=' + tie,
  '평균차=' + avg(diffs).toFixed(1));
