// C안 합격 조건: 정책을 도중에 바꾸는 것이 고정보다 나은가
import fs from 'fs';
const DOMAIN=['src-core.js','src-store.js','src-access.js','src-uistate.js','src-kernel.js',
 'src-runner.js','src-record.js','src-engine.js','src-counter.js','src-report-data.js'];
const FF=new Function('var FF={},FV={};'+DOMAIN.map(f=>fs.readFileSync(f,'utf8')).join('\n')+'\nreturn FF;')();
const N=+(process.env.N||300);
const seeds=[];for(let i=1;i<=N;i++)seeds.push(i*13+5);
const CV=FF.C.policy.map(o=>o.v);
const pct=x=>(x*100).toFixed(0)+'%';
// 정책 계획을 명령 열로 실행한다
function run(seed,plan){           // plan: {day: cover}
  const W=FF.World(seed); const s=FF.initialState(W);
  for(let t=0;t<FF.C.days;t++){
    const c=plan[s.day];
    const cmd=(c!==undefined&&c!==s.cover)?FF.Cmd.policy(c):FF.Cmd.wait();
    FF.transition(s,cmd,W.next());
    if(s.cash<=0)break;
  }
  return FF.finalValue(s,true);
}
const fixed={}, fixBest=[], oneSwitch=[], twoSwitch=[];
for(const c of CV) fixed[c]=seeds.map(sd=>run(sd,{1:c}));
const SW=[5,8,11,14,17,20,23];
seeds.forEach((sd,i)=>{
  let bf=-Infinity; CV.forEach(c=>{if(fixed[c][i]>bf)bf=fixed[c][i]});
  fixBest.push(bf);
  // 한 번 바꾸기
  let b1=bf, at1=null, from1=null, to1=null;
  for(const a of CV)for(const b of CV){
    if(a===b)continue;
    for(const d of SW){
      const v=run(sd,{1:a,[d]:b});
      if(v>b1){b1=v;at1=d;from1=a;to1=b}
    }
  }
  oneSwitch.push({v:b1,at:at1,from:from1,to:to1});
  // 두 번 바꾸기 (거친 격자)
  let b2=b1;
  for(const a of CV)for(const b of CV)for(const c of CV){
    if(a===b&&b===c)continue;
    for(const d1 of [8,14])for(const d2 of [17,23]){
      const v=run(sd,{1:a,[d1]:b,[d2]:c});
      if(v>b2)b2=v;
    }
  }
  twoSwitch.push(b2);
});
const m=a=>Math.round(a.reduce((x,y)=>x+y,0)/a.length);
console.log(`시드 ${N} · 정책 ${CV.join('/')}\n`);
console.log('| 전략 | 평균 | 고정 최선 대비 |');
console.log('|---|---|---|');
console.log(`| 고정 최선 | ${m(fixBest)} | 0 |`);
console.log(`| 1회 변경 최선 | ${m(oneSwitch.map(x=>x.v))} | +${m(oneSwitch.map((x,i)=>x.v-fixBest[i]))} |`);
console.log(`| 2회 변경 최선 | ${m(twoSwitch)} | +${m(twoSwitch.map((v,i)=>v-fixBest[i]))} |`);
const improved=oneSwitch.filter((x,i)=>x.v>fixBest[i]+1).length;
console.log(`\n1회 변경이 고정보다 나은 판 ${pct(improved/N)}`);
const hist={},dir={};
oneSwitch.forEach(x=>{if(x.at){hist[x.at]=(hist[x.at]||0)+1;dir[x.from+'→'+x.to]=(dir[x.from+'→'+x.to]||0)+1}});
console.log('변경 시점: ' + Object.entries(hist).sort((a,b)=>a[0]-b[0]).map(([d,c])=>`${d}일 ${pct(c/improved)}`).join(' · '));
console.log('변경 방향: ' + Object.entries(dir).sort((a,b)=>b[1]-a[1]).slice(0,4).map(([k,c])=>`${k} ${pct(c/improved)}`).join(' · '));
