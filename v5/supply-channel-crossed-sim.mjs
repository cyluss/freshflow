// 이슈 #15 attribution 2차: 공급 규모(0.5x/0.75x/1.0x) x 판로 접근(7가지 부분집합)을
// 직교해서 감사한다. 판로만 줄인 이전 실험(channel-access-turnover-sim.mjs)은 온라인/
// 프랜차이즈만으로는 사업 자체가 붕괴해서(bust 38~100%) "판로 개수" 효과와 "판로를
// 줄이며 같이 사라진 총 cap" 효과가 뒤섞여 있었다. 공급량 자체를 줄이는 축을 하나 더
// 넣어서 DIO/부패를 없앤 것이 공급 과잉인지 판로 과다인지 그 조합인지 분리한다.
// FF.C.sm(공급 평균)과 FF.C.channels 둘 다 이 실험 동안만 패치했다 되돌린다.
import fs from 'fs';

const stub = 'var FF={},FV={};';
const DOMAIN = ['src-core.js','src-store.js','src-access.js','src-uistate.js','src-kernel.js','src-runner.js','src-record.js','src-engine.js','src-counter.js','src-fact.js','src-report-data.js'];
const src = stub + DOMAIN.map(f => fs.readFileSync(f, 'utf8')).join('\n') + '\nreturn FF;';
const FF = new Function(src)();

const N_SEEDS = Number(process.argv[2] || 300);
const TTL = FF.C.ttl;
const ORIGINAL_CHANNELS = FF.C.channels.map(c => Object.assign({}, c));
const ORIGINAL_SM = FF.C.sm.slice();

const SUPPLY_SCALES = { '1.0x': 1.0, '0.75x': 0.75, '0.5x': 0.5 };
const CHANNEL_CONDS = {
  '3개': ['online', 'fran', 'whole'],
  '온라인만': ['online'],
  '프랜차이즈만': ['fran'],
  '도매만': ['whole'],
  '온라인+프랜차이즈': ['online', 'fran'],
  '온라인+도매': ['online', 'whole'],
  '프랜차이즈+도매': ['fran', 'whole'],
};

function runSeed(seed) {
  FF.reset(seed);
  while (!FF.isOver()) FF.stepDay(FF.Cmd.wait());
  return { hist: FF.histOf(), rel: FF.relOf().slice(), netWorth: FF.netWorth(FF.toKernelState()), cash: FF.ledger().cash, bust: FF.isBust() };
}
function avg(a) { return a.length ? a.reduce((x, y) => x + y, 0) / a.length : NaN; }

const rows = [];
for (const [scaleName, scale] of Object.entries(SUPPLY_SCALES)) {
  for (const [condName, keys] of Object.entries(CHANNEL_CONDS)) {
    FF.C.sm = ORIGINAL_SM.map(v => v * scale);
    FF.C.channels = ORIGINAL_CHANNELS.filter(c => keys.includes(c.key));
    const runs = [];
    for (let seed = 1; seed <= N_SEEDS; seed++) runs.push(runSeed(seed));
    FF.C.sm = ORIGINAL_SM; FF.C.channels = ORIGINAL_CHANNELS;

    let ageWeightedSum = 0, exitUnits = 0, totalWaste = 0, totalIntake = 0, totalSold = 0, age4Units = 0;
    const netWorthPerSeed = [], relPerSeed = [], missedPerSeed = [], cashPerSeed = [], wasteRatePerSeed = [];
    for (const run of runs) {
      let sw = 0, su = 0, seedWaste = 0, seedIntake = 0, seedMissed = 0;
      for (const day of run.hist) {
        (day.ageMix || []).forEach(({ a, q }) => {
          sw += a * q; su += q; totalSold += q;
          if (a === 4) age4Units += q;
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
      supply: scaleName, channels: condName,
      dio: ageWeightedSum / exitUnits,
      age4Pct: 100 * age4Units / totalSold,
      wasteRate: 100 * totalWaste / totalIntake,
      netWorth: avg(netWorthPerSeed), missed: avg(missedPerSeed),
      rel: avg(relPerSeed), cash: avg(cashPerSeed),
      bustPct: 100 * runs.filter(r => r.bust).length / N_SEEDS,
    });
  }
}

console.log(`n=${N_SEEDS} per cell, ${rows.length}개 조건`);
console.table(rows.map(r => ({
  공급: r.supply, 판로: r.channels, DIO: r.dio.toFixed(3), age4: r.age4Pct.toFixed(2) + '%',
  부패율: r.wasteRate.toFixed(2) + '%', netWorth: Math.round(r.netWorth), cash: Math.round(r.cash),
  missed: r.missed.toFixed(1), 평균관계: r.rel.toFixed(2), bust: r.bustPct.toFixed(1) + '%'
})));

console.log('\n-- 공급 규모별 추세(판로=3개 고정) --');
console.table(rows.filter(r => r.channels === '3개').map(r => ({
  공급: r.supply, DIO: r.dio.toFixed(3), age4: r.age4Pct.toFixed(2) + '%', 부패율: r.wasteRate.toFixed(2) + '%',
  netWorth: Math.round(r.netWorth), missed: r.missed.toFixed(1), bust: r.bustPct.toFixed(1) + '%'
})));

console.log('\n-- 판로 수별 추세(공급=1.0x 고정) --');
console.table(rows.filter(r => r.supply === '1.0x').map(r => ({
  판로: r.channels, DIO: r.dio.toFixed(3), age4: r.age4Pct.toFixed(2) + '%', 부패율: r.wasteRate.toFixed(2) + '%',
  netWorth: Math.round(r.netWorth), missed: r.missed.toFixed(1), bust: r.bustPct.toFixed(1) + '%'
})));
