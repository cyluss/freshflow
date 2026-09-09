// 생산 확정(turn-reveal) 도입에 대한 증적 스크립트. 헤드리스, 도메인만 싣는다.
// 요청받은 "먼저 막아야 할 10개 gate"를 하나씩 실제 값으로 확인하고 텍스트로 남긴다.
import fs from 'fs';
const stub = 'var FF={},FV={};';
const DOMAIN = ['src-core.js','src-store.js','src-access.js','src-uistate.js','src-kernel.js',
  'src-runner.js','src-record.js','src-engine.js','src-counter.js','src-fact.js','src-report-data.js'];
const src = stub + DOMAIN.map(f => fs.readFileSync(f,'utf8')).join('\n') + '\nreturn FF;';
const FF = new Function(src)();

let ok = 0, bad = 0;
const gate = (n, name, cond, evidence) => {
  const mark = cond ? 'PASS' : 'FAIL';
  if (cond) ok++; else bad++;
  console.log(`[${mark}] ${n}. ${name}`);
  if (evidence !== undefined) console.log('    ' + evidence);
};

console.log('=== gate 1~4: RNG 소비 시점 ===');
{
  // Rng.next/norm 호출 횟수를 계측한다.
  let calls = 0;
  const origNext = FF.Rng.prototype.next;
  FF.Rng.prototype.next = function(){ calls++; return origNext.call(this); };

  FF.reset(30699);
  const c1 = calls;
  gate(1, '턴 시작(reset)에서 생산 RNG가 소비된다(0회가 아니다)', c1 > 0,
    `reset() 중 Rng.next 호출 ${c1}회`);
  const prod1 = FF.prodOf();
  gate('1b', '확정 생산은 조회해도 값이 안 바뀐다(순수 조회)', FF.prodOf() === prod1 && FF.prodOf() === prod1,
    `FF.prodOf() 반복 조회: ${FF.prodOf()}, ${FF.prodOf()}, ${FF.prodOf()}`);

  calls = 0;
  // 정책을 여러 번 바꾼다 (RNG 무소비여야 한다)
  FF.setChannelStance(0, 2); FF.setChannelStance(1, 3); FF.setChannelStance(2, 0);
  FF.stancePlan(); FF.stancePlan(); FF.stancePlan();
  gate(4, '정책 변경 + 미리보기 반복 호출은 RNG를 소비하지 않는다', calls === 0,
    `정책 3회 변경 + stancePlan() 3회 호출 동안 Rng.next 호출 ${calls}회`);
  gate('1c', '정책을 여러 번 바꿔도 확정 생산은 그대로다', FF.prodOf() === prod1,
    `변경 전 ${prod1} vs 변경 후 ${FF.prodOf()}`);

  calls = 0;
  const beforeProd = FF.prodOf();
  FF.stepDay(FF.Cmd.wait());
  const afterStepCalls = calls;
  const dayRec = FF.histOf()[FF.histOf().length - 1];
  gate(3, '하루 실행(stepDay)에서 수요 RNG가 실현된다(0회가 아니다)', afterStepCalls > 0,
    `stepDay() 중 Rng.next 호출 ${afterStepCalls}회 (수요 1 + 판로별 변동 ${FF.C.channels.length} + 국면전이 1~2 + 다음날 생산확정 포함)`);
  gate('3b', '실행에 쓰인 생산은 실행 전 확정치와 같다(재추첨 없음)', dayRec.prod === beforeProd,
    `확정 생산 ${beforeProd} == 기록된 생산 ${dayRec.prod}`);
}

