// 이슈 #21: 공통 시간척도 계약 - Intake 독립 검증. 기존 1차/2차의 "분기 고정일(day10/101/
// 192/283)에서만 진단"을 "매일 최근 DIAG_WINDOW일 롤링창으로 진단하되, 마지막 투자 후
// COOLDOWN일이 지나야 다시 살 수 있다"는 이벤트 기반 트리거로 바꾼다. 확인할 것 둘:
//   (1) 분기 사이에 생긴 병목을 더 빨리 잡는가(고정분기 대비 "진단은 됐는데 투자로 안
//       이어진 날수"가 줄어드는가)
//   (2) 과도하게 자주 사지 않는가(쿨다운 때문에 투자 횟수 자체는 오히려 적거나 비슷한가)
import fs from 'fs';

const stub = 'var FF={},FV={};';
const DOMAIN = ['src-core.js','src-store.js','src-access.js','src-uistate.js','src-kernel.js','src-runner.js','src-record.js','src-engine.js','src-counter.js','src-fact.js','src-report-data.js'];
const src = stub + DOMAIN.map(f => fs.readFileSync(f, 'utf8')).join('\n') + '\nreturn FF;';
const FF = new Function(src)();

const N_SEEDS = Number(process.argv[2] || 1000);
const HORIZON = 365;
FF.C.days = HORIZON;
const ORIGINAL_COST = Object.assign({}, FF.C.cost);
const ORIGINAL_STEP = Object.assign({}, FF.C.step);
FF.C.cost = Object.assign({}, ORIGINAL_COST, { intake: 490 });
FF.C.step = Object.assign({}, ORIGINAL_STEP, { intake: 2 });

const EPS = 1;
const DIAG_WINDOW = 9;
const COOLDOWN = 60; // 마지막 투자 후 최소 대기일 - 분기 90일보다 짧게 잡아 반응속도를 높인다
const QUARTERS_OLD = [10, 101, 192, 283];

function avg(a) { return a.length ? a.reduce((x, y) => x + y, 0) / a.length : NaN; }
function dailyNetWorth() { return FF.ledger().cash + FF.sumAmt(FF.arOf()) - FF.sumAmt(FF.apOf()); }
function prepEngine() { FF.ENGINE.value.phase.storage = FF.ENGINE.value.phase.storage || { dir: 0, n: 0 }; }
function shipShortfall(d) { return (d.sold >= d.capS - FF.C.ui.eps && d.dem > d.sold + FF.C.ui.eps) ? (d.dem - d.sold) : 0; }

function diagnoseAt(day) {
  let sumCap = 0, sumStore = 0, sumCash = 0, sumShip = 0;
  const from = Math.max(1, day - DIAG_WINDOW);
  const hist = FF.histOf();
  for (let i = 0; i < hist.length; i++) {
    const d = hist[i];
    if (d.day < from || d.day >= day) continue;
    sumCap += d.wIcap; sumStore += d.wIstore; sumCash += d.wS; sumShip += shipShortfall(d);
  }
  const maxV = Math.max(sumCap, sumStore, sumCash, sumShip);
  if (maxV <= EPS) return 'none';
  if (sumCap === maxV) return 'intake_cap';
  if (sumShip === maxV) return 'ship_cap';
  if (sumStore === maxV) return 'storage';
  return 'cash';
}

function runRolling(seed) {
  FF.reset(seed);
  prepEngine();
  let lastBuy = -Infinity;
  const buys = [];
  let unaddressedDays = 0; // intake_cap이 진단되는데 쿨다운 때문에 못 산 날(정보용, 과투자 방지의 대가)
  for (let day = FF.run().day; day <= HORIZON; day++) {
    if (FF.isOver()) break;
    let cmd = FF.Cmd.wait();
    if (day >= 10) {
      const diag = diagnoseAt(day);
      if (diag === 'intake_cap') {
        if (day - lastBuy >= COOLDOWN) { cmd = FF.Cmd.buy('intake'); buys.push(day); lastBuy = day; }
        else unaddressedDays++;
      }
    }
    FF.stepDay(cmd);
  }
  return { buys, unaddressedDays, bust: FF.isBust(), nw: dailyNetWorth() };
}

