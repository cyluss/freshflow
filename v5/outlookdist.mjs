// 개장 화면 전망 문구 조합의 빈도
import fs from 'fs';
const DOMAIN=['src-core.js','src-store.js','src-access.js','src-uistate.js','src-kernel.js',
 'src-runner.js','src-record.js','src-engine.js','src-counter.js','src-report-data.js'];
const FF=new Function('var FF={},FV={};'+DOMAIN.map(f=>fs.readFileSync(f,'utf8')).join('\n')+'\nreturn FF;')();
const N=+(process.env.N||10000);
const pct=x=>(x*100).toFixed(1)+'%';
const R=FF.C;
// 개장 시점의 세 구간 전망 판정
function verdicts(seed){
  const W=FF.World(seed), s=FF.initialState(W);
  const T=W.tilt();
  const spans=[[1,10],[11,20],[21,30]];
  const out={supply:[],demand:[]};
  for(const [a,b] of spans){
    for(const axis of ['supply','demand']){
      const idx=axis==='supply'?s.si:s.di;
      const tl=axis==='supply'?T.supply:T.demand;
      const acc=[0,0,0];
      for(let d=a;d<=b;d++){
        const v=FF.hor(idx,d,d,R,tl);
        for(let k=0;k<3;k++)acc[k]+=v[k];
      }
      const n=b-a+1;
      const p=FF.pct(FF.blur(acc.map(x=>x/n)));
      out[axis].push(FF.outlookVerdict(p));
    }
  }
  out.tilt=T;
  return out;
}
const cnt={supply:{},demand:{}}, combo={supply:{},demand:{}};
let allSame={supply:0,demand:0}, twoPlus={supply:0,demand:0};
for(let i=1;i<=N;i++){
  const v=verdicts(i*7+3);
  for(const axis of ['supply','demand']){
    v[axis].forEach(x=>cnt[axis][x]=(cnt[axis][x]||0)+1);
    const key=v[axis].join('-');
    combo[axis][key]=(combo[axis][key]||0)+1;
    const sim=v[axis].filter(x=>x==='similar').length;
    if(sim===3)allSame[axis]++;
    if(sim>=2)twoPlus[axis]++;
  }
}
for(const axis of ['supply','demand']){
  console.log(`\n## ${axis==='supply'?'생산':'수요'} 전망`);
  console.log('| 판정 | 비율 |');console.log('|---|---|');
  Object.entries(cnt[axis]).sort((a,b)=>b[1]-a[1])
    .forEach(([k,c])=>console.log(`| ${k} | ${pct(c/(N*3))} |`));
  console.log(`\n세 구간 모두 similar ${pct(allSame[axis]/N)} · 둘 이상 similar ${pct(twoPlus[axis]/N)}`);
  const top=Object.entries(combo[axis]).sort((a,b)=>b[1]-a[1]).slice(0,5);
  console.log('상위 조합: ' + top.map(([k,c])=>`${k} ${pct(c/N)}`).join(' · '));
}
