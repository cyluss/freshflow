// 이슈 #15 attribution 4차: 공급량과 판로 수라는 절대 배율 대신 부하비율(load ratio)=
// 공급 / 판매 유효capacity를 직접 독립변수로 스윕한다. 판로는 3개 그대로 둔다(그 자체를
// 다시 흔들면 3차 실험과 같은 혼입이 재발한다) - 이번 축은 순수하게 "공급이 처리용량 대비
// 얼마나 많은가" 하나다.
// 기준(ratio=1.0)은 게임의 원래 sm 그대로일 때 실측 평균 생산량(40.33, 내부단위)을
// cap.sales(42)로 나눈 값(0.96)에 맞춰 스케일한다 - "1.0"이 임의의 원래 밸런스가 아니라
// 정확히 "평균 생산량 = 판매 capacity"가 되는 지점이 되도록 보정했다.
import fs from 'fs';

const stub = 'var FF={},FV={};';
const DOMAIN = ['src-core.js','src-store.js','src-access.js','src-uistate.js','src-kernel.js','src-runner.js','src-record.js','src-engine.js','src-counter.js','src-fact.js','src-report-data.js'];
const src = stub + DOMAIN.map(f => fs.readFileSync(f, 'utf8')).join('\n') + '\nreturn FF;';
const FF = new Function(src)();

const N_SEEDS = Number(process.argv[2] || 500);
const TTL = FF.C.ttl;
const ORIGINAL_SM = FF.C.sm.slice();

// 실측 보정: 원래 sm으로 2000시드x30일 생산량 평균이 40.33(내부단위), cap.sales=42.
// scale(ratio) = ratio * cap.sales / avgProd_at_1x_scale. avgProd는 sm에 선형 비례하므로
// 미리 잰 상수 하나로 모든 목표비율의 배율을 구할 수 있다.
const AVG_PROD_AT_NATIVE_SM = 40.3251;
const CAP_SALES = FF.C.cap.sales;
const LOAD_RATIOS = [0.6, 0.8, 1.0, 1.1, 1.25, 1.5];

function scaleForRatio(ratio) { return ratio * CAP_SALES / AVG_PROD_AT_NATIVE_SM; }

function runSeed(seed) {
  FF.reset(seed);
  while (!FF.isOver()) FF.stepDay(FF.Cmd.wait());
  return { hist: FF.histOf(), rel: FF.relOf().slice(), netWorth: FF.netWorth(FF.toKernelState()), cash: FF.ledger().cash, bust: FF.isBust() };
}
function avg(a) { return a.length ? a.reduce((x, y) => x + y, 0) / a.length : NaN; }

const rows = [];
for (const ratio of LOAD_RATIOS) {
  FF.C.sm = ORIGINAL_SM.map(v => v * scaleForRatio(ratio));
  const runs = [];
  for (let seed = 1; seed <= N_SEEDS; seed++) runs.push(runSeed(seed));
  FF.C.sm = ORIGINAL_SM;

  let ageWeightedSum = 0, exitUnits = 0, totalWaste = 0, totalIntake = 0, totalSold = 0;
  const ageHist = [0, 0, 0, 0, 0];
  const netWorthPerSeed = [], relPerSeed = [], missedPerSeed = [], cashPerSeed = [], wasteRatePerSeed = [];
  for (const run of runs) {
    let sw = 0, su = 0, seedWaste = 0, seedIntake = 0, seedMissed = 0;
    for (const day of run.hist) {
      (day.ageMix || []).forEach(({ a, q }) => {
        sw += a * q; su += q; totalSold += q;
        if (a >= 0 && a <= 4) ageHist[a] += q;
      });
      sw += TTL * day.wT; su += day.wT; seedWaste += day.wT; totalWaste += day.wT;
      seedIntake += day.acc; totalIntake += day.acc;
      seedMissed += day.missed;
    }
    ageWeightedSum += sw; exitUnits += su;
    wasteRatePerSeed.push(seedIntake > 0 ? seedWaste / seedIntake : 0);
    netWorthPerSeed.push(run.netWorth); relPerSeed.push(avg(run.rel));
    missedPerSeed.push(seedMissed); cashPerSeed.push(run.cash);
  }
  rows.push({
    ratio, dio: ageWeightedSum / exitUnits,
    age0: 100 * ageHist[0] / totalSold, age4: 100 * ageHist[4] / totalSold,
    wasteRate: 100 * totalWaste / totalIntake,
    wasteZeroPct: 100 * wasteRatePerSeed.filter(x => x === 0).length / N_SEEDS,
    netWorth: avg(netWorthPerSeed), cash: avg(cashPerSeed),
    missed: avg(missedPerSeed), rel: avg(relPerSeed),
    bustPct: 100 * runs.filter(r => r.bust).length / N_SEEDS,
  });
}

console.log(`n=${N_SEEDS}, 판로=3개 고정. scale(ratio)=ratio*${CAP_SALES}/${AVG_PROD_AT_NATIVE_SM}`);
console.table(rows.map(r => ({
  부하비율: r.ratio, DIO: r.dio.toFixed(3), age0: r.age0.toFixed(1) + '%', age4: r.age4.toFixed(2) + '%',
  부패율: r.wasteRate.toFixed(3) + '%', '부패0%seed': r.wasteZeroPct.toFixed(0) + '%',
  netWorth: Math.round(r.netWorth), cash: Math.round(r.cash), missed: r.missed.toFixed(1),
  평균관계: r.rel.toFixed(2), bust: r.bustPct.toFixed(1) + '%'
})));
