// 초과물량 노출량 X 스윕. 커널은 그대로 두고 규칙 주입으로만 잰다.
import fs from 'fs';
const DOMAIN=['src-core.js','src-store.js','src-access.js','src-uistate.js','src-kernel.js',
 'src-runner.js','src-record.js','src-engine.js','src-counter.js','src-report-data.js'];
const FF=new Function('var FF={},FV={};'+DOMAIN.map(f=>fs.readFileSync(f,'utf8')).join('\n')+'\nreturn FF;')();
const N=+(process.env.N||400);
const seeds=[];for(let i=1;i<=N;i++)seeds.push(i*13+5);
const clone=o=>JSON.parse(JSON.stringify(o));
const pct=x=>(x*100).toFixed(1)+'%';
const XS=[0,0.5,1.0,1.5];
const PRICE={0:0,0.5:875,1:1625,1.5:2250};
const price=x=>PRICE[x];
const at1=s=>(s.day===1&&s.buys.contract===0)?FF.Cmd.contract():FF.Cmd.wait();
const stock=s=>{var t=0;for(var i=0;i<s.lots.length;i++)t+=s.lots[i].q;return t};
const withSales=s=>{
  if(s.day===1&&s.buys.contract===0)return FF.Cmd.contract();
  if(!s.pend&&s.buys.sales===0&&stock(s)>=8)return FF.Cmd.buy('sales');
  return FF.Cmd.wait();
};
const R0=clone(FF.C);
const rulesFor=x=>{const R=clone(R0);R.contract={limit:x,price:price(x),max:1,until:1};return R};
const val=(sd,st,R)=>FF.finalValue(FF.runScenario(sd,st,null,R).state,true,R);
// 기준선은 X 와 무관
const base=seeds.map(sd=>val(sd,{},R0));
const V={}, W={}, INFO={};
for(const x of XS){
  const R=rulesFor(x);
  V[x]=seeds.map((sd,i)=>x===0?0:val(sd,at1,R)-base[i]);
  W[x]=seeds.map((sd,i)=>x===0?(val(sd,s=>(!s.pend&&s.buys.sales===0&&stock(s)>=8)?FF.Cmd.buy('sales'):FF.Cmd.wait(),R)-base[i])
                              :val(sd,withSales,R)-base[i]);
}
// 시작 국면
seeds.forEach((sd,i)=>{
  const s=FF.initialState(FF.World(sd),R0);
  INFO[i]={si:s.si,di:s.di};
});
const m=a=>Math.round(a.reduce((p,q)=>p+q,0)/a.length);
console.log(`시드 ${N} · 선형 가격 1,750/t\n`);
console.log('| X | 가격 | 평균 | 승률 | 판매 결합 평균 | 결합 승률 |');
console.log('|---|---|---|---|---|---|');
for(const x of XS)
  console.log(`| ${x}t | ${price(x)} | ${m(V[x])} | ${pct(V[x].filter(v=>v>0).length/N)} | ${m(W[x])} | ${pct(W[x].filter(v=>v>0).length/N)} |`);

// 최선 X 분포
const bestX={}; let tie=0;
seeds.forEach((sd,i)=>{
  let bv=-Infinity,bx=null;
  for(const x of XS){if(V[x][i]>bv){bv=V[x][i];bx=x}}
  bestX[bx]=(bestX[bx]||0)+1;
});
console.log('\n| 최선 X | 비율 |');console.log('|---|---|');
for(const x of XS)console.log(`| ${x}t | ${pct((bestX[x]||0)/N)} |`);

// 시작 국면별 최적 X
function cross(key,names,label){
  console.log(`\n## ${label}별 최적 X 분포`);
  console.log('| 국면 | 판수 | ' + XS.map(x=>x+'t').join(' | ') + ' |');
  console.log('|---|---|' + XS.map(()=>'---|').join(''));
  for(let g=0;g<3;g++){
    const idx=seeds.map((_,i)=>i).filter(i=>INFO[i][key]===g);
    if(idx.length<15){console.log(`| ${names[g]} | ${idx.length} | ${XS.map(()=>'-').join(' | ')} |`);continue}
    const c={};
    idx.forEach(i=>{let bv=-Infinity,bx=null;for(const x of XS)if(V[x][i]>bv){bv=V[x][i];bx=x}c[bx]=(c[bx]||0)+1});
    console.log(`| ${names[g]} | ${idx.length} | ${XS.map(x=>pct((c[x]||0)/idx.length)).join(' | ')} |`);
  }
}
cross('di',['침체','정상','호황'],'시작 수요');
cross('si',['부족','평년','풍작'],'시작 생산');

// 재고와 폐기
console.log('\n| X | 평균 재고 | 상위10% 재고 | 폐기 총량 |');
console.log('|---|---|---|---|');
for(const x of XS){
  const R=rulesFor(x);
  let st=0,hi=[],waste=0,cnt=0;
  for(const sd of seeds.slice(0,200)){
    const r=FF.runScenario(sd,x===0?{}:at1,null,R);
    let s2=0,w2=0;
    r.days.forEach(d=>{s2+=d.result.end;w2+=d.result.wS+d.result.wT});
    st+=s2/r.days.length; hi.push(s2/r.days.length); waste+=w2; cnt++;
  }
  hi.sort((a,b)=>a-b);
  console.log(`| ${x}t | ${(st/cnt).toFixed(1)}t | ${hi[Math.floor(hi.length*0.9)].toFixed(1)}t | ${(waste/cnt).toFixed(1)}t |`);
}
