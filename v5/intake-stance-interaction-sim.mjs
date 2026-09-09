// 이슈 #19/#21: 물적자본(Intake)과 관계자본(Stance)을 함께 운용할 때 상호작용이 있는가.
// 4군 2x2: baseline(둘 다 없음) / physical(Intake만 반응형) / relational(Stance만 반응형) /
// combined(둘 다 반응형). 트리거는 각각 독립검증을 통과한 것을 그대로 쓴다 - Intake는
// 롤링9일창+쿨다운60일(intake-rolling-trigger-sim.mjs), Stance는 관계 하락 시 그 채널
// stance+1(stance-effect-attribution-sim.mjs). 같은 날 둘 다 조건을 만족하면 Intake를
// 우선한다(부분3차와 동일 우선순위, 자본투자가 매일 나는 stance보다 희소한 슬롯이라서).
//
// combined가 physical+relational의 단순 합인지, 그 이상/이하인지(보완재/대체재)를 본다.
// interaction(seed) = combined - physical - relational + baseline. 양수면 보완재
// (관계자본이 물적투자의 회수를 돕거나 그 반대), 음수면 대체재(한쪽이 있으면 다른 쪽 가치가 준다).
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
const COOLDOWN = 60;
const QBOUNDS = [91, 182, 273, 365]; // 4분기 경계(끝 day)

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

function runSeed(seed, intakeOn, stanceOn) {
  FF.reset(seed);
  prepEngine();
  let lastIntakeBuy = -Infinity;
  let prevRel = FF.relOf().slice();
  let pendingRaise = -1;
  const q = QBOUNDS.map(() => ({ sold: 0, revenue: 0, missed: 0, intakeDays: 0, days: 0, relSum: 0 }));
  let qi = 0;
  for (let day = FF.run().day; day <= HORIZON; day++) {
    if (FF.isOver()) break;
    let cmd = FF.Cmd.wait();
    if (intakeOn && day >= 10) {
      const diag = diagnoseAt(day);
      if (diag === 'intake_cap' && day - lastIntakeBuy >= COOLDOWN) {
        cmd = FF.Cmd.buy('intake'); lastIntakeBuy = day;
      }
    }
    if (cmd.type === 'wait' && stanceOn && pendingRaise !== -1) {
      const stance = (FF.stanceOf() || FF.C.channels.map(() => FF.C.stance.start)).slice();
      if (stance[pendingRaise] < 3) { stance[pendingRaise]++; cmd = FF.Cmd.stance(stance); }
    }
    pendingRaise = -1;
    FF.stepDay(cmd);
    if (stanceOn) {
      const curRel = FF.relOf();
      for (let i = 0; i < curRel.length; i++) if (curRel[i] < prevRel[i]) { pendingRaise = i; break; }
      prevRel = curRel.slice();
    }
    const d = FF.today();
    while (day > QBOUNDS[qi]) qi++;
    const bucket = q[qi];
    bucket.sold += d.sold; bucket.missed += d.missed; bucket.days++;
    bucket.relSum += avg(FF.relOf());
    if (d.b === 'intake') bucket.intakeDays++;
    for (let ci = 0; ci < d.revCh.length; ci++) bucket.revenue += d.revCh[ci];
  }
  return { q, bust: FF.isBust(), nw: dailyNetWorth() };
}

const POLICIES = [
  { key: 'baseline', intake: false, stance: false },
  { key: 'physical', intake: true, stance: false },
  { key: 'relational', intake: false, stance: true },
  { key: 'combined', intake: true, stance: true },
];

let completed = 0;
const nwByPolicy = { baseline: [], physical: [], relational: [], combined: [] };
const qByPolicy = { baseline: [], physical: [], relational: [], combined: [] };
const interactions = [];

for (let seed = 1; seed <= N_SEEDS; seed++) {
  const runs = {};
  let ok = true;
  for (const p of POLICIES) { runs[p.key] = runSeed(seed, p.intake, p.stance); if (runs[p.key].bust) ok = false; }
  if (!ok) continue;
  completed++;
  for (const p of POLICIES) { nwByPolicy[p.key].push(runs[p.key].nw); qByPolicy[p.key].push(runs[p.key].q); }
  const inter = runs.combined.nw - runs.physical.nw - runs.relational.nw + runs.baseline.nw;
  interactions.push(inter);
}

console.log(`완주(4정책 전부 무파산) n=${completed}/${N_SEEDS}`);

console.log(`\n[365일말 netWorth]`);
for (const p of POLICIES) console.log(`  ${p.key.padEnd(11)} 평균=${avg(nwByPolicy[p.key]).toFixed(0)}`);

console.log(`\n[가법성 검정] interaction = combined - physical - relational + baseline`);
console.log(`  평균 = ${avg(interactions).toFixed(0)}  양수비율(보완재 방향) = ${(100 * interactions.filter(v => v > 0).length / completed).toFixed(1)}%`);
console.log(`  (참고) physical-baseline 평균 = ${(avg(nwByPolicy.physical) - avg(nwByPolicy.baseline)).toFixed(0)}, relational-baseline 평균 = ${(avg(nwByPolicy.relational) - avg(nwByPolicy.baseline)).toFixed(0)}, 단순합 = ${(avg(nwByPolicy.physical) - avg(nwByPolicy.baseline) + avg(nwByPolicy.relational) - avg(nwByPolicy.baseline)).toFixed(0)}, combined-baseline 실제 = ${(avg(nwByPolicy.combined) - avg(nwByPolicy.baseline)).toFixed(0)}`);

console.log(`\n[분기별 지표(정책별 평균)]`);
for (let qi = 0; qi < 4; qi++) {
  console.log(`\n Q${qi + 1}(~day${QBOUNDS[qi]}):`);
  for (const p of POLICIES) {
    const buckets = qByPolicy[p.key].map(q => q[qi]);
    const throughput = avg(buckets.map(b => b.sold));
    const price = avg(buckets.map(b => b.revenue / Math.max(1, b.sold)));
    const rel = avg(buckets.map(b => b.relSum / Math.max(1, b.days)));
    const intakePct = avg(buckets.map(b => 100 * b.intakeDays / Math.max(1, b.days)));
    const missed = avg(buckets.map(b => b.missed));
    console.log(`  ${p.key.padEnd(11)} throughput=${throughput.toFixed(0)} 실현가격=${price.toFixed(1)} 관계=${rel.toFixed(3)} intake병목%=${intakePct.toFixed(1)} missed=${missed.toFixed(1)}`);
  }
}

FF.C.cost = ORIGINAL_COST; FF.C.step = ORIGINAL_STEP; FF.C.days = 30;
