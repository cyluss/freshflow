// 이슈 #19: #20 종합 판정에서 나온 다음 질문 - Sales가 기각된 지금, Intake 다음에
// 자본을 배분할 만한 두 번째 실제 성장 레버가 무엇인가. #18에서 공급 규모(FF.C.sm) 확대
// 자체는 29~39일 payback을 갖는다는 근거가 이미 있다. intake-marginal-value-sim.mjs와
// 정확히 같은 형식(intake_cap 진단군, day10/31/52/73 4사이클, 이전 사이클은 전부 intake
// 고정, 그 사이클 하나만 갈라 day90까지 더 손대지 않음)으로 intake 재투자 vs 공급 규모
// 확대의 한계가치 곡선을 잰다.
//
// 공급 규모는 게임에 실재하는 구매 가능 capacity가 아니다(FF.C.sm은 World가 매일 생산량을
// 뽑을 때 쓰는 국면별 평균이지, FF.transition의 s.cap 기반 buy/step 체계에 속하지 않는다).
// 그래서 intake/sales처럼 FF.Cmd.buy로 표현할 수 없다 - 대신 investDay 당일 FF.addCash로
// 같은 비용을 현금에서 직접 차감하고, 그 다음 날부터 FF.C.sm 각 국면 평균에 고정폭을 더한다
// (capacity 구매가 "산 날 비용 차감, 다음 날부터 capacity 반영"인 것과 동일한 타이밍).
// 이질적 가정으로 결과가 왜곡되지 않도록 비용/증분 크기를 intake와 동일한 척도로 맞춘다:
// cost=490(intake와 동일), sm 각 국면에 +1(실단위) = 평균 생산 내부단위 기준 약 +2
// (intake capacity의 step=2와 동일한 절대량, 기존 cap.intake=40 대비 5% 증가와 같은 비율).
// 이 가정 자체가 타당한지는 결과와 별개로 남는 질문이다.
//
// bottleneck-relief-settling-sim.mjs가 잡아낸 날짜 정렬 버그를 반복하지 않는다: 투자는
// WINDOWS의 각 날짜에 한 번씩만 발생하고, FF.stepDay는 매 반복마다 정확히 하루씩만 진행한다.
import fs from 'fs';

const stub = 'var FF={},FV={};';
const DOMAIN = ['src-core.js','src-store.js','src-access.js','src-uistate.js','src-kernel.js','src-runner.js','src-record.js','src-engine.js','src-counter.js','src-fact.js','src-report-data.js'];
const src = stub + DOMAIN.map(f => fs.readFileSync(f, 'utf8')).join('\n') + '\nreturn FF;';
const FF = new Function(src)();

const N_SEEDS = Number(process.argv[2] || 1500);
const HORIZON = 90;
FF.C.days = HORIZON;
const ORIGINAL_COST = Object.assign({}, FF.C.cost);
const ORIGINAL_STEP = Object.assign({}, FF.C.step);
FF.C.cost = Object.assign({}, ORIGINAL_COST, { intake: 490 });
FF.C.step = Object.assign({}, ORIGINAL_STEP, { intake: 2 });
const ORIGINAL_SM = FF.C.sm.slice();
const SUPPLY_COST = 490; // intake와 동일 비용(비교를 위해 의도적으로 맞춤)
const SUPPLY_STEP = 1; // 각 국면 평균에 +1(실단위) = 내부단위 기준 평균 +2, intake step과 동일 절대량

const EPS = 1;
const WINDOWS = [10, 31, 52, 73]; // 사이클 0,1,2,3의 투자일

function dailyNetWorth() { return FF.ledger().cash + FF.sumAmt(FF.arOf()) - FF.sumAmt(FF.apOf()); }
function prepEngine() { FF.ENGINE.value.phase.storage = FF.ENGINE.value.phase.storage || { dir: 0, n: 0 }; }

