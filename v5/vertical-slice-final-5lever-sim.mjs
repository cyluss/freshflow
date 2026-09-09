// 이슈 #21: 최종 5레버 365일 통합시험. 새 threshold 탐색이나 밸런싱은 하지 않는다 - 이미
// 각각 독립검증을 통과한 트리거를 그대로 합친다.
//   - Intake: 롤링9일창 진단 + 쿨다운60일(intake-rolling-trigger-sim.mjs, 통과)
//   - Stance: 관계 하락 시 그 채널 stance+1(stance-effect-attribution-sim.mjs, 통과)
//   - Contract: day1 1회, 커널 제약(R.contract.until=1,max=1) 그대로, 중간크기 옵션 고정
//   - Factoring: FF.factorPlan().eligible/suggested 그대로(#9에서 피드백 보완 완료)
//   - Sales: shortfallRatio(최근14일 shipShortfall합/capS합 > 0.10) - PASS 판정된 신호
//     (sales-scale-invariant-signal-sim.mjs). 과도한 연속매입 방지로 쿨다운60일(Intake와
//     동일 관례)만 붙인다 - 이건 새 threshold가 아니라 이미 Intake가 쓰던 실행 관례의 재사용이다.
// 우선순위(하루 한 커맨드): Intake > Sales > Factoring > Stance. 자본투자(물적)가 재무·관계
// 조정보다 우선한다는 기존 관례(부분3차)를 그대로 유지하고 Sales를 같은 급으로 추가했다.
//
// 완료조건(#21 원안 그대로): 관측→판단→개입→피드백→기업상태변화→다음판단이 365일 동안
// 반복되는가. decision density/diversity/temporal distribution + 경제가치로 PASS/FAIL을 낸다.
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
const SIG_WINDOW = 14;
const TH_SHORTFALL_RATIO = 0.10; // sales-scale-invariant-signal-sim.mjs에서 PASS 판정된 고정값

function avg(a) { return a.length ? a.reduce((x, y) => x + y, 0) / a.length : NaN; }
function dailyNetWorth() { return FF.ledger().cash + FF.sumAmt(FF.arOf()) - FF.sumAmt(FF.apOf()); }
function prepEngine() { FF.ENGINE.value.phase.storage = FF.ENGINE.value.phase.storage || { dir: 0, n: 0 }; }
function shipShortfall(d) { return (d.sold >= d.capS - FF.C.ui.eps && d.dem > d.sold + FF.C.ui.eps) ? (d.dem - d.sold) : 0; }

function diagnoseAt(day, hist) {
  let sumCap = 0, sumStore = 0, sumCash = 0, sumShip = 0;
  const from = Math.max(1, day - DIAG_WINDOW);
  for (let i = 0; i < hist.length; i++) {
    const d = hist[i];
    if (d.day < from || d.day >= day) continue;
    sumCap += d.wIcap; sumStore += d.wIstore; sumCash += d.wS; sumShip += shipShortfall(d);
  }
  const maxV = Math.max(sumCap, sumStore, sumCash, sumShip);
  if (maxV <= EPS) return 'none';
  if (sumCap === maxV) return 'intake_cap';
  return 'other';
}

function shortfallRatioAt(day, hist) {
  const from = Math.max(1, day - SIG_WINDOW);
  let shortfall = 0, capSsum = 0;
  for (const d of hist) {
    if (d.day < from || d.day >= day) continue;
    shortfall += shipShortfall(d); capSsum += d.capS;
  }
  return capSsum > 0 ? shortfall / capSsum : 0;
}

