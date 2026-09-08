// 이슈 #14 1단계: 평상수요 기준선(CBL, Mid 3 of 5)과 수요 폭증(surge)의 자연 발생 exposure를
// 잰다. 관계·가격·보상 규칙은 전혀 바꾸지 않는다 - 기존 커널을 그대로 실행하고 사후적으로
// 관측만 한다. 새 RNG 이벤트도 없다 - 기존 수요모델이 이미 낸 판로별 실제 수요를 기준선과
// 비교해서 파생적으로 식별한다.
import fs from 'fs';

const stub = 'var FF={},FV={};';
const DOMAIN = ['src-core.js','src-store.js','src-access.js','src-uistate.js','src-kernel.js','src-runner.js','src-record.js','src-engine.js','src-counter.js','src-fact.js','src-report-data.js'];
const src = stub + DOMAIN.map(f => fs.readFileSync(f, 'utf8')).join('\n') + '\nreturn FF;';
const FF = new Function(src)();

const N_SEEDS = Number(process.argv[2] || 500);
// 사전 선언 threshold 후보. 최적값을 찾는 게 아니라 각각의 자연 발생 빈도를 보는 게 목적이다.
const THRESHOLDS = [1.25, 1.50, 1.75, 2.00];
const MIN_HISTORY = 5; // 5일 이력이 쌓이기 전(day<=5)에는 surge를 판정하지 않는다.

// 스타일은 판로 태도(stance)만 바꾼다. 관계·가격 규칙 자체는 손대지 않는다 - 실제 플레이가
// 취할 법한 세 가지 고정 정책 아래에서 "기존 수요모델"이 어떻게 보이는지를 비교한다.
const STYLES = {
  '기본': [1, 1, 1],
  '프랜차이즈우선': [1, 2, 1],
  '도매우선': [1, 1, 2],
};
const CH_KEYS = FF.C.channels.map(c => c.key);
const TOT_CAP = FF.C.channels.reduce((a, c) => a + c.cap, 0);

// stepState가 실제로 쓰는 판로별 수요 산식을 그대로 재현한다(2차 소스 없이 직접 계산하지
// 않으면 stepState 결과 어디에도 판로별 "수요"가 그대로 남아있지 않다 - toCh/revCh는
// "판매량"이라 이미 상한 적용 후다). relBefore는 그 날 stepDay를 부르기 전 관계 수준이다.
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

function runSeed(seed, stance) {
  FF.reset(seed);
  const chHist = CH_KEYS.map(() => []); // chHist[ci][day-1] = 그날 판로별 실제 수요
  for (let day = FF.run().day; day <= FF.C.days; day++) {
    if (FF.isOver()) break;
    const relBefore = FF.relOf().slice();
    const cmd = (day === 1) ? FF.Cmd.stance(stance) : FF.Cmd.wait();
    FF.stepDay(cmd);
    const d = FF.today();
    const chDem = reconstructChDemand(d.dem, relBefore);
    chDem.forEach((v, ci) => chHist[ci].push(v));
  }
  return chHist;
}

function avg(a) { return a.length ? a.reduce((x, y) => x + y, 0) / a.length : NaN; }
function pctile(a, p) { if (!a.length) return NaN; const s = [...a].sort((x, y) => x - y); return s[Math.min(s.length - 1, Math.floor(s.length * p))]; }

