// 이슈 #18 2단계: 사전 선언한 성장경로별로 병목이 실제로 다른 순서로 이동하는지 본다.
// 목표는 어느 경로의 netWorth가 높은가가 아니라 각 경로가 만드는 병목 이동 순서다.
// 게임에 실제로 있는 성장 레버는 둘뿐이다: 공급(FF.C.sm, 헤드리스 패치)과 판매capacity
// 매입(FF.Cmd.buy('sales'), 유일한 실제 인게임 확장 행동). 판로 신규개방·신용한도 축소
// 같은 레버는 커널에 없어서(채널 배열은 reset 이후 크기를 못 바꾼다) 이번 1차는 이 두
// 레버만으로 "공급선행"과 "capacity선행"을 대비하고, 균형성장을 대조로 둔다 - 5개 경로
// 전부를 억지로 흉내내지 않는다.
// 방법론은 이번 세션에서 확정한 대로: 같은 seed, 같은 calendar day, 무성장 대조군과의
// 쌍차. 매입은 하루 한 번씩만(같은 날 여러 번 부르면 달력이 밀리는 버그를 이미 겪었다).
import fs from 'fs';

const stub = 'var FF={},FV={};';
const DOMAIN = ['src-core.js','src-store.js','src-access.js','src-uistate.js','src-kernel.js','src-runner.js','src-record.js','src-engine.js','src-counter.js','src-fact.js','src-report-data.js'];
const src = stub + DOMAIN.map(f => fs.readFileSync(f, 'utf8')).join('\n') + '\nreturn FF;';
const FF = new Function(src)();

const N_SEEDS = Number(process.argv[2] || 500);
const TTL = FF.C.ttl;
const ORIGINAL_SM = FF.C.sm.slice();

// 공급 스케줄: day -> sm 배율. 지정 안 한 날은 직전 값을 유지한다.
// 매입 스케줄: capacity를 살 날의 집합(하루 한 번, Cmd.buy('sales')).
const PATHS = {
  '무성장(대조)': { smSchedule: { 1: 1.0 }, buyDays: [] },
  '균형성장': { smSchedule: { 1: 0.8, 11: 1.0, 21: 1.2 }, buyDays: [10, 20] },
  '공급선행': { smSchedule: { 1: 0.8, 11: 1.4 }, buyDays: [25] },
  'capacity선행': { smSchedule: { 1: 0.8 }, buyDays: [4, 7] },
};

function smAt(day, schedule) {
  const days = Object.keys(schedule).map(Number).sort((a, b) => a - b);
  let v = schedule[days[0]];
  for (const d of days) if (day >= d) v = schedule[d];
  return v;
}

function runSeed(seed, path) {
  FF.reset(seed);
  const bSeries = [];
  for (let day = FF.run().day; day <= FF.C.days; day++) {
    if (FF.isOver()) break;
    FF.C.sm = ORIGINAL_SM.map(v => v * smAt(day, path.smSchedule));
    const cmd = path.buyDays.includes(day) ? FF.Cmd.buy('sales') : FF.Cmd.wait();
    FF.stepDay(cmd);
    bSeries.push(FF.today().b);
  }
  FF.C.sm = ORIGINAL_SM;
  return { hist: FF.histOf(), bSeries, rel: FF.relOf().slice(), netWorth: FF.netWorth(FF.toKernelState()), cash: FF.ledger().cash, bust: FF.isBust() };
}

function avg(a) { return a.length ? a.reduce((x, y) => x + y, 0) / a.length : NaN; }

const PHASES = [{ name: '초반(1-10)', from: 1, to: 10 }, { name: '중반(11-20)', from: 11, to: 20 }, { name: '후반(21-30)', from: 21, to: 30 }];

for (const [pathName, path] of Object.entries(PATHS)) {
  console.log(`\n========== 경로: ${pathName} (n=${N_SEEDS}) ==========`);
  const runs = [];
  for (let seed = 1; seed <= N_SEEDS; seed++) runs.push(runSeed(seed, path));

  for (const phase of PHASES) {
    const counts = {};
    let total = 0;
    for (const run of runs) {
      for (let day = phase.from; day <= Math.min(phase.to, run.bSeries.length); day++) {
        const b = run.bSeries[day - 1];
        counts[b] = (counts[b] || 0) + 1; total++;
      }
    }
    const top3 = Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, 3)
      .map(([k, v]) => `${k}:${(100 * v / total).toFixed(1)}%`).join(' ');
    console.log(`  ${phase.name.padEnd(10)} 주요 병목: ${top3}`);
  }

  const netWorthAvg = avg(runs.map(r => r.netWorth));
  const cashAvg = avg(runs.map(r => r.cash));
  const relAvg = avg(runs.map(r => avg(r.rel)));
  const bustPct = 100 * runs.filter(r => r.bust).length / N_SEEDS;
  console.log(`  netWorth=${netWorthAvg.toFixed(0)} cash=${cashAvg.toFixed(0)} 평균관계=${relAvg.toFixed(2)} bust=${bustPct.toFixed(1)}%`);
}
