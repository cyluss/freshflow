// 유지비 부과 방식 비교. 커널을 건드리지 않고 규칙만 바꿔 등가 실험한다.
// A 현행: 전체 용량 x 유지비
// B 증분만: 초기 용량분을 고정비로 옮기고 유지비는 증분에만 (수학적으로 동일한 변환)
//   → 결과값은 평행이동뿐이므로 전략 비교에는 영향이 없다. 그래서 실제로는
//     C 유지비를 낮추고 처분가치를 높이는 조합을 본다.
import fs from 'fs';
const DOMAIN=['src-core.js','src-store.js','src-access.js','src-uistate.js','src-kernel.js',
 'src-runner.js','src-record.js','src-engine.js','src-counter.js','src-report-data.js'];
const FF=new Function('var FF={},FV={};'+DOMAIN.map(f=>fs.readFileSync(f,'utf8')).join('\n')+'\nreturn FF;')();
const N=+(process.env.N||600);
const seeds=[]; for(let i=1;i<=N;i++) seeds.push(i*13+5);
const clone=o=>JSON.parse(JSON.stringify(o));
const val=(sd,p,R)=>FF.finalValue(FF.runScenario(sd,p,null,R).state,true,R);
const pct=x=>(x*100).toFixed(0)+'%';

function curve(R,kind){
  const base=seeds.map(sd=>val(sd,{},R));
  const days=[2,5,8,11,14,17,20];
  return days.map(d=>{
    let s=0,w=0;
    seeds.forEach((sd,i)=>{const v=val(sd,{[d]:kind},R);s+=v-base[i];if(v>base[i])w++});
    return {d,mean:Math.round(s/N),win:w/N};
  });
}
function timingValue(R,kind){
  const base=seeds.map(sd=>val(sd,{},R));
  let fixed=0,perfect=0;
  seeds.forEach((sd,i)=>{
    fixed+=val(sd,{2:kind},R)-base[i];
    let best=-Infinity;
    for(let d=2;d<=20;d++){const v=val(sd,{[d]:kind},R);if(v>best)best=v}
    perfect+=best-base[i];
  });
  return {fixed:Math.round(fixed/N),perfect:Math.round(perfect/N),gain:Math.round((perfect-fixed)/N)};
}
function show(R,label){
  console.log(`\n## ${label}`);
  for(const kind of ['intake','sales']){
    const c=curve(R,kind);
    const t=timingValue(R,kind);
    console.log(`${kind==='intake'?'집하':'판매'} ` + c.map(x=>`${x.d}일 ${x.mean}`).join(' · '));
    console.log(`   고정2일 ${t.fixed} · 완벽 ${t.perfect} · 타이밍 가치 ${t.gain}`);
  }
}
const A=clone(FF.C); show(A,'현행');
const B=clone(FF.C); B.salvage=0.6; show(B,'처분가치 20%→60%');
const C=clone(FF.C); C.maint={intake:13,storage:8,sales:17}; C.cost={intake:1500,sales:412};
show(C,'유지비 절반 + 가격 원복');
const D=clone(FF.C); D.salvage=0.6; D.maint={intake:34,storage:8,sales:43};
show(D,'처분 60% + 유지비 1.3배 더');
