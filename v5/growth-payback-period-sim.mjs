// 이슈 #18 4단계: 공급 성장 투자의 실제 payback period를 잰다. FF.C.days를 90까지 늘리고
// (game length를 늘리는 것 자체는 안전하다 - isOver/finalValue는 R.days를 그대로 참조한다)
// 같은 seed로 성장경로(반응형 멀티레버, storage/intake 헤드리스 레버 포함) vs 무성장을
// 매일 쌍차 낸다. 지표는 그날그날의 순자산(cash+AR-AP, FF.netWorth와 같은 정의)이다 -
// 이게 이미 "누적 영업가치 - 누적 투자비"를 한 번에 담은 값이라 따로 분리해 더하지 않는다.
// payback day = 쌍차가 처음으로 0을 넘어 그 뒤로 계속 양수로 남는 날.
import fs from 'fs';

const stub = 'var FF={},FV={};';
const DOMAIN = ['src-core.js','src-store.js','src-access.js','src-uistate.js','src-kernel.js','src-runner.js','src-record.js','src-engine.js','src-counter.js','src-fact.js','src-report-data.js'];
const src = stub + DOMAIN.map(f => fs.readFileSync(f, 'utf8')).join('\n') + '\nreturn FF;';
const FF = new Function(src)();

const N_SEEDS = Number(process.argv[2] || 300);
const HORIZON = 90;
FF.C.days = HORIZON;
const ORIGINAL_SM = FF.C.sm.slice();
const ORIGINAL_COST = Object.assign({}, FF.C.cost);
const ORIGINAL_STEP = Object.assign({}, FF.C.step);
FF.C.cost = Object.assign({}, ORIGINAL_COST, { storage: 300, intake: 490 });
FF.C.step = Object.assign({}, ORIGINAL_STEP, { storage: 4, intake: 2 });

const BOTTLENECK_TO_LEVER = { ship: 'sales', stock: 'storage', intake: 'intake' };
const SM_SCHEDULES = {
  '균형성장': { 1: 0.8, 11: 1.0, 21: 1.2 },
  '공급선행': { 1: 0.8, 11: 1.4 },
};

function smAt(day, schedule) {
  const days = Object.keys(schedule).map(Number).sort((a, b) => a - b);
  let v = schedule[days[0]];
  for (const d of days) if (day >= d) v = schedule[d];
  return v;
}
function dailyNetWorth() {
  return FF.ledger().cash + FF.sumAmt(FF.arOf()) - FF.sumAmt(FF.apOf());
}

function runSeed(seed, schedule, adaptive) {
  FF.reset(seed);
  if (adaptive) { FF.ENGINE.value.phase.storage = { dir: 0, n: 0 }; FF.ENGINE.value.lastBuy.storage = 0; }
  const nw = [];
  for (let day = FF.run().day; day <= HORIZON; day++) {
    if (FF.isOver()) break;
    if (schedule) FF.C.sm = ORIGINAL_SM.map(v => v * smAt(day, schedule));
    let cmd = FF.Cmd.wait();
    if (adaptive && day > 1) {
      const lastB = FF.today() ? FF.today().b : null;
      const lever = BOTTLENECK_TO_LEVER[lastB];
      if (lever) cmd = FF.Cmd.buy(lever);
    }
    FF.stepDay(cmd);
    nw.push(dailyNetWorth());
  }
  FF.C.sm = ORIGINAL_SM;
  return nw;
}

function avg(a) { return a.length ? a.reduce((x, y) => x + y, 0) / a.length : NaN; }
function pctile(a, p) { if (!a.length) return NaN; const s = [...a].sort((x, y) => x - y); return s[Math.min(s.length - 1, Math.floor(s.length * p))]; }
const CHECKPOINTS = [30, 45, 60, 75, 90];

for (const [pathName, schedule] of Object.entries(SM_SCHEDULES)) {
  console.log(`\n========== ${pathName}(반응형 멀티레버) vs 무성장 (n=${N_SEEDS}, horizon=${HORIZON}) ==========`);
  const diffSeries = [];
  for (let seed = 1; seed <= N_SEEDS; seed++) {
    const ctrl = runSeed(seed, null, false);
    const grow = runSeed(seed, schedule, true);
    const len = Math.min(ctrl.length, grow.length);
    if (len < HORIZON) continue; // bust 조기종료 제외
    diffSeries.push(grow.slice(0, len).map((v, i) => v - ctrl[i]));
  }
  console.log(`완주(무bust) seed: ${diffSeries.length}/${N_SEEDS}`);

  console.log('체크포인트별 평균 쌍차(순자산):');
  for (const cp of CHECKPOINTS) {
    const vals = diffSeries.map(s => s[cp - 1]);
    console.log(`  day${cp}: avg=${avg(vals).toFixed(0)} median=${pctile(vals, 0.5).toFixed(0)} 양수비율=${(100 * vals.filter(v => v > 0).length / vals.length).toFixed(1)}%`);
  }

  // payback day: 개별 seed에서 쌍차가 처음 0을 넘어 그 뒤로 끝까지(이번 실험 구간 안에서) 양수로 남는 날.
  let neverPayback = 0;
  const paybackDays = [];
  for (const series of diffSeries) {
    let day = null;
    for (let i = 0; i < series.length; i++) {
      if (series[i] > 0 && series.slice(i).every(v => v > 0)) { day = i + 1; break; }
    }
    if (day !== null) paybackDays.push(day); else neverPayback++;
  }
  console.log(`payback day(그 뒤로 끝까지 양수, ${HORIZON}일 안에서): 평균=${avg(paybackDays).toFixed(1)}일 median=${pctile(paybackDays, 0.5)}일` +
    ` 도달 seed=${paybackDays.length}/${diffSeries.length}(${(100 * paybackDays.length / diffSeries.length).toFixed(1)}%), 끝까지 미도달=${neverPayback}`);
}

FF.C.cost = ORIGINAL_COST; FF.C.step = ORIGINAL_STEP; FF.C.days = 30;