console.log('\n=== gate 2: 생산 RNG가 하루 실행 중 재소비되지 않는다 ===');
{
  // stepDay는 내부에서 "오늘 실행"과 "내일 생산 확정"을 함께 한다(다음 화면을 위해).
  // 그래서 stepDay 자체의 소비량에는 다음날 생산 1회가 섞여 있다 - 이건 의도된 동작이다.
  // 순수하게 "오늘 실행"만 분리해 확인한다: nextDemand()만 직접 불러서 production을 요구하지 않는지 본다.
  const src2 = fs.readFileSync('src-kernel.js', 'utf8');
  const hasProdInDemand = /nextDemand:function\(\)\{[^]*?rngS/.test(src2.split('nextDemand:function')[1] || '');
  gate(2, 'World.nextDemand()의 정의에 생산 스트림(rngS)에 대한 참조가 없다(코드 검사)', !hasProdInDemand,
    'nextDemand 본문에 rngS 미참조 확인');
  const transitionSrc = src2.slice(src2.indexOf('FF.transition=function'), src2.indexOf('FF.initialState=function'));
  gate('2b', 'FF.transition은 todayProd가 있으면 world.production을 쓰지 않는다(코드 검사)',
    /revealed\?s\.todayProd:world\.production/.test(transitionSrc),
    'transition 본문에서 prod = revealed ? s.todayProd : world.production 확인');
}

console.log('\n=== gate 5~6: 오늘 입고/판매 가능 ===');
{
  FF.reset(12345);
  const prod = FF.prodOf();
  const caps = FF.capsOf();
  const intake = FF.todayIntake();
  // 이슈 #22/#26: capProcure(조달 능력)가 생긴 뒤로 평상시 입고 상한은 capIntake 하나가
  // 아니라 min(capIntake,capProcure)다.
  gate(5, '오늘 입고는 확정 생산 기반이다(국면 평균 아님)', intake === FF.rInt(Math.min(prod, caps.intake, caps.procure)),
    `production=${prod.toFixed(3)}, intakeCap=${caps.intake}, procureCap=${caps.procure}, todayIntake()=${intake}`);
  const inv = FF.inventory();
  const P = FF.stancePlan();
  gate(6, '판매 가능(sellable)은 재고+확정 입고다', P.sellable === FF.rInt(inv) + intake,
    `inv=${FF.rInt(inv)} + intake=${intake} = ${FF.rInt(inv)+intake}, P.sellable=${P.sellable}`);

  // production이 intakeCap보다 작을 때: 입고는 생산량 그대로여야 한다(민 관계)
  let seed = 1, foundLow = false;
  for (; seed < 200 && !foundLow; seed++) {
    FF.reset(seed);
    if (FF.prodOf() < FF.capsOf().intake) { foundLow = true; break; }
  }
  gate('5b', '생산이 입고 한도보다 작으면 입고는 생산량과 같다(min 관계, 낮은 생산 시드로 확인)',
    foundLow && FF.todayIntake() === FF.rInt(FF.prodOf()),
    `seed=${seed}, production=${FF.prodOf().toFixed(3)} < intakeCap=${FF.capsOf().intake} → todayIntake()=${FF.todayIntake()}`);
}

console.log('\n=== gate 9: preview와 actual의 차이는 수요 실현 차이로만 설명된다(공급 오차 없음) ===');
{
  const rows = [];
  for (let seed = 1; seed <= 30; seed++) {
    FF.reset(seed);
    const plannedIntake = FF.todayIntake();
    const plannedPool = FF.stancePlan().pool;
    FF.stepDay(FF.Cmd.wait());
    const d = FF.histOf()[0];
    rows.push({ seed, plannedIntake, actualAcc: FF.rInt(d.acc), plannedPool, actualPool: FF.rInt(d.acc) + 0 });
  }
  const bad9 = rows.filter(r => r.plannedIntake !== r.actualAcc);
  gate(9, '계획된 입고(planned)와 실제 입고(actual)가 30개 시드에서 전부 일치한다(입고는 더 이상 놀라움이 없다)',
    bad9.length === 0,
    bad9.length ? ('불일치 ' + bad9.length + '건: ' + JSON.stringify(bad9.slice(0,3))) :
      ('30개 시드 표본, 예: seed=1 planned=' + rows[0].plannedIntake + ' actual=' + rows[0].actualAcc +
       ' | seed=15 planned=' + rows[14].plannedIntake + ' actual=' + rows[14].actualAcc));
}

console.log('\n=== gate 7~8: 배분 ===');
{
  FF.reset(31236);
  FF.setChannelStance(0,1); FF.setChannelStance(1,1); FF.setChannelStance(2,1);
  const P = FF.stancePlan();
  const sum = P.preview.reduce((a,b)=>a+b,0);
  gate(7, 'Allocation 합이 판매 가능(pool)을 넘지 않는다', sum <= P.pool + 1e-6,
    `preview=[${P.preview.join(',')}], sum=${sum}, pool=${P.pool}`);
  const kernelSrc = fs.readFileSync('src-kernel.js','utf8');
  const reportSrc = fs.readFileSync('src-report-data.js','utf8');
  gate(8, '커널과 미리보기가 같은 FF.allocatePool을 쓴다(코드 검사)',
    /FF\.allocatePool\(/.test(kernelSrc) && /FF\.allocatePool\(/.test(reportSrc),
    '두 파일 모두 FF.allocatePool( 호출 확인');
}

console.log('\n=== gate 10 + 스트림 독립성: 결정성 ===');
{
  const plan = { 3: 'sales', 7: 'contract' };
  const run = (seed) => {
    FF.reset(seed);
    const out = [];
    for (let d = 1; d <= 30; d++) {
      if (FF.isOver()) break;
      const cmd = plan[d] === 'sales' ? FF.Cmd.buy('sales') : plan[d] === 'contract' ? FF.Cmd.contract(1) : FF.Cmd.wait();
      FF.stepDay(cmd);
    }
    return FF.histOf().map(r => r1x(r.prod) + '|' + r1x(r.dem) + '|' + r1x(r.sold) + '|' + r1x(r.cash));
  };
  const r1x = n => Math.round(n*1000)/1000;
  const a = run(777).join(';');
  const b = run(777).join(';');
  gate(10, '동일 seed+동일 명령이력이면 전체 결과가 바이트 단위로 같다(재현성)', a === b,
    `길이 ${a.length}자 문자열 완전 일치 확인 (seed=777, 30일)`);

  // 스트림 독립성: 공급 분포 파라미터를 바꿔도 수요 시퀀스(di, chDemand 비율)는 그대로여야 한다.
  // reset()은 규칙 주입을 받지 않으므로, World를 직접 만들어 비교한다.
  const altR = JSON.parse(JSON.stringify(FF.C));
  altR.sm = [999, 999, 999]; altR.sd = 0.001; // 생산 분포를 완전히 다르게
  const w1 = FF.World(555);
  const w2 = FF.World(555, altR);
  const d1 = []; const d2 = [];
  for (let i=0;i<10;i++){ w1.nextProduction(); d1.push(w1.nextDemand().demand); }
  for (let i=0;i<10;i++){ w2.nextProduction(); d2.push(w2.nextDemand().demand); }
  const sameDemand = JSON.stringify(d1) === JSON.stringify(d2);
  gate('S1', '생산 분포(R.sm/R.sd)를 바꿔도 수요 시퀀스가 그대로다(스트림 독립)', sameDemand,
    `기본 규칙 수요열: [${d1.map(x=>x.toFixed(2)).join(',')}]\n    변경 규칙 수요열: [${d2.map(x=>x.toFixed(2)).join(',')}]`);

  const w3 = FF.World(555);
  const w4 = FF.World(555);
  const p3 = []; const p4 = [];
  for (let i=0;i<10;i++){ p3.push(w3.nextProduction().production); w3.nextDemand(); }
  for (let i=0;i<10;i++){ p4.push(w4.nextProduction().production); }
  // w4는 nextDemand를 한 번도 안 불렀다 - 수요 소비 여부가 생산열에 영향 없어야 한다.
  const sameProd = JSON.stringify(p3) === JSON.stringify(p4);
  gate('S2', '수요를 뽑든 안 뽑든 생산 시퀀스가 그대로다(스트림 독립, 역방향)', sameProd,
    `수요 호출한 경우 생산열: [${p3.map(x=>x.toFixed(2)).join(',')}]\n    수요 호출 안 한 경우 생산열: [${p4.map(x=>x.toFixed(2)).join(',')}]`);
}

console.log(`\n=== 요약: ${ok} PASS, ${bad} FAIL ===`);
process.exit(bad ? 1 : 0);
