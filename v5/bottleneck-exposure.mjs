// 이슈 #8: Lease 조건부 검증 전에, 기존 플레이 스타일 5개에서 판매한도 병목(ship) 노출을
// 먼저 측정한다. buy/lease 개입은 전혀 하지 않는다 - 순수하게 각 스타일의 실제 커널 동작을
// 관찰만 한다. cover=2를 봤더니 병목이 많더라를 보고 그 조건만 골라 쓰는 것을 피하기 위해,
// 다섯 스타일을 먼저 전부 선언하고 각각의 노출(빈도·손실량·연속기간)을 측정한다.
import fs from 'fs';

const stub = 'var FF={},FV={};';
const DOMAIN = ['src-core.js','src-store.js','src-access.js','src-uistate.js','src-kernel.js','src-runner.js','src-record.js','src-engine.js','src-counter.js','src-fact.js','src-report-data.js'];
const src = stub + DOMAIN.map(f => fs.readFileSync(f, 'utf8')).join('\n') + '\nreturn FF;';
const FF = new Function(src)();

const N_SEEDS = Number(process.argv[2] || 300);

const STYLES = {
  '소극적(cover=1)': { cover: 1, stance: null },
  '기본(cover=1.5)': { cover: null, stance: null },
  '적극적매입(cover=2)': { cover: 2, stance: null },
  '프랜차이즈우선': { cover: null, stance: [1, 2, 1] },
  '도매우선': { cover: null, stance: [1, 1, 2] },
};

function runStyle(seed, style) {
  FF.reset(seed);
  let day1cmd = FF.Cmd.wait();
  if (style.cover !== null) day1cmd = FF.Cmd.policy(style.cover);
  else if (style.stance) day1cmd = FF.Cmd.stance(style.stance);
  FF.stepDay(day1cmd);
  // cover와 stance를 동시에 걸어야 하는 스타일은 없지만, 정책 우선 커맨드를 쓴 날
  // stance가 필요하면 다음 날 걸어준다(지금 스타일 표에는 해당 없음, 확장 대비).
  if (style.cover !== null && style.stance) FF.stepDay(FF.Cmd.stance(style.stance));

  let shipDays = 0, lostQty = 0, curRun = 0, maxRun = 0;
  const runs = [];
  for (let day = FF.run().day; day <= FF.C.days; day++) {
    if (FF.isOver()) break;
    FF.stepDay(FF.Cmd.wait());
    const h = FF.histOf()[FF.histOf().length - 1];
    if (!h) continue;
    if (h.b === 'ship') {
      shipDays++; lostQty += h.missed || 0; curRun++;
    } else {
      if (curRun > 0) runs.push(curRun);
      curRun = 0;
    }
  }
  if (curRun > 0) runs.push(curRun);
  maxRun = runs.length ? Math.max(...runs) : 0;
  return { shipDays, lostQty, maxRun, runCount: runs.length };
}

function avg(a) { return a.reduce((x, y) => x + y, 0) / a.length; }

console.log('=== 플레이 스타일별 판매한도(ship) 병목 노출 (n=' + N_SEEDS + ') ===\n');
for (const [name, style] of Object.entries(STYLES)) {
  const rows = [];
  for (let seed = 1; seed <= N_SEEDS; seed++) rows.push(runStyle(seed, style));
  const shipDays = rows.map(r => r.shipDays);
  const lostQty = rows.map(r => r.lostQty);
  const maxRun = rows.map(r => r.maxRun);
  const zeroExposure = rows.filter(r => r.shipDays === 0).length;
  console.log(name.padEnd(16),
    'shipDays avg=' + avg(shipDays).toFixed(2) + '/30',
    'lostQty avg=' + avg(lostQty).toFixed(1),
    'maxRun avg=' + avg(maxRun).toFixed(2),
    'maxRun>=5 시드=' + rows.filter(r => r.maxRun >= 5).length + '/' + N_SEEDS,
    'maxRun>=15 시드=' + rows.filter(r => r.maxRun >= 15).length + '/' + N_SEEDS,
    '노출0 시드=' + zeroExposure + '/' + N_SEEDS);
}
