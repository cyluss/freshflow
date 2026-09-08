// 이슈 #15 후속: 노화손실 메커니즘(age별 품질배수 q, TTL 폐기) 자체가 dead mechanic인지
// 감사한다. #15 1단계에서 age4 판매 0%·부패율 0%를 확인했으니, 이 메커니즘을 완전히
// 꺼도(q(age)=1 전부, 폐기 없음) 같은 시드에서 결과가 사실상 똑같이 나와야 한다는 예측을
// 직접 검증하는 삭제 반사실이다. "새 기능은 가치를 입증해야 추가한다"를 뒤집어 "기존
// 기능도 의사결정에 영향을 안 주면 유지할 이유를 입증해야 한다"에 적용한다.
//
// FF.C.q/FF.C.ttl은 stepState가 매 호출마다 R.q/R.ttl로 읽으므로(rules||FF.C 패턴이 아니라
// FF.stepDay 경로는 항상 FF.C를 직접 쓴다), 이 실험 동안만 전역 FF.C를 패치했다가 되돌린다.
// q 인덱스는 Math.min(age,R.ttl-1)이라 ttl을 그냥 늘리면 q 배열 길이를 넘는 인덱스가 나올 수
// 있어, q를 충분히 긴 전부-1 배열로 같이 늘려서 안전하게 만든다.
import fs from 'fs';

const stub = 'var FF={},FV={};';
const DOMAIN = ['src-core.js','src-store.js','src-access.js','src-uistate.js','src-kernel.js','src-runner.js','src-record.js','src-engine.js','src-counter.js','src-fact.js','src-report-data.js'];
const src = stub + DOMAIN.map(f => fs.readFileSync(f, 'utf8')).join('\n') + '\nreturn FF;';
const FF = new Function(src)();

const N_SEEDS = Number(process.argv[2] || 1000);
const STYLES = {
  '기본': [1, 1, 1],
  '프랜차이즈우선': [1, 2, 1],
  '도매우선': [1, 1, 2],
};
const ORIGINAL_Q = FF.C.q.slice(), ORIGINAL_TTL = FF.C.ttl;
const NO_AGING_Q = new Array(60).fill(1); // 품질배수 손실 없음(전부 1). 60일 게임 길이보다 넉넉히 길다.
const NO_AGING_TTL = 999; // 사실상 폐기 없음(30일 게임에서 age가 999에 닿을 수 없다).

function runSeed(seed, stance) {
  FF.reset(seed);
  if (stance) FF.stepDay(FF.Cmd.stance(stance));
  while (!FF.isOver()) FF.stepDay(FF.Cmd.wait());
  const h = FF.histOf();
  const totalWaste = h.reduce((s, d) => s + d.wT, 0);
  const totalSold = h.reduce((s, d) => s + d.sold, 0);
  return {
    netWorth: FF.netWorth(FF.toKernelState()),
    cash: FF.ledger().cash,
    sold: totalSold,
    waste: totalWaste,
    rel: FF.relOf().slice(),
    end: FF.inventory ? FF.inventory() : h[h.length - 1].end,
    bust: FF.isBust(),
  };
}

function avg(a) { return a.length ? a.reduce((x, y) => x + y, 0) / a.length : NaN; }
function maxAbs(a) { return a.length ? Math.max(...a.map(Math.abs)) : 0; }

for (const [styleName, stance] of Object.entries(STYLES)) {
  console.log(`\n========== 스타일: ${styleName} (n=${N_SEEDS}) ==========`);

  FF.C.q = ORIGINAL_Q; FF.C.ttl = ORIGINAL_TTL;
  const base = [];
  for (let seed = 1; seed <= N_SEEDS; seed++) base.push(runSeed(seed, stance));

  FF.C.q = NO_AGING_Q; FF.C.ttl = NO_AGING_TTL;
  const noAging = [];
  for (let seed = 1; seed <= N_SEEDS; seed++) noAging.push(runSeed(seed, stance));
  FF.C.q = ORIGINAL_Q; FF.C.ttl = ORIGINAL_TTL; // 원상복귀

  const dNetWorth = base.map((b, i) => noAging[i].netWorth - b.netWorth);
  const dCash = base.map((b, i) => noAging[i].cash - b.cash);
  const dSold = base.map((b, i) => noAging[i].sold - b.sold);
  const dEnd = base.map((b, i) => noAging[i].end - b.end);
  const dRel = base.map((b, i) => avg(noAging[i].rel) - avg(b.rel));
  let identicalSeeds = 0;
  for (let i = 0; i < N_SEEDS; i++) {
    if (dNetWorth[i] === 0 && dSold[i] === 0 && dEnd[i] === 0 && dRel[i] === 0) identicalSeeds++;
  }

  console.log(`baseline: 부패 합계=${base.reduce((s, r) => s + r.waste, 0)}, noAging: 부패 합계=${noAging.reduce((s, r) => s + r.waste, 0)}`);
  console.log(`netWorth 차이: avg=${avg(dNetWorth).toFixed(2)}, max|차이|=${maxAbs(dNetWorth).toFixed(2)}`);
  console.log(`cash 차이:     avg=${avg(dCash).toFixed(2)}, max|차이|=${maxAbs(dCash).toFixed(2)}`);
  console.log(`판매량 차이:    avg=${avg(dSold).toFixed(2)}, max|차이|=${maxAbs(dSold).toFixed(2)}`);
  console.log(`종료재고 차이:  avg=${avg(dEnd).toFixed(2)}, max|차이|=${maxAbs(dEnd).toFixed(2)}`);
  console.log(`평균관계 차이:  avg=${avg(dRel).toFixed(4)}, max|차이|=${maxAbs(dRel).toFixed(4)}`);
  console.log(`완전히 동일한 seed 비율(netWorth·판매·재고·관계 전부 무차이)=${(100 * identicalSeeds / N_SEEDS).toFixed(1)}%`);

  const diffSeeds = [];
  for (let i = 0; i < N_SEEDS; i++) if (dNetWorth[i] !== 0) diffSeeds.push({ seed: i + 1, d: dNetWorth[i] });
  if (diffSeeds.length) {
    console.log(`  차이가 있던 seed 예시(최대 5개): ${diffSeeds.slice(0, 5).map(x => `seed${x.seed}:${x.d}`).join(', ')}`);
  }
}
