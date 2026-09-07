// 로스 구성 분해. 어디서 얼마나 새는가.
import fs from 'fs';
const DOMAIN=['src-core.js','src-store.js','src-access.js','src-uistate.js','src-kernel.js',
 'src-runner.js','src-record.js','src-engine.js','src-counter.js','src-report-data.js'];
const FF=new Function('var FF={},FV={};'+DOMAIN.map(f=>fs.readFileSync(f,'utf8')).join('\n')+'\nreturn FF;')();
const N=+(process.env.N||800);
const seeds=[];for(let i=1;i<=N;i++)seeds.push(i*13+5);
const R=FF.C, pct=x=>(x*100).toFixed(1)+'%';
let prod=0, acc=0, sold=0;
let wIcap=0, wIstore=0, wIneed=0, wS=0, wT=0, end=0;
let cnt=0;
for(const sd of seeds){
  const r=FF.runScenario(sd,{});
  r.days.forEach(d=>{const x=d.result;
    prod+=x.prod; acc+=x.acc; sold+=x.sold;
    wIcap+=x.wIcap; wIstore+=x.wIstore; wIneed+=x.wIneed; wS+=x.wS; wT+=x.wT;
  });
  end+=r.days[r.days.length-1].result.end;
  cnt++;
}
const p=x=>(x/cnt).toFixed(1);
console.log(`시드 ${N} · 무투자 · 판당 평균 (30일)\n`);
console.log('| 항목 | 물량 | 생산 대비 | 성격 |');
console.log('|---|---|---|---|');
console.log(`| 농가 생산 | ${p(prod)}t | 100% | |`);
console.log(`| 실제 매입 | ${p(acc)}t | ${pct(acc/prod)} | |`);
console.log(`| 판매 | ${p(sold)}t | ${pct(sold/prod)} | 매출이 된 것 |`);
console.log(`| 종료 잔여재고 | ${p(end)}t | ${pct(end/prod)} | 처분가치 없음 |`);
console.log('');
console.log('| 미입고 원인 | 물량 | 생산 대비 |');
console.log('|---|---|---|');
console.log(`| 입고 한도 | ${p(wIcap)}t | ${pct(wIcap/prod)} |`);
console.log(`| 창고 부족 | ${p(wIstore)}t | ${pct(wIstore/prod)} |`);
console.log(`| 목표재고상 불필요 | ${p(wIneed)}t | ${pct(wIneed/prod)} |`);
console.log('');
console.log('| 매입 후 손실 | 물량 | 생산 대비 | 비용 |');
console.log('|---|---|---|---|');
console.log(`| 창고 초과로 즉시 폐기 | ${p(wS)}t | ${pct(wS/prod)} | ${Math.round(wS/cnt*R.waste)}원 |`);
console.log(`| 상해서 폐기 | ${p(wT)}t | ${pct(wT/prod)} | ${Math.round(wT/cnt*R.waste)}원 |`);
console.log(`| 종료 잔여 | ${p(end)}t | ${pct(end/prod)} | 매입비 ${Math.round(end/cnt*R.farm)}원 매몰 |`);