function runFixedQuarters(seed) {
  FF.reset(seed);
  prepEngine();
  const buys = [];
  for (let day = FF.run().day; day <= HORIZON; day++) {
    if (FF.isOver()) break;
    let cmd = FF.Cmd.wait();
    if (QUARTERS_OLD.includes(day)) {
      const diag = diagnoseAt(day);
      if (diag === 'intake_cap') { cmd = FF.Cmd.buy('intake'); buys.push(day); }
    }
    FF.stepDay(cmd);
  }
  return { buys, bust: FF.isBust(), nw: dailyNetWorth() };
}

// "진단은 intake_cap인데 아직 그 분기의 고정 투자일이 안 와서 방치된 날수"를 고정분기 기준으로 잰다.
function unaddressedUnderFixed(seed) {
  FF.reset(seed);
  let n = 0;
  let lastQuarterBuy = -Infinity;
  const bought = new Set();
  for (let day = FF.run().day; day <= HORIZON; day++) {
    if (FF.isOver()) break;
    FF.stepDay(FF.Cmd.wait());
    if (day >= 10) {
      const diag = diagnoseAt(day);
      if (diag === 'intake_cap') {
        const inQuarterWindow = QUARTERS_OLD.some(q => day === q);
        if (!inQuarterWindow) n++;
      }
    }
  }
  return n;
}

function runNoGrowth(seed) {
  FF.reset(seed);
  prepEngine();
  for (let day = FF.run().day; day <= HORIZON; day++) {
    if (FF.isOver()) break;
    FF.stepDay(FF.Cmd.wait());
  }
  return { bust: FF.isBust(), nw: dailyNetWorth() };
}

let completed = 0;
const buyCountsRolling = [], buyCountsFixed = [];
const diffRolling = [], diffFixed = [];
const unaddressedFixedArr = [], unaddressedRollingArr = [];
const buyDaysRolling = [];

for (let seed = 1; seed <= N_SEEDS; seed++) {
  const roll = runRolling(seed);
  const fixed = runFixedQuarters(seed);
  const base = runNoGrowth(seed);
  const unaddr = unaddressedUnderFixed(seed);
  if (roll.bust || fixed.bust || base.bust) continue;
  completed++;
  buyCountsRolling.push(roll.buys.length);
  buyCountsFixed.push(fixed.buys.length);
  diffRolling.push(roll.nw - base.nw);
  diffFixed.push(fixed.nw - base.nw);
  unaddressedFixedArr.push(unaddr);
  unaddressedRollingArr.push(roll.unaddressedDays);
  buyDaysRolling.push(...roll.buys);
}

console.log(`완주 n=${completed}/${N_SEEDS}`);
console.log(`\n[투자 횟수/seed] 롤링(쿨다운${COOLDOWN}일) 평균=${avg(buyCountsRolling).toFixed(2)}  고정분기(4회 상한) 평균=${avg(buyCountsFixed).toFixed(2)}`);
console.log(`[분기 사이 방치일] 고정분기 기준(intake_cap 진단됐지만 분기일이 아니라 방치) 평균=${avg(unaddressedFixedArr).toFixed(1)}일/seed`);
console.log(`[쿨다운 중 방치일] 롤링 기준(진단됐지만 쿨다운으로 못 삼) 평균=${avg(unaddressedRollingArr).toFixed(1)}일/seed`);
console.log(`\n[경제가치] 365일말 netWorth 쌍차(대비 무성장) 평균: 롤링=${avg(diffRolling).toFixed(0)}  고정분기=${avg(diffFixed).toFixed(0)}`);
console.log(`  양수비율: 롤링=${(100 * diffRolling.filter(v => v > 0).length / completed).toFixed(1)}%  고정분기=${(100 * diffFixed.filter(v => v > 0).length / completed).toFixed(1)}%`);

const monthBuckets = new Array(13).fill(0);
for (const d of buyDaysRolling) monthBuckets[Math.min(12, Math.floor((d - 1) / 30))]++;
console.log(`\n[롤링 투자일 월별 분포] ${monthBuckets.map((v, i) => `M${i + 1}:${v}`).join(' ')}`);

FF.C.cost = ORIGINAL_COST; FF.C.step = ORIGINAL_STEP; FF.C.days = 30;