// intake_cap 진단군(day1~9 wIcap 지배) - intake-marginal-value-sim.mjs와 동일한 진단.
// 이 진단 자체는 FF.C.sm이 아직 원래값일 때 수행해야 하므로 스크립트 시작 시 한 번만 돈다.
const seeds = [];
for (let seed = 1; seed <= N_SEEDS; seed++) {
  FF.reset(seed);
  let sumCap = 0, sumStore = 0, sumCash = 0, sumWI = 0;
  for (let day = 1; day <= 9; day++) {
    if (FF.isOver()) break;
    FF.stepDay(FF.Cmd.wait());
    const d = FF.today();
    sumCap += d.wIcap; sumStore += d.wIstore; sumCash += d.wS; sumWI += d.wI;
  }
  if (sumWI <= EPS) continue;
  const maxV = Math.max(sumCap, sumStore, sumCash);
  if (maxV > EPS && sumCap === maxV) seeds.push(seed);
}
console.log(`intake_cap 진단군: ${seeds.length}/${N_SEEDS}`);

// plan[i]는 사이클 i(WINDOWS[i]일)의 선택: 'intake'|'supply'|'none'. i번째 이전은 항상 intake.
function runPlan(seed, plan) {
  FF.reset(seed);
  prepEngine();
  FF.C.sm = ORIGINAL_SM.slice();
  const nw = [];
  let pendingSupply = false;
  for (let day = FF.run().day; day <= HORIZON; day++) {
    if (FF.isOver()) break;
    if (pendingSupply) { FF.C.sm = FF.C.sm.map(v => v + SUPPLY_STEP); pendingSupply = false; }
    const wi = WINDOWS.indexOf(day);
    let cmd = FF.Cmd.wait();
    if (wi !== -1 && plan[wi] !== 'none') {
      if (plan[wi] === 'intake') cmd = FF.Cmd.buy('intake');
      else if (plan[wi] === 'supply') { FF.addCash(-SUPPLY_COST); pendingSupply = true; }
    }
    FF.stepDay(cmd);
    nw.push(dailyNetWorth());
  }
  return nw;
}

function avg(a) { return a.length ? a.reduce((x, y) => x + y, 0) / a.length : NaN; }

function planUpTo(k, lastChoice) {
  return WINDOWS.map((_, i) => i < k ? 'intake' : (i === k ? lastChoice : 'none'));
}

for (let k = 0; k < WINDOWS.length; k++) {
  const planNone = planUpTo(k, 'none');
  const planIntake = planUpTo(k, 'intake');
  const planSupply = planUpTo(k, 'supply');
  const diffIntake = [], diffSupply = [];
  for (const seed of seeds) {
    const base = runPlan(seed, planNone);
    const withIntake = runPlan(seed, planIntake);
    const withSupply = runPlan(seed, planSupply);
    const len = Math.min(base.length, withIntake.length, withSupply.length);
    if (len < HORIZON) continue;
    diffIntake.push(withIntake[len - 1] - base[len - 1]);
    diffSupply.push(withSupply[len - 1] - base[len - 1]);
  }
  console.log(`\n사이클 ${k + 1}(day${WINDOWS[k]} 투자, 이전 사이클은 전부 intake 고정, n=${diffIntake.length}):`);
  console.log(`  intake 한계가치(day90): avg=${avg(diffIntake).toFixed(0)} 양수비율=${(100 * diffIntake.filter(v => v > 0).length / diffIntake.length).toFixed(1)}%`);
  console.log(`  supply 한계가치(day90): avg=${avg(diffSupply).toFixed(0)} 양수비율=${(100 * diffSupply.filter(v => v > 0).length / diffSupply.length).toFixed(1)}%`);
  console.log(`  intake - supply: avg=${(avg(diffIntake) - avg(diffSupply)).toFixed(0)} (양수면 이 시점엔 intake가 아직 낫다)`);
}

FF.C.cost = ORIGINAL_COST; FF.C.step = ORIGINAL_STEP; FF.C.days = 30; FF.C.sm = ORIGINAL_SM;
