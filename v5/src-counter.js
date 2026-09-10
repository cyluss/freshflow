

/* ---- Preact 렌더 브리지 ---- */

// 다중 재생: 계획 N개를 하루씩 동시에 전진시킨다.
// 접두를 공유하지 않는 계획들에 쓴다. 난수는 하루 한 번만 뽑는다.


// 시나리오 시뮬레이터. 반사실 계산의 유일한 경로다.
//   base      기준 계획 {일차: 설비}
//   variants  [{at, plan}]  at 일차의 기준선 상태에서 갈라져 plan 을 덮어쓴다.
//             at 이 1 이면 처음부터 자기 계획으로 간다.
//             plan 값이 null 이면 그날 사지 않는다.
//   untilDay  지정하면 그날까지만 돌리고 처분가치를 더하지 않는다.
// 난수는 계획과 무관하므로 하루에 한 번만 뽑아 모든 시나리오가 공유한다.
FF.simulate=function(seed,base,variants,untilDay){
 var r=FF.runTracks(seed,base,variants,untilDay);
 var fin=!untilDay;
 var value=function(s){return s?FF.finalValue(s,fin&&!s.dead):undefined};
 return {base:value(r.state),variants:r.forks.map(value)};
}

// 사후 기준 계획. 첫날 계약 크기와 판매 증설 횟수의 조합이다.
FF.planOf=function(x,ns){
 var pl={},dd=2,k;
 if(x>0)pl[1]="contract:"+x;
 for(k=0;k<ns;k++){pl[dd]="sales";dd+=2}
 return pl;
}

// 이번 판에서 실제로 한 것. 계약은 크기까지 남긴다.
// 이번 판에 맺은 계약 크기. 없으면 0 이다.
FF.myContractSize=function(){
 var m=FF.logOf().mods;
 for(var i=0;i<m.length;i++)if(m[i].kind==="contract")return m[i].size||0;
 return 0;
}

FF.currentPlan=function(){
 var p={},m=FF.logOf().mods;
 for(var i=0;i<m.length;i++){
  p[m[i].day]=(m[i].kind==="contract")?("contract:"+(m[i].size||0)):m[i].kind;
 }
 return p;
}

// 반사실 정의. 분석은 이 셋만 만들고 나머지는 시뮬레이터가 한다.
FF.Scenario={
 addOne:function(day,kind){var p={};p[day]=kind;return {at:day,plan:p}},
 removeOne:function(day){var p={};p[day]=null;return {at:day,plan:p}},
 fullPlan:function(plan){return {at:1,plan:plan}}
};

FF.compareStrategies=function(seeds,strategies){
 return strategies.map(function(st){
  var vals=seeds.map(function(sd){
   return FF.finalValue(FF.runScenario(sd,st.plan).state,true);
  });
  var sum=0,min=Infinity,max=-Infinity;
  vals.forEach(function(v){sum+=v;if(v<min)min=v;if(v>max)max=v});
  return {name:st.name,mean:Math.round(sum/vals.length),
    min:Math.round(min),max:Math.round(max),values:vals};
 });
}

// 전망. 근일 관측 window를 3등분한 구간별 국면 분포다.
// 오늘 국면에서 마르코프 전이를 돌려 구간 평균을 낸다.


// 사후 최선. 계약 크기 네 가지와 판매 증설 횟수의 조합을 전부 돌린다.
FF._hindsight=function(){
 var XS=FF.C.contract.options.map(function(o){return o.x});
 var plans=[],meta=[],i,s2;
 for(i=0;i<XS.length;i++)for(s2=0;s2<=5;s2++){
  plans.push(FF.planOf(XS[i],s2)); meta.push({i:XS[i],s:s2});
 }
 var mi=FF.myContractSize(), ms=FF.plant().buys.sales;
 plans.push(FF.planOf(mi,ms));
 var r=FF.simulate(FF.run().seed,{},plans.map(FF.Scenario.fullPlan)).variants;
 var base=0,best={i:0,s:0,v:-Infinity};
 for(i=0;i<meta.length;i++){
  if(meta[i].i===0&&meta[i].s===0)base=r[i];
  if(r[i]>best.v)best={i:meta[i].i,s:meta[i].s,v:r[i]};
 }
 return{base:base,best:best,mine:r[r.length-1]};
}


// 배치 재생: 시나리오 N개를 하루씩 동시에 전진시킨다.
// 난수는 계획과 무관하므로 하루에 한 번만 뽑아 전부가 공유한다.


// 분기 재생: 기준선을 한 번 전진하면서 각 날에서 갈라진다.
// 앞부분을 다시 돌지 않는다. 난수는 계획과 무관하므로 하루 한 번만 뽑는다.


// 지금까지의 계획. 분석의 기준선이다.
FF._missedOps=function(){
 var base=FF.currentPlan(), forks=[], vs=[], i;
 for(var day=2;day<=FF.C.days-2;day++){
  if(base[day])continue;
  ["sales"].forEach(function(k){
   forks.push({day:day,kind:k});
   vs.push(FF.Scenario.addOne(day,k));
  });
 }
 var r=FF.simulate(FF.run().seed,base,vs);
 var out=[];
 for(i=0;i<forks.length;i++)out.push({day:forks[i].day,kind:forks[i].kind,gain:Math.round(r.variants[i]-r.base)});
 out.sort(function(a,b){return b.gain-a.gain});
 return out;
}


FF._modContrib=function(){
 var mods=FF.logOf().mods;
 if(!mods.length)return null;
 var base=FF.currentPlan();
 var vs=mods.map(function(m){return FF.Scenario.removeOne(m.day)});
 var r=FF.simulate(FF.run().seed,base,vs);
 return r.variants.map(function(v){return Math.round(r.base-v)});
}

