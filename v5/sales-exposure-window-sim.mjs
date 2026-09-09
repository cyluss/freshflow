// 이슈 #21: 공통 시간척도 계약 - Sales capacity 노출조건 독립 검증. 기존 CapacityButton
// 노출조건(FF.capHits('sales',5) 또는 채널당 오늘의 missed>=2, src-view.js:174-191)은
// 30일 게임에서는 드문 사건을 잡지만 365일에서는(#21 2차 확인) 79%의 날에 참이 된다.
// missed 자체가 절대적 문턱(2)이라 사업이 커지면(수요 자체가 커지면) 거의 항상 넘는다.
//
// 대안: "오늘 missed>=2"가 아니라 "최근 W일 중 K일 이상 missed>=2"라는 지속성 조건으로
// 바꾼다. capHits(과거 실제 hit)는 그대로 두고 shortfall 쪽만 지속성 조건으로 교체한다.
// 확인할 것: (1) 지속성 조건이 노출률을 원래 취지(예외적 상황)에 가깝게 되돌리는가,
// (2) 그러면서도 실제로 지속된 병목(진짜 투자할 만한 상황)은 놓치지 않는가 - #19에서
// 이미 확인한 ship_cap_sustained(day10-19 지속) 진단과 같은 원칙이다.
import fs from 'fs';

const stub = 'var FF={},FV={};';
const DOMAIN = ['src-core.js','src-store.js','src-access.js','src-uistate.js','src-kernel.js','src-runner.js','src-record.js','src-engine.js','src-counter.js','src-fact.js','src-report-data.js'];
const src = stub + DOMAIN.map(f => fs.readFileSync(f, 'utf8')).join('\n') + '\nreturn FF;';
const FF = new Function(src)();

const N_SEEDS = Number(process.argv[2] || 500);
const HORIZON = 365;
FF.C.days = HORIZON;

const PERSIST_CONFIGS = [
  { w: 1, k: 1 }, // 원래 조건(오늘 하루만) - 대조 기준
  { w: 5, k: 3 },
  { w: 7, k: 5 },
  { w: 14, k: 10 },
];

function avg(a) { return a.length ? a.reduce((x, y) => x + y, 0) / a.length : NaN; }

function todayShortfall() {
  return FF.factsByChannel().some(r => r['curr.plan.allocation.missed'] >= 2);
}

function runSeed(seed) {
  FF.reset(seed);
  const daily = []; // 매일 shortfall(오늘 단일조건) bool
  for (let day = FF.run().day; day <= HORIZON; day++) {
    if (FF.isOver()) break;
    FF.stepDay(FF.Cmd.wait());
    daily.push(todayShortfall());
  }
  return daily;
}

const seriesBy = [];
for (let seed = 1; seed <= N_SEEDS; seed++) {
  const daily = runSeed(seed);
  seriesBy.push(daily);
}
console.log(`완주 n=${seriesBy.length}/${N_SEEDS}`);

for (const cfg of PERSIST_CONFIGS) {
  let totalDays = 0, exposedDays = 0;
  const exposedRatePerSeed = [];
  const first30 = [], full365 = [];
  for (const daily of seriesBy) {
    let exposedCount = 0;
    let firstCount = 0;
    for (let i = 0; i < daily.length; i++) {
      const from = Math.max(0, i - cfg.w + 1);
      const window = daily.slice(from, i + 1);
      const hits = window.filter(Boolean).length;
      const exposed = hits >= Math.min(cfg.k, window.length) && hits >= cfg.k;
      if (exposed) { exposedCount++; if (i < 30) firstCount++; }
      totalDays++; if (exposed) exposedDays++;
    }
    exposedRatePerSeed.push(100 * exposedCount / daily.length);
    first30.push(100 * firstCount / Math.min(30, daily.length));
  }
  console.log(`\n지속성 조건 W=${cfg.w}일 중 K=${cfg.k}일 이상: `);
  console.log(`  365일 전체 노출률 평균 = ${avg(exposedRatePerSeed).toFixed(1)}%`);
  console.log(`  첫 30일 구간만의 노출률 평균 = ${avg(first30).toFixed(1)}% (원래 30일 게임 설계 의도와 비교하는 기준선)`);
}