for (const [styleName, stance] of Object.entries(STYLES)) {
  console.log(`\n========== 스타일: ${styleName} (n=${N_SEEDS}) ==========`);

  // 재구성 공식이 실제 kernel의 총수요(r.dem)와 어긋나지 않는지 표본 점검한다.
  {
    FF.reset(1);
    let maxDiff = 0, sampleDays = 0;
    for (let day = FF.run().day; day <= FF.C.days; day++) {
      if (FF.isOver()) break;
      const relBefore = FF.relOf().slice();
      FF.stepDay(day === 1 ? FF.Cmd.stance(stance) : FF.Cmd.wait());
      const d = FF.today();
      const chDem = reconstructChDemand(d.dem, relBefore);
      maxDiff = Math.max(maxDiff, Math.abs(chDem.reduce((a, b) => a + b, 0) - d.dem));
      sampleDays++;
    }
    console.log(`[점검] seed=1, ${sampleDays}일: sum(재구성 판로별 수요) vs 커널 총수요(r.dem) 최대 오차=${maxDiff.toFixed(1)} (반올림 양자화 오차만 있으면 정상)`);
  }

  // 판로별 이력 수집
  const allChHist = []; // allChHist[seed-1][ci] = [day1..day30 demand]
  for (let seed = 1; seed <= N_SEEDS; seed++) allChHist.push(runSeed(seed, stance));

  // 판로별 surge 지표 계산
  for (let ci = 0; ci < CH_KEYS.length; ci++) {
    console.log(`\n-- 판로: ${CH_KEYS[ci]} --`);
    for (const th of THRESHOLDS) {
      let seedsWithSurge = 0, totalSurgeDays = 0, totalDays = 0;
      const firstSurgeDays = [], maxRunLens = [];
      const ratios = [], excesses = [];
      for (let seed = 0; seed < N_SEEDS; seed++) {
        const hist = allChHist[seed][ci]; // 0-indexed, hist[0]=day1. bust로 조기종료하면 30일보다 짧다.
        let firstDay = null, curRun = 0, maxRun = 0, anySurge = false;
        for (let day = MIN_HISTORY + 1; day <= hist.length; day++) {
          const idx = day - 1; // 0-indexed today
          const baseline5 = hist.slice(idx - MIN_HISTORY, idx); // 직전 5일(오늘 제외)
          const cbl = mid3of5(baseline5);
          const actual = hist[idx];
          totalDays++;
          if (cbl <= 0) continue; // CBL이 0이면 비율 정의 불가 - 판정 제외
          const ratio = actual / cbl;
          const excess = actual - cbl;
          const isSurge = ratio >= th;
          if (th === THRESHOLDS[0]) { ratios.push(ratio); excesses.push(excess); } // 분포는 threshold와 무관하니 한 번만 쌓는다
          if (isSurge) {
            totalSurgeDays++; anySurge = true;
            if (firstDay === null) firstDay = day;
            curRun++; maxRun = Math.max(maxRun, curRun);
          } else curRun = 0;
        }
        if (anySurge) seedsWithSurge++;
        if (firstDay !== null) firstSurgeDays.push(firstDay);
        maxRunLens.push(maxRun);
      }
      console.log(
        `  threshold=${th.toFixed(2)}: seed당 발생일수 평균=${(totalSurgeDays / N_SEEDS).toFixed(2)}` +
        `, 1회 이상 발생 seed 비율=${(100 * seedsWithSurge / N_SEEDS).toFixed(1)}%` +
        `, 최초발생일 평균=${firstSurgeDays.length ? avg(firstSurgeDays).toFixed(1) : 'N/A'}` +
        `, 최대연속일 평균=${avg(maxRunLens).toFixed(2)}` +
        `, 전체 판정일 대비 발생비율=${(100 * totalSurgeDays / totalDays).toFixed(1)}%`
      );
      if (th === THRESHOLDS[0]) {
        console.log(
          `    surgeRatio: avg=${avg(ratios).toFixed(2)} p50=${pctile(ratios, 0.5).toFixed(2)}` +
          ` p90=${pctile(ratios, 0.9).toFixed(2)} p99=${pctile(ratios, 0.99).toFixed(2)} max=${Math.max(...ratios).toFixed(2)}`
        );
        console.log(
          `    surgeExcess: avg=${avg(excesses).toFixed(1)} p90=${pctile(excesses, 0.9).toFixed(1)} max=${Math.max(...excesses).toFixed(1)}`
        );
      }
    }
  }

  // 판로 간 동시발생. threshold=1.5(중간값) 기준으로 그날 몇 개 판로가 동시에 surge였는지 센다.
  console.log('\n-- 판로 간 동시발생(threshold=1.50) --');
  const coTh = 1.50;
  const coCounts = [0, 0, 0, 0]; // 0판로, 1판로, 2판로, 3판로 동시
  let coTotalDays = 0;
  for (let seed = 0; seed < N_SEEDS; seed++) {
    const minLen = Math.min(...CH_KEYS.map((_, ci) => allChHist[seed][ci].length));
    for (let day = MIN_HISTORY + 1; day <= minLen; day++) {
      const idx = day - 1;
      let nSurge = 0, valid = true;
      for (let ci = 0; ci < CH_KEYS.length; ci++) {
        const hist = allChHist[seed][ci];
        const cbl = mid3of5(hist.slice(idx - MIN_HISTORY, idx));
        if (cbl <= 0) { valid = false; break; }
        if (hist[idx] / cbl >= coTh) nSurge++;
      }
      if (!valid) continue;
      coCounts[nSurge]++; coTotalDays++;
    }
  }
  console.log('  동시발생 판로 수 분포(판정 가능일 대비 %): ' +
    coCounts.map((c, i) => `${i}개=${(100 * c / coTotalDays).toFixed(1)}%`).join(', '));
}