FF._recoverPct=function(kind){
 var mods=FF.logOf().mods, last=null;
 for(var i=0;i<mods.length;i++)if(mods[i].kind===kind)last=mods[i];
 if(!last||FF.isOver()||FF.run().day<=last.day+1)return null;
 var upto=FF.run().day-1;
 var r=FF.simulate(FF.run().seed,FF.currentPlan(),[FF.Scenario.removeOne(last.day)],upto);
 var gain=r.base-r.variants[0];
 var days=upto-last.day;
 var opt=(kind==="contract")?FF.contractOption(last.size||0):null;
 var cost=(kind==="contract")?(opt?opt.price:0)
  :(FF.C.cost[kind]+days*FF.C.step[kind]*(FF.C.maint[kind]||0));
 var val=Math.round(gain);
 var key=kind+":"+last.day, prev=FF.recoverPrev(key);
 FF.noteRecover(key,val);
 return{val:val,cost:cost,prev:prev};
}

FF.buyOffset=function(k){
 var o=FF.ord(k);
 if(o>0)return o-1;
 return FF.queueOf().length;
}

FF._breakEven=function(k){
 var off=FF.buyOffset(k);
 var days=Math.max(0,FF.C.days-FF.run().day-off);
 if(days<=0)return null;
 var step=FF.C.step[k];
 var maint=(FF.C.maint[k]||0)*step*days;
 var net=FF.C.cost[k]*(1-FF.C.salvage)+maint;
 var margin=FF.C.price;
 return{t:net/margin,cost:Math.round(net)};
}

FF._optionOf=function(k){
 if(k==="contract"){
  // 계약은 용량이 아니라 사건 노출을 산다. 최근 못 판 수요가 신호다.
  var H=FF.histOf().slice(-3), m=0, d=0;
  for(var i=0;i<H.length;i++){m+=H[i].missed;d+=H[i].dem}
  var owned=(FF.plant().buys.contract||0)>0;
  var M=FF.marketOf();
  var opts=FF.C.contract.options;
  var big=opts[opts.length-1];
  return {kind:k,cost:big.price,limit:big.x,options:opts,
   supply:M?M.si:1, demand:M?M.di:1,
   missRate:d>0?m/d:0,window:H.length,stock:FF.inventory(),owned:owned,
   usable:Math.max(0,FF.C.days-FF.run().day),
   affordable:!owned&&FF.ledger().cash>=opts[1].price,
   payback:null,hits:0,lastHit:false,overRun:false};
 }
 var h=FF.capHits(k,5), off=FF.buyOffset(k);
 var usable=Math.max(0,FF.C.days-FF.run().day-off);
 var be=FF.breakEven(k);
 var payback=be?(be.t/FF.C.step[k]):null;
 return{kind:k,cost:FF.C.cost[k],hits:h.n,window:h.len,lastHit:!!h.last,
  usable:usable,payback:payback,
  affordable:FF.ledger().cash>=FF.C.cost[k],
  overRun:(payback!==null&&payback>usable)};
}


FF.hindsight=FF.memo(FF._hindsight);
FF.missedOps=FF.memo(FF._missedOps);
FF.modContrib=FF.memo(FF._modContrib);
FF.recoverPct=FF.memoBy(FF._recoverPct);
FF.breakEven=FF.memoBy(FF._breakEven);
FF.optionOf=FF.memoBy(FF._optionOf);

// 기회 분석 표: 날짜 x 설비 2차원.
// 각 칸은 그날 그 설비를 하나 더 샀을 때의 가치와 전날 대비 차분을 담는다.
// flat 은 차분이 유지비와 같다는 뜻이다.

FF._hindsightRef=function(){
 var XS=FF.C.contract.options.map(function(o){return o.x});
 var base=FF.replay(FF.run().seed,0,0),best={i:0,s:0,v:base};
 for(var k=0;k<XS.length;k++)for(var s2=0;s2<=5;s2++){
  var v=FF.replay(FF.run().seed,XS[k],s2);
  if(v>best.v)best={i:XS[k],s:s2,v:v};
 }
 return{base:base,best:best,
   mine:FF.replay(FF.run().seed,FF.myContractSize(),FF.plant().buys.sales)};
}

// 사후 기준 계획. 계약 여부와 판매 증설 횟수의 조합이다.
FF._missedOpsRef=function(){
 var full={};
 for(var i=0;i<FF.logOf().mods.length;i++)full[FF.logOf().mods[i].day]=FF.logOf().mods[i].kind;
 var base=FF.replayPlan(FF.run().seed,full);
 var out=[];
 for(var day=2;day<=FF.C.days-2;day++){
  if(full[day])continue;
  var kinds=["sales"];
  for(var k=0;k<kinds.length;k++){
   var p={};for(var dd in full)p[dd]=full[dd];
   p[day]=kinds[k];
   out.push({day:day,kind:kinds[k],gain:Math.round(FF.replayPlan(FF.run().seed,p)-base)});
  }
 }
 out.sort(function(a,b){return b.gain-a.gain});
 return out;
}

FF._modContribRef=function(){
 if(!FF.logOf().mods.length)return null;
 var full={};
 for(var i=0;i<FF.logOf().mods.length;i++)full[FF.logOf().mods[i].day]=FF.logOf().mods[i].kind;
 var baseCash=FF.replayPlan(FF.run().seed,full);
 var out=[];
 for(var j=0;j<FF.logOf().mods.length;j++){
  var p={};
  for(var d in full)if(+d!==FF.logOf().mods[j].day)p[d]=full[d];
  out.push(Math.round(baseCash-FF.replayPlan(FF.run().seed,p)));
 }
 return out;
}

