// 이슈 #9: Policy(cover)는 커널/레코드 계층에 이미 완전히 구현돼 있지만(FF.Cmd.policy,
// C.type==="policy", R.policy=[lean:1,mid:1.5,full:2]) 실제 배포된 UI에는 그걸 호출하는
// 화면이 없어서 cover가 게임 내내 기본값 1.5로 고정된다(이슈 #9 O-C-F 역감사에서 확인).
// UI를 만들지 말지 정하기 전에 먼저 답할 질문: "cover를 플레이어가 조절해야 할 경제적
// 이유가 있는가?" - 커널에는 이미 있는 진짜 명령(FF.Cmd.policy)을 그대로 써서 검증한다.
//
// 1단계: 세 고정값(lean=1/mid=1.5/full=2)을 게임 시작(day1)에 한 번만 골라 끝까지 유지하는
// 것만으로 결과가 갈리는가(경제적 유의성), 그리고 최선의 값이 seed마다 다른가(non-dominance -
// 다르면 "그냥 기본값을 바꾼다"로 안 끝나고 플레이어 의사결정으로 남을 이유가 생긴다).
import fs from 'fs';

const stub = 'var FF={},FV={};';
const DOMAIN = ['src-core.js','src-store.js','src-access.js','src-uistate.js','src-kernel.js','src-runner.js','src-record.js','src-engine.js','src-counter.js','src-fact.js','src-report-data.js'];
const src = stub + DOMAIN.map(f => fs.readFileSync(f, 'utf8')).join('\n') + '\nreturn FF;';
const FF = new Function(src)();

const N_SEEDS = Number(process.argv[2] || 5000);
const HORIZON = 30; // 지금은 배포된 30일 게임 기준으로 먼저 본다(성장판 90일은 2단계)
const COVERS = FF.C.policy.map(p => p.v); // [1, 1.5, 2] - 커널이 인정하는 값만 쓴다

function avg(a) { return a.length ? a.reduce((x, y) => x + y, 0) / a.length : NaN; }
function dailyNetWorth() { return FF.ledger().cash + FF.sumAmt(FF.arOf()) - FF.sumAmt(FF.apOf()); }

function runSeed(seed, cover) {
  FF.reset(seed);
  const hist = [];
  for (let day = FF.run().day; day <= HORIZON; day++) {
    if (FF.isOver()) break;
    const cmd = (day === 1 && cover !== null) ? FF.Cmd.policy(cover) : FF.Cmd.wait();
    FF.stepDay(cmd);
    const d = FF.today();
    hist.push({ missed: d.missed, wT: d.wT });
  }
  return {
    hist, bust: FF.isBust(),
    nw: dailyNetWorth(),
    cumMissed: hist.reduce((s, d) => s + d.missed, 0),
    cumWaste: hist.reduce((s, d) => s + d.wT, 0),
  };
}

console.log(`정책 후보(R.policy) = ${JSON.stringify(FF.C.policy)}, 기본값(고정 UI 상태) = ${FF.C.cover}`);

const results = {};
for (const cover of COVERS) results[cover] = [];
let n = 0, bustAny = 0;
const winnerCount = {};
for (const c of COVERS) winnerCount[c] = 0;
const winMargin = []; // 1.5가 아닌 값이 이겼을 때, 그 값 - 1.5 결과의 차이(경제적 크기 확인용)
const tiltWinner = {}; // "supplyTilt,demandTilt" -> {cover: count}

for (let seed = 1; seed <= N_SEEDS; seed++) {
  FF.reset(seed);
  const tilt = FF.world().tilt();
  const runs = {};
  let ok = true;
  for (const cover of COVERS) {
    runs[cover] = runSeed(seed, cover);
    if (runs[cover].bust) ok = false;
  }
  if (!ok) { bustAny++; continue; }
  n++;
  for (const cover of COVERS) results[cover].push(runs[cover]);
  let bestCover = COVERS[0], bestNw = runs[COVERS[0]].nw;
  for (const cover of COVERS) if (runs[cover].nw > bestNw) { bestNw = runs[cover].nw; bestCover = cover; }
  winnerCount[bestCover]++;
  if (bestCover !== 1.5) winMargin.push(bestNw - runs[1.5].nw);
  const tk = tilt.supply + ',' + tilt.demand;
  if (!tiltWinner[tk]) tiltWinner[tk] = {};
  tiltWinner[tk][bestCover] = (tiltWinner[tk][bestCover] || 0) + 1;
}

console.log(`\n완주(3가지 전부 무파산) n=${n}/${N_SEEDS}, 파산으로 제외=${bustAny}`);
for (const cover of COVERS) {
  const r = results[cover];
  console.log(`  cover=${cover}: netWorth avg=${avg(r.map(x => x.nw)).toFixed(0)}  누적missed avg=${avg(r.map(x => x.cumMissed)).toFixed(1)}  누적waste(wT) avg=${avg(r.map(x => x.cumWaste)).toFixed(2)}`);
}
console.log(`\nseed별 최선 cover 분포(같은 seed 안에서 netWorth 최대인 값) = ${JSON.stringify(winnerCount)} (n=${n})`);
console.log(`1.5가 아닌 값이 이겼을 때 그 폭(승자-1.5) avg=${avg(winMargin).toFixed(0)} median=${[...winMargin].sort((a,b)=>a-b)[Math.floor(winMargin.length/2)].toFixed(0)}`);
console.log(`\ntilt(공급,수요)별 최선 cover 분포:`);
for (const tk of Object.keys(tiltWinner).sort()) {
  console.log(`  tilt=${tk}: ${JSON.stringify(tiltWinner[tk])}`);
}

// mid(1.5, 지금 실제 고정값)를 기준선으로 다른 두 값의 쌍차를 본다.
for (const cover of COVERS) {
  if (cover === 1.5) continue;
  const diffs = [];
  for (let i = 0; i < n; i++) diffs.push(results[cover][i].nw - results[1.5][i].nw);
  console.log(`\ncover=${cover} vs 현재 고정값(1.5) 쌍차: avg=${avg(diffs).toFixed(0)} 양수비율=${(100 * diffs.filter(v => v > 0).length / n).toFixed(1)}%`);
}