function runSeed(seed, allActive) {
  FF.reset(seed);
  prepEngine();
  const hist = [];
  const decisions = [];
  let lastIntakeBuy = -Infinity, lastSalesBuy = -Infinity;
  let prevRel = FF.relOf().slice();
  let pendingStanceRaise = -1;
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
        const diag = day >= 10 ? diagnoseAt(day, hist) : 'none';
        const sfRatio = shortfallRatioAt(day, hist);
        if (diag === 'intake_cap' && day - lastIntakeBuy >= COOLDOWN) {
          cmd = FF.Cmd.buy('intake'); decisions.push({ day, type: 'intake_buy' }); lastIntakeBuy = day;
        } else if (sfRatio > TH_SHORTFALL_RATIO && day - lastSalesBuy >= COOLDOWN) {
          cmd = FF.Cmd.buy('sales'); decisions.push({ day, type: 'sales_buy' }); lastSalesBuy = day;
        } else {
          const fp = FF.factorPlan();
          if (fp.eligible && fp.suggested > EPS) {
            cmd = FF.Cmd.factor(fp.suggested); decisions.push({ day, type: 'factor' });
          } else if (pendingStanceRaise !== -1) {
            const stance = (FF.stanceOf() || FF.C.channels.map(() => FF.C.stance.start)).slice();
            if (stance[pendingStanceRaise] < 3) {
              stance[pendingStanceRaise]++; cmd = FF.Cmd.stance(stance); decisions.push({ day, type: 'stance' });
            }
          }
        }
      }
    }
    pendingStanceRaise = -1;
    FF.stepDay(cmd);
    if (allActive) {
      const curRel = FF.relOf();
      for (let i = 0; i < curRel.length; i++) if (curRel[i] < prevRel[i]) { pendingStanceRaise = i; break; }
      prevRel = curRel.slice();
    }
    hist.push(FF.today());
  }
  return { decisions, bust: FF.isBust(), nw: dailyNetWorth() };
}

let completed = 0, bustActive = 0, bustCtrl = 0;
const finalDiff = [];
const decisionCounts = [];
const typeCounts = {};
const monthlyDecisionDays = new Array(13).fill(0);

for (let seed = 1; seed <= N_SEEDS; seed++) {
  const a = runSeed(seed, true);
  const c = runSeed(seed, false);
  if (a.bust) bustActive++;
  if (c.bust) bustCtrl++;
  if (a.bust || c.bust) continue;
  completed++;
  finalDiff.push(a.nw - c.nw);
  decisionCounts.push(a.decisions.length);
  for (const d of a.decisions) {
    typeCounts[d.type] = (typeCounts[d.type] || 0) + 1;
    const m = Math.min(12, Math.floor((d.day - 1) / 30));
    monthlyDecisionDays[m]++;
  }
}

console.log(`완주(양쪽 무파산) n=${completed}/${N_SEEDS}, 파산(5레버/무성장) = ${bustActive}/${bustCtrl}`);
console.log(`\n[Decision density] seed당 365일 중 실제 결정 횟수: 평균=${avg(decisionCounts).toFixed(2)} 최소=${Math.min(...decisionCounts)} 최대=${Math.max(...decisionCounts)}`);
console.log(`30일 환산: 평균 ${(avg(decisionCounts) / 365 * 30).toFixed(2)}회/30일`);
console.log(`\n[Decision diversity] 유형별 총 발생 횟수:`);
for (const [k, v] of Object.entries(typeCounts).sort((a, b) => b[1] - a[1])) console.log(`  ${k}: ${v}`);
console.log(`\n[Temporal distribution] 월 단위 결정 발생 횟수 합계:`);
console.log('  ' + monthlyDecisionDays.map((v, i) => `M${i + 1}:${v}`).join(' '));
const emptyMonths = monthlyDecisionDays.filter(v => v === 0).length;
console.log(`  비어있는 월 개수 = ${emptyMonths}/13`);
console.log(`\n365일말 netWorth 쌍차(5레버 전체 반응형 - 무성장) 평균 = ${avg(finalDiff).toFixed(0)}  양수비율 = ${(100 * finalDiff.filter(v => v > 0).length / completed).toFixed(1)}%`);

FF.C.cost = ORIGINAL_COST; FF.C.step = ORIGINAL_STEP; FF.C.days = 30;
