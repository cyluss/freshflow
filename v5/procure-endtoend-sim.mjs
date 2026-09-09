// 이슈 #22: Procurement capacity end-to-end 검증. Source Observation Contract가 해결됐다
// (이슈 코멘트 참조) - byProcure=max(0,rawProd-procured)는 새 hidden fact가 아니라 이미
// 노출되는 prod와 새 기업능력 capProcure의 차이일 뿐이다. 이번 실험은 capProcure를
// intake-diagnosis-payback-sim.mjs/intake-marginal-value-sim.mjs와 완전히 같은 틀로
// end-to-end 검증한다: 진단(day1-9, byProcure 포함) → 투자 비교(진단군별 capProcure vs
// Intake vs 무투자) → payback(30/45/60/90일) → 병목이동.
//
// capProcure는 이 실험의 "기본 경제"에 항상 포함된다(수집한 노출/손실 근거가 이 상태를
// 전제로 나왔다) - baseline 값 34(cap.intake의 85%, 이전 exposure sweep에서 확인된 후보
// 구간의 중간)에서 시작해서, Intake와 완전히 같은 관례(cost=490, step=+2)로 투자하면
// capProcure가 늘어난다. procured=min(prod,capProcure)를 매일 FF.setProd로 적용하고,
// byProcure=max(0,rawProd-procured)는 별도로 계산해 진단에 쓴다.
//
// 진짜 대각선 조건: byProcure 우세 진단군에서는 capProcure 투자가, wIcap 우세 진단군에서는
// Intake 투자가 각각 더 낫고, 서로의 진단군에서는 상대적으로 약해야 한다.
//
// 두 진단군을 한 world에서 동시에 얻을 수 없다는 것이 확인됐다: capProcure를 cap.intake(40)
// 아래로 항상 묶어두면(예: 34) prod가 그 이하로 항상 잘려서 wIcap이 구조적으로 0이 될 수밖에
// 없다(intake_cap 진단군이 원천적으로 발생 불가, 0/800으로 실측됨). 그래서 이 실험은 두 개의
// 분리된 world 설정을 각각 돌린다:
//   PASS A: capProcureBase=34(제약 world) → procure_cap 진단군이 자연 발생
//   PASS B: capProcureBase=999(사실상 무제약 world) → 기존 intake_cap 진단군 재현
// 각 진단군은 "자신이 발생한 그 world 설정" 안에서만 두 레버(capProcure/Intake)를 비교한다 -
// 그래야 무제약 world에서 capProcure 투자가 (당연히) 무의미하다는 것도 대각선의 절반으로
// 정직하게 관측된다.
import fs from 'fs';

const stub = 'var FF={},FV={};';
const DOMAIN = ['src-core.js','src-store.js','src-access.js','src-uistate.js','src-kernel.js','src-runner.js','src-record.js','src-engine.js','src-counter.js','src-fact.js','src-report-data.js'];
const src = stub + DOMAIN.map(f => fs.readFileSync(f, 'utf8')).join('\n') + '\nreturn FF;';
const FF = new Function(src)();

const N_SEEDS = Number(process.argv[2] || 3000);
const EXPAND_DAY = 10;
const CHECKPOINTS = [30, 45, 60, 90];
const HORIZON = EXPAND_DAY + Math.max(...CHECKPOINTS) + 10; // day100 체크포인트 + 여유
FF.C.days = HORIZON;
const ORIGINAL_COST = Object.assign({}, FF.C.cost);
const ORIGINAL_STEP = Object.assign({}, FF.C.step);
FF.C.cost = Object.assign({}, ORIGINAL_COST, { intake: 490 });
FF.C.step = Object.assign({}, ORIGINAL_STEP, { intake: 2 });
// capProcure는 s.cap에 없는 headless 전용 상태라 FF.Cmd.buy로 표현하지 않는다 - 아래
// runSeed에서 FF.addCash(-490)로 직접 차감한다(비용/증분 490원·+2는 Intake와 동일 관례).

const EPS = 1;

function avg(a) { return a.length ? a.reduce((x, y) => x + y, 0) / a.length : NaN; }
function dailyNetWorth() { return FF.ledger().cash + FF.sumAmt(FF.arOf()) - FF.sumAmt(FF.apOf()); }
function prepEngine() { FF.ENGINE.value.phase.storage = FF.ENGINE.value.phase.storage || { dir: 0, n: 0 }; }

// lever: 'intake' | 'procure' | null. capProcure는 실제 s.cap에 없는 headless 전용
// 상태라 FF.Cmd.buy로 표현하지 않고 직접 관리한다(비용은 FF.addCash로 차감, 효과는
// "구매 다음 날부터 반영"이라는 capacity 매입과 동일한 타이밍을 재현한다).
function runSeed(seed, lever, capProcureBase) {
  FF.reset(seed);
  prepEngine();
  let capProcure = capProcureBase;
  let pendingProcureBump = false;
  const hist = []; // {day, wIcap, wIstore, wS, byProcure, b}
  const nwSeries = [];
  for (let day = FF.run().day; day <= HORIZON; day++) {
    if (FF.isOver()) break;
    if (pendingProcureBump) { capProcure += 2; pendingProcureBump = false; }
    const rawProd = FF.prodOf();
    const procured = Math.min(rawProd, capProcure);
    FF.setProd(procured);
    const byProcure = Math.max(0, rawProd - procured);

    let cmd = FF.Cmd.wait();
    if (day === EXPAND_DAY && lever === 'intake') cmd = FF.Cmd.buy('intake');
    else if (day === EXPAND_DAY && lever === 'procure') { FF.addCash(-490); pendingProcureBump = true; }

    FF.stepDay(cmd);
    const d = FF.today();
    hist.push({ day: d.day, wIcap: d.wIcap, wIstore: d.wIstore, wS: d.wS, byProcure, b: d.b });
    nwSeries.push(dailyNetWorth());
  }
  return { hist, nwSeries, bust: FF.isBust() };
}

