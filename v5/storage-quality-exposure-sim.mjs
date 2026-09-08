// 이슈 #15 1단계: 보관·품질관리 기능을 만들기 전에 현재 재고 노화가 실제 손실을 만드는지
// 감사한다. 관계·가격·보상 규칙은 바꾸지 않는다 - 기존 커널을 그대로 실행하고 histOf에
// 이미 기록되는 ageMix(그날 판매된 lot의 나이별 수량)와 wT(그날 폐기량)만으로 잰다.
// DIO(재고 평균 보유기간)가 선행 자료에서 0.2~0.5일로 매우 짧았다는 관측을 재확인하는 것이
// 이 스크립트의 1차 목적이다 - 재고가 거의 당일 회전한다면 보존서비스 시장 자체가 없다.
import fs from 'fs';

const stub = 'var FF={},FV={};';
const DOMAIN = ['src-core.js','src-store.js','src-access.js','src-uistate.js','src-kernel.js','src-runner.js','src-record.js','src-engine.js','src-counter.js','src-fact.js','src-report-data.js'];
const src = stub + DOMAIN.map(f => fs.readFileSync(f, 'utf8')).join('\n') + '\nreturn FF;';
const FF = new Function(src)();

const N_SEEDS = Number(process.argv[2] || 500);
const TTL = FF.C.ttl; // 5. 폐기되는 lot은 age가 TTL에 닿아서 나간다(advanceTimed: a>=TTL).
const STYLES = {
  '기본': [1, 1, 1],
  '프랜차이즈우선': [1, 2, 1],
  '도매우선': [1, 1, 2],
};

function runSeed(seed, stance) {
  FF.reset(seed);
  if (stance) FF.stepDay(FF.Cmd.stance(stance));
  while (!FF.isOver()) FF.stepDay(FF.Cmd.wait());
  return { hist: FF.histOf(), rel: FF.relOf().slice(), netWorth: FF.netWorth(FF.toKernelState()), bust: FF.isBust() };
}

function avg(a) { return a.length ? a.reduce((x, y) => x + y, 0) / a.length : NaN; }
function pctile(a, p) { if (!a.length) return NaN; const s = [...a].sort((x, y) => x - y); return s[Math.min(s.length - 1, Math.floor(s.length * p))]; }
function corr(xs, ys) {
  const mx = avg(xs), my = avg(ys); let num = 0, dx2 = 0, dy2 = 0;
  for (let i = 0; i < xs.length; i++) { const dx = xs[i] - mx, dy = ys[i] - my; num += dx * dy; dx2 += dx * dx; dy2 += dy * dy; }
  return num / Math.sqrt(dx2 * dy2);
}

