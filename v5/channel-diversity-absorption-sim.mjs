// 이슈 #18 1단계: 판로 구성 x 부하비율 그리드 + 흡수율 지표.
// 핵심 구별: 판로가 많아서 좋은가(단순 총 cap), 아니면 서로 다른 판로가 서로의 잔여
// 물량을 흡수할 수 있어서 좋은가(다양성 자체의 유동성 효과)인가.
// 부하비율은 이번엔 "그 판로구성 자신의 유효capacity" 대비로 정규화한다(min(cap.sales,
// 그 구성의 채널 cap 합)) - 3차 실험에서 드러난 "도매만은 cap이 커서 절대 부하가 낮았던"
// 교란을 없애기 위해서다. 같은 seed를 모든 조건에 그대로 재사용해서 사후에
// "3개 판로 판매량 - 최선의 단일판로 판매량"으로 흡수율(diversification이 만든 순수
// 증분)을 직접 계산한다. 미판매 원인 분해는 새로 만들지 않고 커널이 이미 매일 분류하는
// FF.bottleneck(r.b: ship/stock/demand/intake/store/supply/policy/none)을 그대로 집계한다.
import fs from 'fs';

const stub = 'var FF={},FV={};';
const DOMAIN = ['src-core.js','src-store.js','src-access.js','src-uistate.js','src-kernel.js','src-runner.js','src-record.js','src-engine.js','src-counter.js','src-fact.js','src-report-data.js'];
const src = stub + DOMAIN.map(f => fs.readFileSync(f, 'utf8')).join('\n') + '\nreturn FF;';
const FF = new Function(src)();

const N_SEEDS = Number(process.argv[2] || 300);
const TTL = FF.C.ttl;
const ORIGINAL_CHANNELS = FF.C.channels.map(c => Object.assign({}, c));
const ORIGINAL_SM = FF.C.sm.slice();
const CAP_SALES = FF.C.cap.sales;
const AVG_PROD_AT_NATIVE_SM = 40.3251; // 별도 2000시드x30일 실측(calib.mjs)로 구한 상수

const CHANNEL_CONDS = {
  'all3': ['online', 'fran', 'whole'],
  'online': ['online'],
  'fran': ['fran'],
  'whole': ['whole'],
  'online+fran': ['online', 'fran'],
  'online+whole': ['online', 'whole'],
  'fran+whole': ['fran', 'whole'],
};
const LOAD_RATIOS = [0.8, 1.0, 1.2, 1.5];

function effCapFor(keys) {
  const sum = ORIGINAL_CHANNELS.filter(c => keys.includes(c.key)).reduce((s, c) => s + c.cap, 0);
  return Math.min(CAP_SALES, sum);
}
function scaleFor(ratio, effCap) { return ratio * effCap / AVG_PROD_AT_NATIVE_SM; }

function runSeed(seed) {
  FF.reset(seed);
  while (!FF.isOver()) FF.stepDay(FF.Cmd.wait());
  return { hist: FF.histOf(), rel: FF.relOf().slice(), netWorth: FF.netWorth(FF.toKernelState()), cash: FF.ledger().cash, bust: FF.isBust() };
}
function avg(a) { return a.length ? a.reduce((x, y) => x + y, 0) / a.length : NaN; }

