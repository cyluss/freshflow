// 이슈 #9: Policy(cover) 검증 2단계, 좁게 간다. cover-policy-value-sim.mjs가 찾은 패턴은
// "수요 tilt가 낮으면 lean(1), 그 외엔 mid(1.5)가 이긴다"였다(공급 tilt와는 무관, full의
// 20.7% 승리조건은 아직 미설명이라 지금은 안 건드린다 - 3-class로 바로 가면 설명된 신호와
// 안 된 신호가 섞인다). 여기서는 lean-vs-mid 이분법만, 딱 그 질문만 본다.
//
// hidden 수요 tilt(td)는 정답 라벨로만 쓴다(연구자만 본다). 정책 입력에는 절대 넣지 않는다.
// 정책이 실제로 볼 수 있는 건 day1에 FF.monthOutlook()이 이미 계산해 화면에 뿌리는 값
// (blurredPhase 기반 확률·FF.outlookVerdict 판정)뿐이다 - #5/#13이 썼던 것과 같은 정당한
// 관측 경로. 두 가지를 따로 잰다: (1) 이 신호로 저수요 상태를 식별하는 정확도,
// (2) 그 식별 결과로 "저수요면 lean, 아니면 mid"를 고르는 정책이 "항상 mid" 대비 얼마나
// 버는가 - 정확도가 낮아도 오판 비용과 적중 이득이 비대칭이면 후자가 양수일 수 있다.
import fs from 'fs';

const stub = 'var FF={},FV={};';
const DOMAIN = ['src-core.js','src-store.js','src-access.js','src-uistate.js','src-kernel.js','src-runner.js','src-record.js','src-engine.js','src-counter.js','src-fact.js','src-report-data.js'];
const src = stub + DOMAIN.map(f => fs.readFileSync(f, 'utf8')).join('\n') + '\nreturn FF;';
const FF = new Function(src)();

const N_SEEDS = Number(process.argv[2] || 5000);
const HORIZON = 30;

function avg(a) { return a.length ? a.reduce((x, y) => x + y, 0) / a.length : NaN; }
function dailyNetWorth() { return FF.ledger().cash + FF.sumAmt(FF.arOf()) - FF.sumAmt(FF.apOf()); }

function runSeed(seed, cover) {
  FF.reset(seed);
  for (let day = FF.run().day; day <= HORIZON; day++) {
    if (FF.isOver()) break;
    const cmd = (day === 1) ? FF.Cmd.policy(cover) : FF.Cmd.wait();
    FF.stepDay(cmd);
  }
  return { bust: FF.isBust(), nw: dailyNetWorth() };
}

const rows = [];
for (let seed = 1; seed <= N_SEEDS; seed++) {
  FF.reset(seed);
  const trueLowDemand = FF.tiltOf().demand === 0; // 연구자용 정답 라벨(hidden). 정책엔 안 넣는다.
  // day1(첫 stepDay 전)에 플레이어가 실제로 보는 신호만 쓴다.
  const outlook = FF.monthOutlook();
  const earlyDemandPct = outlook.demand[0].pct; // [낮음,비슷,높음] - early span
  const verdict = FF.outlookVerdict(earlyDemandPct);
  const predictLow = (verdict === 'low' || verdict === 'mostlyLow');

  const mid = runSeed(seed, 1.5);
  const lean = runSeed(seed, 1);
  if (mid.bust || lean.bust) continue;
  rows.push({ seed, trueLowDemand, predictLow, verdict, midNw: mid.nw, leanNw: lean.nw });
}
console.log(`완주 n=${rows.length}/${N_SEEDS}`);

// (1) 정확도 - 정답 라벨은 hidden tilt, 신호는 플레이어가 보는 outlookVerdict뿐.
let tp = 0, tn = 0, fp = 0, fn = 0;
for (const r of rows) {
  if (r.trueLowDemand && r.predictLow) tp++;
  else if (!r.trueLowDemand && !r.predictLow) tn++;
  else if (!r.trueLowDemand && r.predictLow) fp++;
  else fn++;
}
const n = rows.length;
console.log(`\n(1) day1 forecast로 저수요(tilt=0) 식별 정확도`);
console.log(`  실제 저수요 비율(기저선) = ${(100 * (tp + fn) / n).toFixed(1)}%`);
console.log(`  혼동행렬: TP=${tp} FN=${fn} FP=${fp} TN=${tn}`);
console.log(`  정확도 = ${(100 * (tp + tn) / n).toFixed(1)}%  (항상 mid 예측 기저선 = ${(100 * (tn + fp) / n).toFixed(1)}%)`);
console.log(`  저수요 중 실제로 잡아낸 비율(recall) = ${(100 * tp / Math.max(1, tp + fn)).toFixed(1)}%`);
console.log(`  lean으로 예측했을 때 실제로 맞을 확률(precision) = ${(100 * tp / Math.max(1, tp + fp)).toFixed(1)}%`);

// (2) 경제적 가치 - "저수요 예측시 lean, 아니면 mid" 정책 vs "항상 mid"
const diffs = rows.map(r => (r.predictLow ? r.leanNw : r.midNw) - r.midNw);
console.log(`\n(2) 반응형 정책(저수요 예측시 lean) vs 항상 mid, day${HORIZON} netWorth 쌍차`);
console.log(`  평균 = ${avg(diffs).toFixed(0)}  양수비율 = ${(100 * diffs.filter(v => v > 0).length / n).toFixed(1)}%  음수비율 = ${(100 * diffs.filter(v => v < 0).length / n).toFixed(1)}%`);
console.log(`  (lean으로 바꾼 seed만) n=${rows.filter(r => r.predictLow).length}, 그중 평균쌍차 = ${avg(rows.filter(r => r.predictLow).map(r => r.leanNw - r.midNw)).toFixed(0)}`);

// 검증용: 예측이 아니라 실제(hidden) 저수요 여부로 나눴을 때도 같은 방향인지 확인.
const trueLowRows = rows.filter(r => r.trueLowDemand);
const trueHighRows = rows.filter(r => !r.trueLowDemand);
console.log(`\n(검증) 실제 저수요(tilt=0, n=${trueLowRows.length})에서 lean-mid 평균쌍차 = ${avg(trueLowRows.map(r => r.leanNw - r.midNw)).toFixed(0)} (양수비율 ${(100 * trueLowRows.filter(r => r.leanNw > r.midNw).length / trueLowRows.length).toFixed(1)}%)`);
console.log(`(검증) 실제 그 외(n=${trueHighRows.length})에서 lean-mid 평균쌍차 = ${avg(trueHighRows.map(r => r.leanNw - r.midNw)).toFixed(0)} (양수비율 ${(100 * trueHighRows.filter(r => r.leanNw > r.midNw).length / trueHighRows.length).toFixed(1)}%)`);
