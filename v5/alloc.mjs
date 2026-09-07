// 정식 커널에서 동적 배분 정책 비교
import fs from 'fs';
const DOMAIN=['src-core.js','src-store.js','src-access.js','src-uistate.js','src-kernel.js',
 'src-runner.js','src-record.js','src-engine.js','src-counter.js','src-report-data.js'];
const FF=new Function('var FF={},FV={};'+DOMAIN.map(f=>fs.readFileSync(f,'utf8')).join('\n')+'\nreturn FF;')();
const N=+(process.env.N||300);
const seeds=[];for(let i=1;i<=N;i++)seeds.push(i*13+5);
const pct=x=>(x*100).toFixed(0)+'%';
const CH=FF.C.channels, RL=FF.C.rel;
const stock=s=>{let t=0;for(const l of s.lots)t+=l.q;return t};
const oldShare=s=>{let o=0,t=0;for(const l of s.lots){t+=l.q;if(l.a>=2)o+=l.q}return t?o/t:0};
// 정책은 상태를 보고 배분을 돌려준다. null 이면 자동(최고가 우선)
const P={
 '자동': s=>null,
 '균등': s=>[1,1,1],
 '관계 유지': s=>{
   // 관계가 낮은 판로에 쿼터만큼 우선 배정한다
   const r=s.rel||[1,1,1], w=[0,0,0];
   CH.forEach((c,i)=>{ w[i]=c.quota*(r[i]<=1?1.4:0.8) });
   return w;
 },
 '신선도 배분': s=>{
   // 오래된 재고가 많으면 도매 비중을 올린다
   const o=oldShare(s);
   return o>0.4?[1,1,4]:[3,2,2];
 },
 '관계+신선도': s=>{
   const r=s.rel||[1,1,1], o=oldShare(s), w=[0,0,0];
   CH.forEach((c,i)=>{ w[i]=c.quota*(r[i]<=1?1.4:0.8) });
   if(o>0.4)w[2]*=2;
   return w;
 },
 '프랜차이즈 보험': s=>{
   // 관계 3 을 유지해 최소 보장을 확보한다
   const r=s.rel||[1,1,1];
   return [2,(r[1]<3?3:1.5),2];
 }
};
const V={},REL={};
for(const [n,f] of Object.entries(P)){
  V[n]=[];REL[n]=[];
  for(const sd of seeds){
    FF.reset(sd);
    for(let i=0;i<FF.C.days;i++){
      const s=FF.toKernelState();
      const a=f(s);
      FF.stepDay(a?FF.Cmd.sell(a):FF.Cmd.wait());
      if(FF.isOver())break;
    }
    V[n].push(FF.finalValue(FF.toKernelState(),true));
    REL[n].push(FF.relOf().join(''));
  }
}
const m=a=>Math.round(a.reduce((x,y)=>x+y,0)/a.length);
const names=Object.keys(P), best={};
seeds.forEach((sd,i)=>{let bv=-Infinity,bn=null;
  names.forEach(n=>{if(V[n][i]>bv){bv=V[n][i];bn=n}});best[bn]=(best[bn]||0)+1});
console.log(`시드 ${N} · 정식 커널 · 동적 배분\n`);
console.log('| 정책 | 평균 | 최선인 판 | 최다 관계 조합 |');
console.log('|---|---|---|---|');
names.forEach(n=>{
  const c={}; REL[n].forEach(k=>c[k]=(c[k]||0)+1);
  const top=Object.entries(c).sort((a,b)=>b[1]-a[1])[0];
  console.log(`| ${n} | ${m(V[n]).toLocaleString('ko-KR')} | ${pct((best[n]||0)/N)} | ${top[0]} ${pct(top[1]/N)} |`);
});
