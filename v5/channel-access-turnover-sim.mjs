// 이슈 #15 attribution: DIO 0.28일·부패 0%가 "노화 메커니즘이 무의미해서"가 아니라
// "Day1부터 판로 3개가 전부 열려 있어서 상시 유동성을 공급하기 때문"일 수 있다는 가설을
// 검증한다. 커널 규칙은 바꾸지 않고 FF.C.channels 배열만(이 실험 동안) 부분집합으로
// 패치해 판로 접근성을 제한한 반사실을 만든다 - 가격·quota·cap·settle 등 채널 자체의
// 정의는 그대로 두고 "그 판로가 이번 판에 존재하는가"만 바꾼다.
// stance는 모든 조건에서 걸지 않는다(기본 단가우선 정렬) - 이 실험의 변수는 판로 개수
// 하나뿐이어야 하므로 배분 정책이라는 별도 변수를 섞지 않는다.
import fs from 'fs';

const stub = 'var FF={},FV={};';
const DOMAIN = ['src-core.js','src-store.js','src-access.js','src-uistate.js','src-kernel.js','src-runner.js','src-record.js','src-engine.js','src-counter.js','src-fact.js','src-report-data.js'];
const src = stub + DOMAIN.map(f => fs.readFileSync(f, 'utf8')).join('\n') + '\nreturn FF;';
const FF = new Function(src)();

const N_SEEDS = Number(process.argv[2] || 500);
const TTL = FF.C.ttl;
const ORIGINAL_CHANNELS = FF.C.channels.map(c => Object.assign({}, c));

const CONDITIONS = {
  '3개(기준)': ['online', 'fran', 'whole'],
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
  return { hist: FF.histOf(), rel: FF.relOf().slice(), netWorth: FF.netWorth(FF.toKernelState()), bust: FF.isBust() };
}

function avg(a) { return a.length ? a.reduce((x, y) => x + y, 0) / a.length : NaN; }
function pctile(a, p) { if (!a.length) return NaN; const s = [...a].sort((x, y) => x - y); return s[Math.min(s.length - 1, Math.floor(s.length * p))]; }

const summary = [];
for (const [condName, keys] of Object.entries(CONDITIONS)) {
  FF.C.channels = ORIGINAL_CHANNELS.filter(c => keys.includes(c.key));
  const runs = [];
  for (let seed = 1; seed <= N_SEEDS; seed++) runs.push(runSeed(seed));
  FF.C.channels = ORIGINAL_CHANNELS;

  let ageWeightedSum = 0, exitUnits = 0, totalWaste = 0, totalIntake = 0, totalSold = 0, totalMissed = 0;
  const ageHist = [0, 0, 0, 0, 0];
  const dioPerSeed = [], wasteRatePerSeed = [], netWorthPerSeed = [], endInvPerSeed = [], relPerSeed = [], missedPerSeed = [];
  for (const run of runs) {
    let sw = 0, su = 0, seedWaste = 0, seedIntake = 0, seedMissed = 0;
    for (const day of run.hist) {
      (day.ageMix || []).forEach(({ a, q }) => {
        sw += a * q; su += q; totalSold += q;
        if (a >= 0 && a <= 4) ageHist[a] += q;
      });
      sw += TTL * day.wT; su += day.wT; seedWaste += day.wT; totalWaste += day.wT;
      seedIntake += day.acc; totalIntake += day.acc;
      seedMissed += day.missed; totalMissed += day.missed;
    }
    ageWeightedSum += sw; exitUnits += su;
    dioPerSeed.push(su > 0 ? sw / su : NaN);
    wasteRatePerSeed.push(seedIntake > 0 ? seedWaste / seedIntake : 0);
    netWorthPerSeed.push(run.netWorth);
    endInvPerSeed.push(run.hist[run.hist.length - 1].end);
    relPerSeed.push(avg(run.rel));
    missedPerSeed.push(seedMissed);
  }

  const row = {
    cond: condName,
    dio: ageWeightedSum / exitUnits,
    dioMedian: pctile(dioPerSeed, 0.5),
    age0Pct: 100 * ageHist[0] / totalSold,
    age4Pct: 100 * ageHist[4] / totalSold,
    wasteRate: 100 * totalWaste / totalIntake,
    wasteZeroSeedPct: 100 * wasteRatePerSeed.filter(x => x === 0).length / N_SEEDS,
    netWorth: avg(netWorthPerSeed),
    endInv: avg(endInvPerSeed),
    rel: avg(relPerSeed),
    missed: avg(missedPerSeed),
    bustPct: 100 * runs.filter(r => r.bust).length / N_SEEDS,
  };
  summary.push(row);
  console.log(`${condName.padEnd(14)} DIO=${row.dio.toFixed(3)}일(median ${row.dioMedian.toFixed(3)})` +
    ` age0=${row.age0Pct.toFixed(1)}% age4=${row.age4Pct.toFixed(2)}%` +
    ` 부패율=${row.wasteRate.toFixed(2)}%(0인seed ${row.wasteZeroSeedPct.toFixed(0)}%)` +
    ` 종료재고=${row.endInv.toFixed(1)} missed평균=${row.missed.toFixed(1)}` +
    ` netWorth=${row.netWorth.toFixed(0)} 평균관계=${row.rel.toFixed(2)} bust=${row.bustPct.toFixed(1)}%`);
}

console.log('\n요약 표 (판로 수 증가에 따른 추세 확인용)');
console.table(summary.map(r => ({
  조건: r.cond, DIO: r.dio.toFixed(3), age0: r.age0Pct.toFixed(1) + '%', age4: r.age4Pct.toFixed(2) + '%',
  부패율: r.wasteRate.toFixed(2) + '%', netWorth: Math.round(r.netWorth), missed: r.missed.toFixed(1), bust: r.bustPct.toFixed(1) + '%'
})));
