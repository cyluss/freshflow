// 이슈 #14 2단계: DemandSurge와 ServiceResponse를 분리해서 기록한다. 관계효과는 아직
// 붙이지 않는다(SurgeHandled는 관측용 Fact일 뿐이다). surge threshold는 1단계에서 확인한
// "가끔 있지만 실재하는" 두 후보 1.50/1.75를 둘 다 유지한다(surge/severe surge 후보).
// 추가로 폭증일을 잘 대응하는 것의 기회비용을 본다: 그 채널을 잘 채운 날 다른 판로가
// 희생됐는지, 재고 버퍼가 평소보다 더 깎였는지를 같은 실행에서 같이 잰다.
import fs from 'fs';

const stub = 'var FF={},FV={};';
const DOMAIN = ['src-core.js','src-store.js','src-access.js','src-uistate.js','src-kernel.js','src-runner.js','src-record.js','src-engine.js','src-counter.js','src-fact.js','src-report-data.js'];
const src = stub + DOMAIN.map(f => fs.readFileSync(f, 'utf8')).join('\n') + '\nreturn FF;';
const FF = new Function(src)();

const N_SEEDS = Number(process.argv[2] || 500);
const SURGE_THRESHOLDS = [1.50, 1.75];
const SERVICE_THRESHOLDS = [0.8, 0.9, 1.0];
const MIN_HISTORY = 5;

const STYLES = {
  '기본': [1, 1, 1],
  '프랜차이즈우선': [1, 2, 1],
  '도매우선': [1, 1, 2],
};
const CH_KEYS = FF.C.channels.map(c => c.key);
const NCH = CH_KEYS.length;
const TOT_CAP = FF.C.channels.reduce((a, c) => a + c.cap, 0);

function reconstructChDemand(dem, relBefore) {
  return FF.C.channels.map((c, i) => {
    const rl = relBefore[i] === undefined ? FF.C.rel.start : relBefore[i];
    const cap2 = c.cap * FF.C.rel.cap[rl];
    const d0 = dem * c.cap / TOT_CAP;
    const fl = c.key === 'fran' ? c.quota * FF.C.rel.floor[rl] : 0;
    return Math.round(Math.min(cap2, Math.max(d0, fl)));
  });
}
function mid3of5(arr5) {
  const s = [...arr5].sort((a, b) => a - b);
  return (s[1] + s[2] + s[3]) / 3;
}

// 하루치 기록: demand(재구성), sold(r.toCh), end(그날 종료 재고)
function runSeed(seed, stance) {
  FF.reset(seed);
  const rows = []; // rows[day-1] = {demand:[ci], sold:[ci], end}
  for (let day = FF.run().day; day <= FF.C.days; day++) {
    if (FF.isOver()) break;
    const relBefore = FF.relOf().slice();
    FF.stepDay(day === 1 ? FF.Cmd.stance(stance) : FF.Cmd.wait());
    const d = FF.today();
    const demand = reconstructChDemand(d.dem, relBefore);
    rows.push({ demand, sold: d.toCh ? d.toCh.slice() : CH_KEYS.map(() => 0), end: d.end });
  }
  return rows;
}

function avg(a) { return a.length ? a.reduce((x, y) => x + y, 0) / a.length : NaN; }

