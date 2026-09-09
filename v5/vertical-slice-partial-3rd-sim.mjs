// 이슈 #21 3차(부분): 독립검증을 통과한 트리거만 교체해서 다시 돌린다.
//   - Intake: 분기 고정일 대신 매일 롤링 9일창 진단 + 쿨다운60일(intake-rolling-trigger-sim.mjs, 통과)
//   - Stance: 관계 하락(stance와 무관하게 always-reachable, 검증 완료) 시 그 채널 stance+1(최대 3)
//   - Contract: 기존 그대로(day1 1회, 커널 제약 R.contract.until=1,max=1)
//   - Factoring: 기존 그대로(FF.factorPlan().eligible/suggested)
//   - Sales capacity: 여전히 제외 - 노출조건 재설계가 안 끝나서 관측만 하고 사지 않는다
//     (#19 Track B 기각 결과도 그대로 유지)
// 우선순위(하루 한 커맨드): Intake 롤링 > Factoring > Stance. Contract는 day1 전용이라 안 겹친다.
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
const COOLDOWN = 60;

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
  let lastIntakeBuy = -Infinity;
  let prevRel = FF.relOf().slice();
  let pendingStanceRaise = -1;
  const nwByMonth = new Array(13).fill(null);
  let mStart = 1;
  for (let day = FF.run().day; day <= HORIZON; day++) {
    if (FF.isOver()) break;
    let cmd = FF.Cmd.wait();
    if (allActive) {
      if (day === 1) {
        const opts = FF.C.contract.options;
        const mid = opts[Math.floor(opts.length / 2)];
        const opt = FF.contractOption(mid.x);
        if (opt && FF.ledger().cash >= opt.price) { cmd = FF.Cmd.contract(mid.x); decisions.push({ day, type: 'contract' }); }
      } else {
        const diag = day >= 10 ? diagnoseAt(day) : 'none';
        if (diag === 'intake_cap' && day - lastIntakeBuy >= COOLDOWN) {
          cmd = FF.Cmd.buy('intake'); decisions.push({ day, type: 'intake_buy' }); lastIntakeBuy = day;
        } else {
          const fp = FF.factorPlan();
          if (fp.eligible && fp.suggested > EPS) {
            cmd = FF.Cmd.factor(fp.suggested); decisions.push({ day, type: 'factor' });
          } else {
            // 어제 stepDay 직후 감지한 "관계 하락" 채널이 있으면 오늘 그 채널 stance를 올린다.
            // 하락 자체는 stance와 무관하게 항상 도달 가능한 사건이다(검증 완료).
            const raiseCh = pendingStanceRaise;
            if (raiseCh !== -1) {
              const stance = (FF.stanceOf() || FF.C.channels.map(() => FF.C.stance.start)).slice();
              if (stance[raiseCh] < 3) {
                stance[raiseCh]++;
                cmd = FF.Cmd.stance(stance); decisions.push({ day, type: 'stance' });
              }
            }
            pendingStanceRaise = -1;
          }
        }
      }
      if (salesExposedToday()) salesExposureDays++;
    }
    FF.stepDay(cmd);
    if (allActive) {
      const curRel = FF.relOf();
      pendingStanceRaise = -1;
      for (let i = 0; i < curRel.length; i++) if (curRel[i] < prevRel[i]) { pendingStanceRaise = i; break; }
      prevRel = curRel.slice();
    }
    const nextBoundary = Math.min(HORIZON, mStart + 29);
    if (day === nextBoundary || day === HORIZON) { nwByMonth[Math.min(12, Math.floor((mStart - 1) / 30))] = dailyNetWorth(); mStart = day + 1; }
  }
  return { decisions, salesExposureDays, nwByMonth, bust: FF.isBust(), nw: dailyNetWorth() };
}

let completed = 0, bustActive = 0, bustCtrl = 0;
const finalDiff = [];
const decisionCounts = [];
const typeCounts = {};
const monthlyDecisionDays = new Array(13).fill(0);
let totalSalesExposureDays = 0;

for (let seed = 1; seed <= N_SEEDS; seed++) {
  const a = runSeed(seed, true);
  const c = runSeed(seed, false);
  if (a.bust) bustActive++;
  if (c.bust) bustCtrl++;
  if (a.bust || c.bust) continue;
  completed++;
  finalDiff.push(a.nw - c.nw);
  decisionCounts.push(a.decisions.length);
  totalSalesExposureDays += a.salesExposureDays;
  for (const d of a.decisions) {
    typeCounts[d.type] = (typeCounts[d.type] || 0) + 1;
    const m = Math.min(12, Math.floor((d.day - 1) / 30));
    monthlyDecisionDays[m]++;
  }
}

console.log(`완주(양쪽 무파산) n=${completed}/${N_SEEDS}, 파산(전체레버/무성장) = ${bustActive}/${bustCtrl}`);
console.log(`\n[Decision density] seed당 365일 중 실제 결정 횟수: 평균=${avg(decisionCounts).toFixed(2)} 최소=${Math.min(...decisionCounts)} 최대=${Math.max(...decisionCounts)}`);
console.log(`30일 환산: 평균 ${(avg(decisionCounts) / 365 * 30).toFixed(2)}회/30일`);
console.log(`\n[Decision diversity] 유형별 총 발생 횟수:`);
for (const [k, v] of Object.entries(typeCounts).sort((a, b) => b[1] - a[1])) console.log(`  ${k}: ${v}`);
console.log(`\n[Temporal distribution] 월 단위 결정 발생 횟수 합계:`);
console.log('  ' + monthlyDecisionDays.map((v, i) => `M${i + 1}:${v}`).join(' '));
const emptyMonths = monthlyDecisionDays.filter(v => v === 0).length;
console.log(`  비어있는 월 개수 = ${emptyMonths}/13`);
console.log(`\n[Sales capacity 자연노출] seed당 평균 = ${(totalSalesExposureDays / completed).toFixed(1)}일/365일 (구매는 하지 않음)`);
console.log(`\n365일말 netWorth 쌍차(부분3차 반응형 - 무성장) 평균 = ${avg(finalDiff).toFixed(0)}  양수비율 = ${(100 * finalDiff.filter(v => v > 0).length / completed).toFixed(1)}%`);

FF.C.cost = ORIGINAL_COST; FF.C.step = ORIGINAL_STEP; FF.C.days = 30;