const results = {}; // results[condName][ratio] = {perSeedSold:[...], row:{...}}
for (const [condName, keys] of Object.entries(CHANNEL_CONDS)) {
  results[condName] = {};
  const effCap = effCapFor(keys);
  for (const ratio of LOAD_RATIOS) {
    FF.C.channels = ORIGINAL_CHANNELS.filter(c => keys.includes(c.key));
    FF.C.sm = ORIGINAL_SM.map(v => v * scaleFor(ratio, effCap));
    const runs = [];
    for (let seed = 1; seed <= N_SEEDS; seed++) runs.push(runSeed(seed));
    FF.C.channels = ORIGINAL_CHANNELS; FF.C.sm = ORIGINAL_SM;

    let ageWeightedSum = 0, exitUnits = 0, totalWaste = 0, totalIntake = 0, totalSold = 0;
    const ageHist = [0, 0, 0, 0, 0];
    const bKinds = {};
    const netWorthPerSeed = [], relPerSeed = [], missedPerSeed = [], cashPerSeed = [], soldPerSeed = [];
    for (const run of runs) {
      let sw = 0, su = 0, seedWaste = 0, seedIntake = 0, seedMissed = 0, seedSold = 0;
      for (const day of run.hist) {
        (day.ageMix || []).forEach(({ a, q }) => {
          sw += a * q; su += q; totalSold += q;
          if (a >= 0 && a <= 4) ageHist[a] += q;
        });
        sw += TTL * day.wT; su += day.wT; seedWaste += day.wT; totalWaste += day.wT;
        seedIntake += day.acc; totalIntake += day.acc;
        seedMissed += day.missed; seedSold += day.sold;
        bKinds[day.b] = (bKinds[day.b] || 0) + 1;
      }
      ageWeightedSum += sw; exitUnits += su;
      netWorthPerSeed.push(run.netWorth); relPerSeed.push(avg(run.rel));
      missedPerSeed.push(seedMissed); cashPerSeed.push(run.cash); soldPerSeed.push(seedSold);
    }
    const totalDays = Object.values(bKinds).reduce((a, b) => a + b, 0);
    results[condName][ratio] = {
      dio: ageWeightedSum / exitUnits,
      age4Pct: 100 * ageHist[4] / totalSold,
      wasteRate: 100 * totalWaste / totalIntake,
      netWorth: avg(netWorthPerSeed), cash: avg(cashPerSeed),
      missed: avg(missedPerSeed), rel: avg(relPerSeed),
      bustPct: 100 * runs.filter(r => r.bust).length / N_SEEDS,
      bottleneckPct: Object.fromEntries(Object.entries(bKinds).map(([k, v]) => [k, (100 * v / totalDays).toFixed(1) + '%'])),
      soldPerSeed,
    };
  }
}

for (const ratio of LOAD_RATIOS) {
  console.log(`\n========== 부하비율=${ratio} (각 판로구성 자신의 유효capacity 기준, n=${N_SEEDS}) ==========`);
  console.table(Object.entries(CHANNEL_CONDS).map(([condName]) => {
    const r = results[condName][ratio];
    return {
      판로구성: condName, DIO: r.dio.toFixed(3), age4: r.age4Pct.toFixed(2) + '%', 부패율: r.wasteRate.toFixed(3) + '%',
      netWorth: Math.round(r.netWorth), missed: r.missed.toFixed(1), 평균관계: r.rel.toFixed(2), bust: r.bustPct.toFixed(1) + '%',
      주병목: Object.entries(r.bottleneckPct).sort((a, b) => parseFloat(b[1]) - parseFloat(a[1])).slice(0, 2).map(([k, v]) => `${k}:${v}`).join(' ')
    };
  }));

  // 흡수율: 같은 seed에서 all3 판매량 - 최선의 단일판로(online/fran/whole 중 최댓값) 판매량.
  const soldAll3 = results['all3'][ratio].soldPerSeed;
  const soldSingleBest = [];
  for (let i = 0; i < N_SEEDS; i++) {
    soldSingleBest.push(Math.max(results['online'][ratio].soldPerSeed[i], results['fran'][ratio].soldPerSeed[i], results['whole'][ratio].soldPerSeed[i]));
  }
  const absorption = soldAll3.map((v, i) => v - soldSingleBest[i]);
  console.log(`흡수율(all3 판매량 - 최선의 단일판로 판매량, 같은 seed): avg=${avg(absorption).toFixed(2)}` +
    ` (all3 평균판매=${avg(soldAll3).toFixed(1)}, 최선단일 평균판매=${avg(soldSingleBest).toFixed(1)},` +
    ` 증분비율=${(100 * avg(absorption) / avg(soldSingleBest)).toFixed(1)}%)`);
  console.log(`DIO 비교: all3=${results['all3'][ratio].dio.toFixed(3)}일 vs 최선단일판로 중 최소DIO=` +
    `${Math.min(results['online'][ratio].dio, results['fran'][ratio].dio, results['whole'][ratio].dio).toFixed(3)}일`);
}
