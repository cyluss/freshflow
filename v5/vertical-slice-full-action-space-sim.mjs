// 이슈 #21 2차: 다섯 레버 전체를 각자의 기존 노출조건 그대로 반응형으로 켠다. 모든 버튼을
// 누르는 정책이 아니라 각 기능이 이미 가진 조건을 그대로 존중하는 정책이다.
//   - Intake: 1차와 동일한 분기 진단 기반 재투자(headless 레버, #19).
//   - Contract: 커널 규칙상 원래 1회·day1까지만 가능(R.contract.until=1,max=1) - day1에
//     한 번만, 중간 크기 옵션을 고른다(새 예측규칙을 만들지 않는다 - #5/#9에서 예측 기반
//     조달 선택은 이미 기각됐다).
//   - Factoring: FF.factorPlan().eligible/suggested를 그대로 쓴다 - 실제 버튼이 뜨는
//     조건과 제안액 그대로다.
//   - Stance: FF.issueOf()/FF.issueFeasible()가 이미 계산해 화면(IssueBar)에 뿌리는 신호
//     그대로 쓴다 - 열린 이슈가 있고 feasible이 "ok"면 그 채널 stance를 올리고, "hard"/"low"면
//     내린다. 새 신호를 만들지 않는다.
//   - Sales capacity: 자연 노출(CapacityButton 조건)은 계산해서 기록만 하고 실제로 사지
//     않는다 - #19 Track B의 기각 결과를 뒤집는 새 자동투자 정책을 만들지 않는다.
//
// 하루 한 커맨드만 나갈 수 있어서 우선순위를 둔다: 분기 Intake 투자일 > Factoring(그날
// 급함) > Stance 조정 > 대기. Contract는 day1 전용이라 겹칠 일이 없다.
import fs from 'fs';

const stub = 'var FF={},FV={};';
const DOMAIN = ['src-core.js','src-store.js','src-access.js','src-uistate.js','src-kernel.js','src-runner.js','src-record.js','src-engine.js','src-counter.js','src-fact.js','src-report-data.js'];
const src = stub + DOMAIN.map(f => fs.readFileSync(f, 'utf8')).join('\n') + '\nreturn FF;';
const FF = new Function(src)();

const N_SEEDS = Number(process.argv[2] || 2000);
const HORIZON = 365;
FF.C.days = HORIZON;
const ORIGINAL_COST = Object.assign({}, FF.C.cost);
const ORIGINAL_STEP = Object.assign({}, FF.C.step);
FF.C.cost = Object.assign({}, ORIGINAL_COST, { intake: 490 });
FF.C.step = Object.assign({}, ORIGINAL_STEP, { intake: 2 });

const EPS = 1;
const DIAG_WINDOW = 9;
const QUARTERS = [10, 101, 192, 283];

function avg(a) { return a.length ? a.reduce((x, y) => x + y, 0) / a.length : NaN; }
function dailyNetWorth() { return FF.ledger().cash + FF.sumAmt(FF.arOf()) - FF.sumAmt(FF.apOf()); }
function prepEngine() { FF.ENGINE.value.phase.storage = FF.ENGINE.value.phase.storage || { dir: 0, n: 0 }; }
function shipShortfall(d) { return (d.sold >= d.capS - FF.C.ui.eps && d.dem > d.sold + FF.C.ui.eps) ? (d.dem - d.sold) : 0; }