// 진단(day1-9): wIcap/wIstore/wS/byProcure 중 최댓값으로 분류. 무처치(lever=null) 실행에서만
// 진단한다. capProcureBase는 이 진단이 어느 world에서 이뤄지는지를 결정한다.
function diagnose(capProcureBase, targetLabel) {
  const seeds = [];
  const counts = { intake_cap: 0, storage: 0, cash: 0, procure_cap: 0 };
  for (let seed = 1; seed <= N_SEEDS; seed++) {
    const r = runSeed(seed, null, capProcureBase);
    const win = r.hist.filter(d => d.day <= 9);
    const sumCap = win.reduce((s, d) => s + d.wIcap, 0);
    const sumStore = win.reduce((s, d) => s + d.wIstore, 0);
    const sumCash = win.reduce((s, d) => s + d.wS, 0);
    const sumProcure = win.reduce((s, d) => s + d.byProcure, 0);
    const maxV = Math.max(sumCap, sumStore, sumCash, sumProcure);
    if (maxV <= EPS) continue;
    let label;
    if (sumProcure === maxV) label = 'procure_cap';
    else if (sumCap === maxV) label = 'intake_cap';
    else if (sumStore === maxV) label = 'storage';
    else label = 'cash';
    counts[label]++;
    if (label === targetLabel) seeds.push(seed);
  }
  return { seeds, counts };
}

function reportGroup(name, seeds, capProcureBase) {
  if (!seeds.length) { console.log(`\n[${name}] 대상 없음`); return; }
  console.log(`\n========== 진단군: ${name}(n=${seeds.length}, capProcureBase=${capProcureBase}) ==========`);
  const runs = { none: [], intake: [], procure: [] };
  for (const seed of seeds) {
    runs.none.push(runSeed(seed, null, capProcureBase));
    runs.intake.push(runSeed(seed, 'intake', capProcureBase));
    runs.procure.push(runSeed(seed, 'procure', capProcureBase));
  }
  const ok = seeds.map((_, i) => !runs.none[i].bust && !runs.intake[i].bust && !runs.procure[i].bust);
  const n = ok.filter(Boolean).length;
  console.log(`  완주 n=${n}/${seeds.length}`);

  for (const lever of ['intake', 'procure']) {
    console.log(`  [${lever} 투자]`);
    for (const cp of CHECKPOINTS) {
      const day = EXPAND_DAY + cp;
      const diffs = [];
      for (let i = 0; i < seeds.length; i++) {
        if (!ok[i]) continue;
        const base = runs.none[i], treat = runs[lever][i];
        if (treat.nwSeries.length < day || base.nwSeries.length < day) continue;
        diffs.push(treat.nwSeries[day - 1] - base.nwSeries[day - 1]);
      }
      console.log(`    day${cp}: 평균=${avg(diffs).toFixed(0)} 양수비율=${(100 * diffs.filter(v => v > 0).length / diffs.length).toFixed(1)}% (n=${diffs.length})`);
    }
  }

  // 투자 후(day21-90) 병목 분포 - 병목이 어디로 이동했는지 참고.
  const bCounts = { intake: {}, procure: {} };
  for (const lever of ['intake', 'procure']) {
    let total = 0;
    for (let i = 0; i < seeds.length; i++) {
      if (!ok[i]) continue;
      const treat = runs[lever][i];
      for (const d of treat.hist) { if (d.day < 21 || d.day > EXPAND_DAY + 90) continue; bCounts[lever][d.b] = (bCounts[lever][d.b] || 0) + 1; total++; }
    }
    const top = Object.entries(bCounts[lever]).sort((a, b) => b[1] - a[1]).slice(0, 4).map(([k, v]) => `${k}:${(100 * v / total).toFixed(1)}%`).join(' ');
    console.log(`  [${lever} 투자 후 21-100일 병목] ${top}`);
  }
}

// PASS A: 제약 world(capProcureBase=34) → procure_cap 진단군 자연 발생.
const CAP_PROCURE_CONSTRAINED = 34; // cap.intake(40)의 85% - 이전 exposure sweep 후보구간 중앙
const diagA = diagnose(CAP_PROCURE_CONSTRAINED, 'procure_cap');
console.log(`[PASS A: capProcureBase=${CAP_PROCURE_CONSTRAINED}] 진단분포=${JSON.stringify(diagA.counts)}`);
reportGroup('procure_cap', diagA.seeds, CAP_PROCURE_CONSTRAINED);

// PASS B: 사실상 무제약 world(capProcureBase=999) → 기존 intake_cap 진단군 재현.
const CAP_PROCURE_UNCONSTRAINED = 999;
const diagB = diagnose(CAP_PROCURE_UNCONSTRAINED, 'intake_cap');
console.log(`\n[PASS B: capProcureBase=${CAP_PROCURE_UNCONSTRAINED}] 진단분포=${JSON.stringify(diagB.counts)}`);
reportGroup('intake_cap', diagB.seeds, CAP_PROCURE_UNCONSTRAINED);

FF.C.cost = ORIGINAL_COST; FF.C.step = ORIGINAL_STEP; FF.C.days = 30;