for (const [styleName, stance] of Object.entries(STYLES)) {
  console.log(`\n========== 스타일: ${styleName} (n=${N_SEEDS}) ==========`);
  const allRows = [];
  for (let seed = 1; seed <= N_SEEDS; seed++) allRows.push(runSeed(seed, stance));

  for (const sTh of SURGE_THRESHOLDS) {
    console.log(`\n---- surge threshold=${sTh.toFixed(2)} ----`);
    for (let ci = 0; ci < NCH; ci++) {
      // (seed, dayIdx) 쌍 중 이 채널이 surge인 것들을 모은다.
      const surgeFulfill = []; // 그 채널의 fulfillmentRatio
      const surgeOtherMissed = []; // 같은 날 다른 채널들의 미충족 합
      const surgeEnd = []; // 같은 날 종료재고
      const baseOtherMissed = []; // 비-surge일의 다른 채널 미충족 합(대조군)
      const baseEnd = [];
      const baseFulfill = []; // 비-surge일의 이 채널 자체 fulfillmentRatio(대조군)
      const handledCount = SERVICE_THRESHOLDS.map(() => 0);
      let surgeDayCount = 0;

      for (let seed = 0; seed < N_SEEDS; seed++) {
        const rows = allRows[seed];
        for (let idx = MIN_HISTORY; idx < rows.length; idx++) {
          const hist5 = rows.slice(idx - MIN_HISTORY, idx).map(r => r.demand[ci]);
          const cbl = mid3of5(hist5);
          if (cbl <= 0) continue;
          const actual = rows[idx].demand[ci];
          const isSurge = (actual / cbl) >= sTh;
          const otherMissed = CH_KEYS.reduce((sum, _, cj) => cj === ci ? sum : sum + Math.max(0, rows[idx].demand[cj] - rows[idx].sold[cj]), 0);
          if (isSurge) {
            surgeDayCount++;
            const fulfillRatio = actual > 0 ? rows[idx].sold[ci] / actual : 1;
            surgeFulfill.push(fulfillRatio);
            surgeOtherMissed.push(otherMissed);
            surgeEnd.push(rows[idx].end);
            SERVICE_THRESHOLDS.forEach((st, ti) => { if (fulfillRatio >= st) handledCount[ti]++; });
          } else {
            baseOtherMissed.push(otherMissed);
            baseEnd.push(rows[idx].end);
            baseFulfill.push(actual > 0 ? rows[idx].sold[ci] / actual : 1);
          }
        }
      }
      console.log(`  판로=${CH_KEYS[ci].padEnd(6)} surge일수=${surgeDayCount}` +
        ` 평균fulfillmentRatio=${avg(surgeFulfill).toFixed(3)} (평상일 대조=${avg(baseFulfill).toFixed(3)}, 차이=${(avg(surgeFulfill) - avg(baseFulfill)).toFixed(3)})`);
      SERVICE_THRESHOLDS.forEach((st, ti) => {
        console.log(`    SurgeHandled(fulfill>=${(st * 100).toFixed(0)}%) 비율=${(100 * handledCount[ti] / surgeDayCount).toFixed(1)}%`);
      });
      console.log(`    기회비용 - 다른 판로 미충족 합: surge일 평균=${avg(surgeOtherMissed).toFixed(2)}` +
        ` vs 평상일 평균=${avg(baseOtherMissed).toFixed(2)}` +
        ` (차이=${(avg(surgeOtherMissed) - avg(baseOtherMissed)).toFixed(2)})`);
      console.log(`    기회비용 - 그날 종료재고: surge일 평균=${avg(surgeEnd).toFixed(2)}` +
        ` vs 평상일 평균=${avg(baseEnd).toFixed(2)}` +
        ` (차이=${(avg(surgeEnd) - avg(baseEnd)).toFixed(2)})`);

      // 완전 대응(100%)한 surge일만 따로: 그 날 다른 판로 희생이 더 큰가
      const fullyHandledOtherMissed = [];
      for (let seed = 0; seed < N_SEEDS; seed++) {
        const rows = allRows[seed];
        for (let idx = MIN_HISTORY; idx < rows.length; idx++) {
          const hist5 = rows.slice(idx - MIN_HISTORY, idx).map(r => r.demand[ci]);
          const cbl = mid3of5(hist5);
          if (cbl <= 0) continue;
          const actual = rows[idx].demand[ci];
          if ((actual / cbl) < sTh) continue;
          const fulfillRatio = actual > 0 ? rows[idx].sold[ci] / actual : 1;
          if (fulfillRatio >= 1.0) {
            const otherMissed = CH_KEYS.reduce((sum, _, cj) => cj === ci ? sum : sum + Math.max(0, rows[idx].demand[cj] - rows[idx].sold[cj]), 0);
            fullyHandledOtherMissed.push(otherMissed);
          }
        }
      }
      console.log(`    100% 대응한 surge일만: 다른 판로 미충족 평균=${avg(fullyHandledOtherMissed).toFixed(2)}` +
        ` (n=${fullyHandledOtherMissed.length}, 평상일 대조=${avg(baseOtherMissed).toFixed(2)})`);
    }
  }
}