function diagnose(day) {
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

function salesExposedToday() {
  const hit = FF.capHits('sales', 5);
  const shortfall = FF.factsByChannel().some(r => r['curr.plan.allocation.missed'] >= 2);
  return !!(hit.n || hit.last || shortfall);
}

function runSeed(seed, allActive) {
  FF.reset(seed);
  prepEngine();
  const decisions = [];
  let salesExposureDays = 0;
  const quarterCensus = [];
  const nwByQuarter = [];
  let qStart = 1;
  for (let day = FF.run().day; day <= HORIZON; day++) {
    if (FF.isOver()) break;
    let cmd = FF.Cmd.wait();
    if (allActive) {
      if (day === 1) {
        // Contract: 원래도 day1 1회뿐이다. 중간 크기 옵션을 고정으로 고른다(예측 규칙 아님).
        const opts = FF.C.contract.options;
        const mid = opts[Math.floor(opts.length / 2)];
        const opt = FF.contractOption(mid.x);
        if (opt && FF.ledger().cash >= opt.price) { cmd = FF.Cmd.contract(mid.x); decisions.push({ day, type: 'contract', detail: mid.x }); }
      } else if (QUARTERS.includes(day)) {
        const diag = diagnose(day);
        if (diag === 'intake_cap') { cmd = FF.Cmd.buy('intake'); decisions.push({ day, type: 'intake_buy', detail: diag }); }
        else decisions.push({ day, type: 'diagnose_noop', detail: diag });
      } else {
        const fp = FF.factorPlan();
        if (fp.eligible && fp.suggested > EPS) {
          cmd = FF.Cmd.factor(fp.suggested); decisions.push({ day, type: 'factor', detail: fp.suggested });
        } else {
          const issues = FF.issueOf() || [];
          const nch = FF.C.channels.length;
          const stance = (FF.stanceOf() || FF.C.channels.map(() => FF.C.stance.start)).slice();
          let changed = -1;
          for (let i = 0; i < nch; i++) {
            if (!issues[i]) continue;
            const feas = FF.issueFeasible(i);
            if (feas === 'ok' && stance[i] < 3) { stance[i]++; changed = i; break; }
            if ((feas === 'hard' || feas === 'low') && stance[i] > 0) { stance[i]--; changed = i; break; }
          }
          if (changed !== -1) { cmd = FF.Cmd.stance(stance); decisions.push({ day, type: 'stance', detail: `ch${changed}->${stance[changed]}` }); }
        }
      }
      if (salesExposedToday()) salesExposureDays++;
    }
    FF.stepDay(cmd);
    const nextBoundary = QUARTERS.find(q => q > qStart) || (HORIZON + 1);
    if (day === nextBoundary - 1 || day === HORIZON) {
      const hist = FF.histOf();
      const c = {}; let n = 0;
      for (const d of hist) { if (d.day < qStart || d.day > day) continue; c[d.b] = (c[d.b] || 0) + 1; n++; }
      quarterCensus.push(Object.entries(c).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k}:${(100 * v / n).toFixed(0)}%`).join(' '));
      nwByQuarter.push(dailyNetWorth());
      qStart = day + 1;
    }
  }
  return { decisions, salesExposureDays, quarterCensus, nwByQuarter, bust: FF.isBust(), nw: dailyNetWorth() };
}

let completed = 0, bustActive = 0, bustCtrl = 0;
const finalDiff = [];
const decisionCounts = [];
const typeCounts = {};
const monthlyDecisionDays = new Array(13).fill(0); // 1~12월 근사(30일 단위) 결정일 분포
let totalSalesExposureDays = 0;

for (let seed = 1; seed <= N_SEEDS; seed++) {
  const a = runSeed(seed, true);
  const c = runSeed(seed, false);
  if (a.bust) bustActive++;
  if (c.bust) bustCtrl++;
  if (a.bust || c.bust) continue;
  completed++;
  finalDiff.push(a.nw - c.nw);
  decisionCounts.push(a.decisions.filter(d => d.type !== 'diagnose_noop').length);
  totalSalesExposureDays += a.salesExposureDays;
  for (const d of a.decisions) {
    typeCounts[d.type] = (typeCounts[d.type] || 0) + 1;
    if (d.type !== 'diagnose_noop') {
      const m = Math.min(12, Math.floor((d.day - 1) / 30));
      monthlyDecisionDays[m]++;
    }
  }
}

console.log(`완주(양쪽 무파산) n=${completed}/${N_SEEDS}, 파산(전체레버/무성장) = ${bustActive}/${bustCtrl}`);

console.log(`\n[Decision density] seed당 365일 중 실제 결정(진단-only 제외) 횟수: 평균=${avg(decisionCounts).toFixed(2)} 최소=${Math.min(...decisionCounts)} 최대=${Math.max(...decisionCounts)}`);
console.log(`30일 환산: 평균 ${(avg(decisionCounts) / 365 * 30).toFixed(2)}회/30일`);

console.log(`\n[Decision diversity] 유형별 총 발생 횟수(전체 seed 합산, diagnose_noop 제외):`);
for (const [k, v] of Object.entries(typeCounts).sort((a, b) => b[1] - a[1])) {
  if (k === 'diagnose_noop') continue;
  console.log(`  ${k}: ${v}`);
}

console.log(`\n[Temporal distribution] 월 단위(30일 근사) 결정 발생 횟수 합계:`);
console.log('  ' + monthlyDecisionDays.map((v, i) => `M${i + 1}:${v}`).join(' '));

console.log(`\n[Sales capacity 자연노출] seed당 365일 중 버튼이 뜰 조건을 만족한 날 평균 = ${(totalSalesExposureDays / completed).toFixed(1)}일 (실제 구매는 하지 않음)`);

console.log(`\n365일말 netWorth 쌍차(전체레버 반응형 - 무성장) 평균 = ${avg(finalDiff).toFixed(0)}  양수비율 = ${(100 * finalDiff.filter(v => v > 0).length / completed).toFixed(1)}%`);

FF.C.cost = ORIGINAL_COST; FF.C.step = ORIGINAL_STEP; FF.C.days = 30;
