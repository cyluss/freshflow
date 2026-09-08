// 이슈 #18: 판로 가치를 capacity 성분과 diversification 성분으로 분리한다.
// 같은 총 cap(52)·같은 총 quota(30)·수요가중 평균 가격표·가중평균 정산일을 가진 "가상
// 단일판로(merged)" 하나를 만들어, 실제 3개 판로(all3)와 같은 seed·같은 부하비율에서
// 비교한다. 남는 차이는 총 capacity가 아니라 "서로 다른 수요를 가진 여러 판로가 동시에
// 열려 있다"는 diversification 그 자체의 순수 효과다.
// 부하비율은 두 조건이 같은 유효capacity(min(cap.sales,52))를 쓰므로 그대로 공유한다.
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
const AVG_PROD_AT_NATIVE_SM = 40.3251;

const TOTAL_CAP = ORIGINAL_CHANNELS.reduce((s, c) => s + c.cap, 0); // 52
const TOTAL_QUOTA = ORIGINAL_CHANNELS.reduce((s, c) => s + c.quota, 0); // 30
const WEIGHTED_SETTLE = Math.round(ORIGINAL_CHANNELS.reduce((s, c) => s + c.cap * c.settle, 0) / TOTAL_CAP);
const BLENDED_PRICE = [0, 1, 2, 3, 4].map(a =>
  ORIGINAL_CHANNELS.reduce((s, c) => s + c.cap * c.price[a], 0) / TOTAL_CAP);
const MERGED_CHANNEL = { key: 'merged', cap: TOTAL_CAP, settle: WEIGHTED_SETTLE, quota: TOTAL_QUOTA, price: BLENDED_PRICE };
// 후속: 정산시간 혼입을 제거한 버전. settle=0(가장 빠른 채널 기준)으로 맞춰서 현금흐름
// confound 없이 순수 물리적 diversification 효과(DIO·꼬리재고)만 남긴다.
const MERGED_FAST_SETTLE = { key: 'merged_settle0', cap: TOTAL_CAP, settle: 0, quota: TOTAL_QUOTA, price: BLENDED_PRICE };
console.log('merged channel:', JSON.stringify(MERGED_CHANNEL));

const CONDS = { all3: ORIGINAL_CHANNELS, merged: [MERGED_CHANNEL], merged_settle0: [MERGED_FAST_SETTLE] };
const EFF_CAP = Math.min(CAP_SALES, TOTAL_CAP); // 둘 다 같은 유효capacity를 쓴다
const LOAD_RATIOS = [0.8, 1.0, 1.2, 1.5];

function scaleFor(ratio) { return ratio * EFF_CAP / AVG_PROD_AT_NATIVE_SM; }

function runSeed(seed) {
  FF.reset(seed);
  while (!FF.isOver()) FF.stepDay(FF.Cmd.wait());
  return { hist: FF.histOf(), rel: FF.relOf().slice(), netWorth: FF.netWorth(FF.toKernelState()), cash: FF.ledger().cash, bust: FF.isBust() };
}
function avg(a) { return a.length ? a.reduce((x, y) => x + y, 0) / a.length : NaN; }
function pctile(a, p) { if (!a.length) return NaN; const s = [...a].sort((x, y) => x - y); return s[Math.min(s.length - 1, Math.floor(s.length * p))]; }

const results = {};
for (const [condName, channels] of Object.entries(CONDS)) {
  results[condName] = {};
  for (const ratio of LOAD_RATIOS) {
    FF.C.channels = channels;
    FF.C.sm = ORIGINAL_SM.map(v => v * scaleFor(ratio));
    const runs = [];
    for (let seed = 1; seed <= N_SEEDS; seed++) runs.push(runSeed(seed));
    FF.C.channels = ORIGINAL_CHANNELS; FF.C.sm = ORIGINAL_SM;

    let ageWeightedSum = 0, exitUnits = 0, totalWaste = 0, totalIntake = 0, totalSold = 0;
    const endInvPerSeed = [], netWorthPerSeed = [], missedPerSeed = [], relPerSeed = [], soldPerSeed = [], tailEndPerSeed = [];
    for (const run of runs) {
      let sw = 0, su = 0, seedWaste = 0, seedIntake = 0, seedMissed = 0, seedSold = 0;
      for (const day of run.hist) {
        (day.ageMix || []).forEach(({ a, q }) => { sw += a * q; su += q; totalSold += q; });
        sw += TTL * day.wT; su += day.wT; seedWaste += day.wT; totalWaste += day.wT;
        seedIntake += day.acc; totalIntake += day.acc;
        seedMissed += day.missed; seedSold += day.sold;
      }
      ageWeightedSum += sw; exitUnits += su;
      netWorthPerSeed.push(run.netWorth); relPerSeed.push(avg(run.rel));
      missedPerSeed.push(seedMissed); soldPerSeed.push(seedSold);
      // tail inventory: 마지막 5일 평균 종료재고 - "꼬리 재고"를 얼마나 잘 비웠는가.
      const tail = run.hist.slice(-5).map(d => d.end);
      tailEndPerSeed.push(avg(tail));
    }
    results[condName][ratio] = {
      dio: ageWeightedSum / exitUnits,
      wasteRate: 100 * totalWaste / totalIntake,
      netWorth: avg(netWorthPerSeed), missed: avg(missedPerSeed), rel: avg(relPerSeed),
      bustPct: 100 * runs.filter(r => r.bust).length / N_SEEDS,
      soldPerSeed, tailEnd: avg(tailEndPerSeed),
    };
  }
}

for (const ratio of LOAD_RATIOS) {
  console.log(`\n========== 부하비율=${ratio} (같은 유효capacity=${EFF_CAP}, n=${N_SEEDS}) ==========`);
  const a3 = results.all3[ratio], mg = results.merged[ratio], mg0 = results.merged_settle0[ratio];
  console.table([
    { 조건: 'all3(3판로 분산)', DIO: a3.dio.toFixed(3), 꼬리재고: a3.tailEnd.toFixed(2), 부패율: a3.wasteRate.toFixed(3) + '%', netWorth: Math.round(a3.netWorth), missed: a3.missed.toFixed(1), 평균관계: a3.rel.toFixed(2), bust: a3.bustPct.toFixed(1) + '%' },
    { 조건: 'merged(가중평균 정산5일)', DIO: mg.dio.toFixed(3), 꼬리재고: mg.tailEnd.toFixed(2), 부패율: mg.wasteRate.toFixed(3) + '%', netWorth: Math.round(mg.netWorth), missed: mg.missed.toFixed(1), 평균관계: mg.rel.toFixed(2), bust: mg.bustPct.toFixed(1) + '%' },
    { 조건: 'merged_settle0(정산0일)', DIO: mg0.dio.toFixed(3), 꼬리재고: mg0.tailEnd.toFixed(2), 부패율: mg0.wasteRate.toFixed(3) + '%', netWorth: Math.round(mg0.netWorth), missed: mg0.missed.toFixed(1), 평균관계: mg0.rel.toFixed(2), bust: mg0.bustPct.toFixed(1) + '%' },
  ]);
  const dSold = a3.soldPerSeed.map((v, i) => v - mg0.soldPerSeed[i]);
  console.log(`판매량 차이(all3-merged_settle0, 같은 seed): avg=${avg(dSold).toFixed(2)}, DIO 차이(merged_settle0-all3)=${(mg0.dio - a3.dio).toFixed(3)}일, 꼬리재고 차이=${(mg0.tailEnd - a3.tailEnd).toFixed(2)}`);
}
