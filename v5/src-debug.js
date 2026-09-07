window.ffStep=function(state,cmd,world){return FF.step(state,cmd,world)};
window.ffCompare=function(seeds,strategies){return FF.compareStrategies(seeds,strategies)};
window.ffHindRef=function(){return FF._hindsightRef()};
window.ffContribRef=function(){return FF._modContribRef()};
window.ffMissedRef=function(){return FF._missedOpsRef()};
window.ffFinish=function(){
 if(!FF.run().finDay)return{운영종료:false};
 var m=FF.missedOps().filter(function(x){return x.day>=FF.run().finDay});
 var pos=m.filter(function(x){return x.gain>0});
 pos.sort(function(a,b){return b.gain-a.gain});
 var edge=Math.round(FF.ledger().cash-FF.simulate(FF.run().seed,{},[]).base);
 var give=pos.length?pos[0].gain:0;
 return{운영종료일:FF.run().finDay,
  확보우위:edge,
  포기옵션:give,
  포기옵션_위치:pos.length?{일차:pos[0].day,설비:pos[0].kind==="intake"?"입고":"판매"}:null,
  이후_양의기회_수:pos.length,
  종료여유:give>0?+(edge/give).toFixed(2):null};
};

window.ffCheck=function(){
 var bad=[];
 for(var i=0;i<FF.histOf().length;i++){
  var r=FF.histOf()[i];
  var d1=Math.abs((r.prod-r.acc)-(r.wI+r.wS));
  var d2=Math.abs((r.dem-r.sold)-r.missed);
  if(d1>0.001)bad.push({day:r.day,식:"생산=입고+미입고",오차:+d1.toFixed(4)});
  if(d2>0.001)bad.push({day:r.day,식:"수요=판매+못판수요",오차:+d2.toFixed(4)});
 }
 return{검사일수:FF.histOf().length,위반:bad.length,목록:bad};
};

window.ffOption=function(k){var o=FF.optionOf(k);return o};
window.ffTrace=function(){return FF.histOf().map(function(r){
 return{day:r.day,daily:r.b,trend3:FF.trend3(r.day),drift:+(r.acc-r.sold).toFixed(2),
  sold:+r.sold.toFixed(1),missed:+r.missed.toFixed(1),profit:Math.round(r.profit)}})};
window.ffEvents=function(){
 var NAME={intake:"입고 한도",store:"창고 공간",ship:"판매 한도",stock:"판매할 재고"};
 var out=FF.logOf().evlog.map(function(e){
  var bought=FF.logOf().buylog.filter(function(b){return b.day>=e.day&&b.day<=e.day+2});
  return{day:e.day,제약:NAME[e.b]||e.b,
   사건후2일내구매:bought.map(function(b){return b.kind}).join(",")||"없음"};
 });
 var hit=out.filter(function(x){return x.사건후2일내구매!=="없음"}).length;
 return{사건수:out.length,구매로이어짐:hit,
  구매율:out.length?Math.round(hit/out.length*100)+"%":"-",목록:out};
};

window.ffCapSignal=function(){
 var e=FF.logOf().events,out={};
 ["intake","sales"].forEach(function(k){
  var key=k==="intake"?"atCapIntake":"atCapShipping";
  var hits=e.filter(function(x){return x[key]});
  var bought=hits.filter(function(x){return x.bought===k}).length;
  var boughtNoSignal=e.filter(function(x){return x.bought===k&&!x[key]}).length;
  out[k]={상한도달:hits.length,상한직후구매:bought,
   구매율:hits.length?Math.round(bought/hits.length*100):0,
   신호없이구매:boughtNoSignal};
 });
 return out;
};
window.ffModules=function(){
 var contrib=FF.modContrib()||[];
 return FF.logOf().mods.map(function(m,i){
  var u=m.use.length?m.use.reduce(function(a,b){return a+b},0)/m.use.length*100:0;
  var step=m.kind==="intake"?FF.C.step.intake:FF.C.step.sales;
  var ex=m.extra||0, days=m.use.length;
  return{설비:m.kind==="intake"?"입고":"판매",순번:m.idx,구매일:m.day,보유일:days,
   추가용량사용:+ex.toFixed(1),
   여력비율:days?Math.round(ex/(days*step)*100)+"%":"-",
   반사실기여:contrib[i]===undefined?null:contrib[i],
   legacy_이후평균가동:Math.round(u)+"%",
   legacy_구매후3일내상한재도달:m.hit};
 });
};
window.ffBuys=function(){return{sales:FF.plant().buys.sales,contract:FF.plant().buys.contract||0,spent:FF.ledger().spent}};
window.ffAgree=function(){var h=FF.histOf().filter(function(r){return r.day>=3});
 if(!h.length)return 0;return +(h.filter(function(r){return r.b===FF.trend3(r.day)}).length/h.length*100).toFixed(0)};
