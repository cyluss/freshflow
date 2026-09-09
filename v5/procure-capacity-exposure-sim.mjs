// 이슈 #19: 조달/확보 capacity(capProcure)를 실제 커널에 넣기 전에, World가 뜻하는 바를
// 먼저 확정한다. 지금은 World.nextProduction()의 prod가 그대로 "플레이어가 실제로 조달
// 가능한 물량"이다. 이걸 "산지 전체 물량"으로 재해석하고 그 아래 capProcure를 추가하면
// 실제 조달량 = min(prod, capProcure, ...)가 된다.
//
// 이 스크립트는 그 재해석이 게임에 어떤 결과를 낳는지 아직 재지 않는다(그건 다음 단계).
// 먼저 답할 질문은 이것 하나다: capProcure를 얼마로 둬야 "가끔만 병목이 되면서 Intake와
// 구별되는 제약"이 자연스럽게 나타나는가. 좋은 상태는 다음 세 가지 사이 어딘가다.
//   - 항상 capProcure가 먼저 막힘 -> 그냥 생산량을 낮춘 것과 같다(필수 업그레이드, 죽은 선택지 없음)
//   - 거의 안 막힘 -> 시장 자체가 없다(#15의 storage/quality와 같은 실패 패턴)
//   - 가끔 공급은 충분한데 capProcure 때문에 못 받음 -> 실제 자본배분 후보
//
// 커널 파일은 건드리지 않는다. FF.revealToday()가 매일 FF.setProd(out.production)로
// 그날 생산을 미리 확정해 두는 지점(FF.reset 안, 그리고 매 stepDay 끝)을 그대로 두고,
// 우리가 그 값을 읽어(rawProd, "산지 전체 물량") FF.setProd(min(rawProd,capProcure))로
// 덮어써서 그 날 stepDay가 실제로 쓰는 값만 좁힌다. 다음 날은 revealToday가 다시 새로
// 뽑으므로 누적 오염이 없다.
//
// 병목 여부는 공식을 재구현하지 않고 같은 seed의 무제한(capProcure=Infinity) 대조군과
// 쌍차로 잰다: 같은 날 acc(실제 입고)가 대조군보다 줄었으면 그날은 capProcure가 실제로
// 뭔가를 막은 것이다. 그중 대조군에서 이미 capIntake에 걸려 있던 날(원래도 "stock"
// 증상)은 겹침으로 따로 센다 - 겹치지 않는 날만 "Intake와 구별되는 조달병목"이다.
import fs from 'fs';

const stub = 'var FF={},FV={};';
const DOMAIN = ['src-core.js','src-store.js','src-access.js','src-uistate.js','src-kernel.js','src-runner.js','src-record.js','src-engine.js','src-counter.js','src-fact.js','src-report-data.js'];
const src = stub + DOMAIN.map(f => fs.readFileSync(f, 'utf8')).join('\n') + '\nreturn FF;';
const FF = new Function(src)();

const N_SEEDS = Number(process.argv[2] || 2000);
const HORIZON = 30; // 순수 노출 측정 단계라 성장/payback 지평은 아직 필요 없다
const EPS = 1;
const CAP_INTAKE = FF.C.cap.intake; // 40(내부단위) - 비율의 기준
// 비율 대신 정수 capProcure를 직접 스윕한다 - cap.intake=40 근처는 1단위=2.5%p라
// 비율로 스윕하면 반올림 때문에 서로 다른 비율이 같은 정수로 뭉친다(예: 0.84·0.86 모두 34).
const CAP_VALUES = [24, 28, 32, 33, 34, 35, 36, 37, 38, 39, 40];

function avg(a) { return a.length ? a.reduce((x, y) => x + y, 0) / a.length : NaN; }

// capProcure=Infinity(무제한, 대조군)면 원래 게임 그대로다.
function runSeed(seed, capProcure) {
  FF.reset(seed);
  const acc = [], rawProd = [], atCapI = [];
  for (let day = FF.run().day; day <= HORIZON; day++) {
    if (FF.isOver()) break;
    const raw = FF.prodOf(); // revealToday가 이미 확정해 둔 "산지 전체 물량"
    if (capProcure !== Infinity) FF.setProd(Math.min(raw, capProcure));
    FF.stepDay(FF.Cmd.wait());
    const d = FF.today();
    rawProd.push(raw); acc.push(d.acc); atCapI.push(d.acc >= d.capI - 0.05);
  }
  return { acc, rawProd, atCapI, bust: FF.isBust() };
}

console.log(`cap.intake(기준) = ${CAP_INTAKE}, 자연 평균 생산(2000seed 사전측정) ≈ 40.33`);

for (const capProcure of CAP_VALUES) {
  const ratio = capProcure / CAP_INTAKE;
  let dayN = 0, boundDays = 0, overlapDays = 0, distinctDays = 0;
  let seedsWithDistinct = 0, seedsTotal = 0;
  for (let seed = 1; seed <= N_SEEDS; seed++) {
    const ctrl = runSeed(seed, Infinity);
    const cap = runSeed(seed, capProcure);
    if (ctrl.bust || cap.bust) continue; // 병목 강도 자체가 파산 여부를 바꾸면 비교가 왜곡되므로 완주 쌍만 본다
    const len = Math.min(ctrl.acc.length, cap.acc.length);
    if (len < HORIZON) continue;
    seedsTotal++;
    let seedHasDistinct = false;
    for (let i = 0; i < len; i++) {
      dayN++;
      const bound = cap.acc[i] < ctrl.acc[i] - EPS;
      if (bound) {
        boundDays++;
        if (ctrl.atCapI[i]) overlapDays++;
        else { distinctDays++; seedHasDistinct = true; }
      }
    }
    if (seedHasDistinct) seedsWithDistinct++;
  }
  console.log(`\nratio=${ratio.toFixed(2)} capProcure=${capProcure} (완주쌍 seed=${seedsTotal}, seed-day=${dayN})`);
  console.log(`  전체 병목일 비율 = ${(100 * boundDays / dayN).toFixed(1)}%`);
  console.log(`  그중 Intake와 겹침(대조군도 이미 capIntake 도달) = ${(100 * overlapDays / Math.max(1,boundDays)).toFixed(1)}%`);
  console.log(`  Intake와 구별되는 조달병목(전체 대비) = ${(100 * distinctDays / dayN).toFixed(2)}%`);
  console.log(`  30일 중 한 번이라도 구별되는 조달병목을 겪는 seed 비율 = ${(100 * seedsWithDistinct / seedsTotal).toFixed(1)}%`);
}