for (const [styleName, stance] of Object.entries(STYLES)) {
  console.log(`\n========== 스타일: ${styleName} (n=${N_SEEDS}) ==========`);
  const runs = [];
  for (let seed = 1; seed <= N_SEEDS; seed++) runs.push(runSeed(seed, stance));

  // 1) DIO: 나간(팔리거나 폐기된) 모든 단위의 가중평균 나이. 폐기 단위는 age=TTL에서 나간다.
  let ageWeightedSum = 0, exitUnits = 0;
  const ageHist = [0, 0, 0, 0, 0]; // age 0..4에 팔린 수량(폐기 제외)
  let totalWaste = 0, totalIntake = 0, totalSold = 0;
  const dioPerSeed = [], wasteRatePerSeed = [], finalRelPerSeed = [], netWorthPerSeed = [];
  for (const run of runs) {
    let sw = 0, su = 0, seedWaste = 0, seedIntake = 0;
    for (const day of run.hist) {
      (day.ageMix || []).forEach(({ a, q }) => {
        sw += a * q; su += q; totalSold += q;
        if (a >= 0 && a <= 4) ageHist[a] += q;
      });
      sw += TTL * day.wT; su += day.wT; seedWaste += day.wT; totalWaste += day.wT;
      seedIntake += day.acc; totalIntake += day.acc;
    }
    ageWeightedSum += sw; exitUnits += su;
    dioPerSeed.push(su > 0 ? sw / su : NaN);
    wasteRatePerSeed.push(seedIntake > 0 ? seedWaste / seedIntake : 0);
    finalRelPerSeed.push(avg(run.rel));
    netWorthPerSeed.push(run.netWorth);
  }
  console.log(`DIO(가중평균 보유기간, 실단위 절반척도이므로 *0.5 필요 없음-내부단위 그대로): 전체 평균=${(ageWeightedSum / exitUnits).toFixed(3)}일` +
    ` (seed별 평균의 median=${pctile(dioPerSeed, 0.5).toFixed(3)}, p90=${pctile(dioPerSeed, 0.9).toFixed(3)})`);
  console.log(`age별 판매 비중(폐기 제외): ` + ageHist.map((v, i) => `age${i}=${(100 * v / totalSold).toFixed(1)}%`).join(', '));
  console.log(`부패율(폐기량/총입고량): 전체=${(100 * totalWaste / totalIntake).toFixed(3)}%` +
    ` (seed별 median=${(100 * pctile(wasteRatePerSeed, 0.5)).toFixed(3)}%, p90=${(100 * pctile(wasteRatePerSeed, 0.9)).toFixed(3)}%,` +
    ` 부패 0인 seed 비율=${(100 * wasteRatePerSeed.filter(x => x === 0).length / N_SEEDS).toFixed(1)}%)`);

  // 2) 품질 배수(q) 손실. price=base*rel*q이므로 q<1인 age(=TTL-1=4)에서만 직접적 가격손실이 난다.
  const qOfAge = FF.C.q; // [1,1,1,1,.8]
  let qWeighted = 0;
  ageHist.forEach((v, a) => { qWeighted += v * qOfAge[Math.min(a, qOfAge.length - 1)]; });
  console.log(`평균 품질배수(q, 1=손실없음): ${(qWeighted / totalSold).toFixed(4)}` +
    ` (age4 판매 비중=${(100 * ageHist[4] / totalSold).toFixed(2)}%만 q=0.8 손실을 본다)`);

  // 3) TTL 임박 재고. 채널 가격표 자체가 나이에 따라 이미 크게 떨어진다(예: online age>=3는 가격 0).
  console.log(`판로별 가격표(나이 0~4, 0=이미 그 판로에서 못 판다는 뜻): `);
  FF.C.channels.forEach(c => console.log(`  ${c.key}: [${c.price.join(', ')}]`));

  // 4) TTL 직전(age=TTL-1=4) 재고가 남아있던 날의 비율과 평균 재고량 - 폐기 직전 상태 노출도.
  let daysWithOldStock = 0, totalDays = 0, oldStockSum = 0;
  for (const run of runs) {
    for (const day of run.hist) {
      totalDays++;
      const oldQtySoldToday = (day.ageMix || []).filter(m => m.a === 4).reduce((s, m) => s + m.q, 0);
      // ageMix는 "판매된" 양이라 재고에 "남아있는" TTL-1살 물량은 별도 신호가 없다 - 대신
      // 폐기(wT)가 다음날 발생했는지로 그 전날 TTL-1 재고가 있었음을 역산할 수 있다.
      if (day.wT > 0) { daysWithOldStock++; oldStockSum += day.wT; }
    }
  }
  console.log(`폐기가 발생한 날의 비율=${(100 * daysWithOldStock / totalDays).toFixed(2)}%, 발생일 평균 폐기량=${(oldStockSum / Math.max(1, daysWithOldStock)).toFixed(2)}`);

  // 5) 재고 노화(부패)와 관계·성과의 상관관계.
  console.log(`corr(seed 부패율, 최종 평균관계)=${corr(wasteRatePerSeed, finalRelPerSeed).toFixed(3)}`);
  console.log(`corr(seed 부패율, netWorth)=${corr(wasteRatePerSeed, netWorthPerSeed).toFixed(3)}`);
  console.log(`corr(seed DIO, netWorth)=${corr(dioPerSeed.map(x => isNaN(x) ? 0 : x), netWorthPerSeed).toFixed(3)}`);
}

console.log(`\n[참고] "신선할 때 팔지 않고 보유한 것이 유리했던 사례"는 현재 커널에 판매를 미루는`);
console.log(`옵션 자체가 없어(그날 팔 수 있는 만큼은 그날 다 판다) 순수 관측으로는 답할 수 없다.`);
console.log(`이 질문은 2단계(정지 옵션을 실제로 도입한 뒤 반사실 비교)에서만 답할 수 있다.`);
