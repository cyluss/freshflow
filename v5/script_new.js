

(function(){
var C={days:30,cash:60000,sm:[14,20,27],sd:2,dm:[10,20,32],dd:2,stay:0.8,
cap:{i:20,st:30,sh:21},ui:{nearCap:.8,storeMid:.5,storeFull:.8,dwellFast:1,dwellSlow:2.5,lowDays:2,armMs:6000,newArmMs:4000,recentWin:5,fcDays:3,eps:.05,matrixDays:7,dwellWin:7,logRows:6},step:{intake:2,shipping:1},cost:{intake:1500,shipping:412},
maint:{i:20,st:8,sh:25},ttl:5,q:[1,1,1,1,.8],
price:900,farm:380,hold:22,waste:45,fixed:1400,cover:2,alpha:.5,mid:4,noise:.35,autoMax:3,salvage:0.2};
var KEY={intake:"i",shipping:"sh"};

function Rng(s){this.s=s>>>0||1}
Rng.prototype.next=function(){this.s=(this.s+0x6d2b79f5)>>>0;var t=this.s;t=Math.imul(t^(t>>>15),t|1);t^=t+Math.imul(t^(t>>>7),t|61);return((t^(t>>>14))>>>0)/4294967296};
Rng.prototype.norm=function(m,sd){var u=Math.max(this.next(),1e-12),v=this.next();return m+sd*Math.sqrt(-2*Math.log(u))*Math.cos(2*Math.PI*v)};

function M(){var m=(1-C.stay)/2;return[[C.stay,1-C.stay,0],[m,C.stay,m],[0,1-C.stay,C.stay]]}
function hor(idx,a,b){var T=M(),v=[0,0,0];v[idx]=1;var acc=[0,0,0];
for(var d=1;d<=b;d++){var o=[0,0,0];for(var i=0;i<3;i++)for(var j=0;j<3;j++)o[j]+=v[i]*T[i][j];v=o;
if(d>=a)for(var k=0;k<3;k++)acc[k]+=v[k]}var n=b-a+1;return[acc[0]/n,acc[1]/n,acc[2]/n]}
function blur(v){var o=v.map(function(x){return x*(1-C.noise)+C.noise/3});var s=o[0]+o[1]+o[2];return o.map(function(x){return x/s})}
function pct(v){var a=v.map(function(x){return Math.round(x*100)});a[1]+=100-(a[0]+a[1]+a[2]);return a}
function expD(idx,a,b){var v=hor(idx,a,b);return v[0]*C.dm[0]+v[1]*C.dm[1]+v[2]*C.dm[2]}


var G,pick;
function inv(){var s=0;for(var i=0;i<G.lots.length;i++)s+=G.lots[i].q;return s}
function move(x){var r=G.rng.next();if(r<C.stay)return x;if(x!==1)return 1;return r<C.stay+(1-C.stay)/2?0:2}

function reset(seed){if(typeof SIG!=="undefined"){SIG.fin.value=false;SIG.manual.value=false}if(typeof EVENT!=="undefined"){EVENT.value=null;PENDING.value=null;AUTORUN.value=null;PHASE.value="play"}PREVPCT={};PENDPCT={};G={rng:new Rng(seed),seed:seed,si:1,di:1,day:1,cash:C.cash,lots:[],
cap:{i:C.cap.i,st:C.cap.st,sh:C.cap.sh},pend:null,hist:[],over:false,
buys:{intake:0,shipping:0},spent:0,mods:[],events:[],lastBuyI:0,lastBuyS:0,salvaged:0,bust:false,finDay:0,timeline:[],prevB:"none",evlog:[],autoFrom:1,autoCash:0,event:null,buylog:[],phase:{intake:{dir:0,n:0},shipping:{dir:0,n:0}}};
G.si=move(G.si);G.di=move(G.di);pick="none";setQueue([]);render()}

function stepDay(act,path){
 if(G.over)return;
 if(G.pend){G.cap[KEY[G.pend]]+=C.step[G.pend];setPending(null)}
 var ic=0;
 var prev=G.hist[G.hist.length-1]||null;
 var atCapI=prev?prev.acc>=G.cap.i-0.05:false;
 var atCapS=prev?prev.sold>=G.cap.sh-0.05:false;
 if(act!=="none"&&G.cash>=C.cost[act]){ic=C.cost[act];G.cash-=ic;setPending(act);G.buys[act]++;G.spent+=ic;
  G.mods.push({kind:act,day:G.day,idx:G.buys[act],from:act==="intake"?G.cap.i:G.cap.sh,use:[],hit:0});
  var svB=pct(blur(hor(G.si,4,7))),dvB=pct(blur(hor(G.di,4,7)));
  var hB=capHits(act,5),uB=useRate(3);
  var gB=act==="intake"?svB[2]-svB[0]:dvB[2]-dvB[0];
  if(dirOf(gB)!==0&&G.phase[act].dir===dirOf(gB))G.phase[act].n++;
  else {G.phase[act].dir=dirOf(gB);G.phase[act].n=dirOf(gB)===0?0:1}
  if(act==="intake")G.lastBuyI=G.day;else G.lastBuyS=G.day;
  G.buylog.push({day:G.day,kind:act==="intake"?"집하":"출하",
   gap:(act==="intake"?svB[2]-svB[0]:dvB[2]-dvB[0]),
   hit:hB.len<3?("관측 "+hB.len+"일"):(hB.n+"/"+hB.len),
   left:C.days-G.day,
   ui:"행분리",
   path:path||"직접",
   util:Math.round(act==="intake"?uB.i:uB.sh),
   nth:G.buys[act],cap:act==="intake"?G.cap.i:G.cap.sh})}
 G.events.push({day:G.day,atCapIntake:atCapI,atCapShipping:atCapS,bought:act});
 var prod=Math.max(0,G.rng.norm(C.sm[G.si],C.sd));
 var dem=Math.max(0,G.rng.norm(C.dm[G.di],C.dd));
 var on=Math.min(G.cap.sh,expD(G.di,1,3)),om=Math.min(G.cap.sh,expD(G.di,4,7));
 var need=Math.max(0,C.cover*on+C.alpha*Math.max(0,om-on)*C.mid-inv());
 var acc=Math.min(prod,G.cap.i,need);
 var refused=Math.min(prod,G.cap.i)-acc,wI=prod-acc;
 var freeNow=Math.max(0,G.cap.st-inv());
 var byCap=Math.max(0,prod-G.cap.i);
 var rest=wI-byCap;
 var byStore=Math.min(rest,Math.max(0,Math.min(prod,G.cap.i)-freeNow));
 var byNeed=Math.max(0,rest-byStore);
 var free=freeNow;
 var stored=Math.min(acc,free),wS=acc-stored;
 if(stored>0)G.lots.push({q:stored,a:0});
 var sellable=inv(),rem=Math.min(dem,G.cap.sh,sellable),tgt=rem,rev=0;
 G.lots.sort(function(a,b){return b.a-a.a});
 var ageMix=[];
 for(var i=0;i<G.lots.length&&rem>1e-9;i++){var take=Math.min(G.lots[i].q,rem);G.lots[i].q-=take;rem-=take;
  ageMix.push({a:G.lots[i].a,q:take});
  rev+=take*C.price*C.q[Math.min(G.lots[i].a,C.ttl-1)]}
 var sold=tgt-rem;
 G.lots=G.lots.filter(function(l){return l.q>1e-9});
 var wT=0;
 G.lots=G.lots.filter(function(l){l.a++;if(l.a>=C.ttl){wT+=l.q;return false}return true});
 var end=inv();
 var cost=end*C.hold+G.cap.i*C.maint.i+G.cap.st*C.maint.st+G.cap.sh*C.maint.sh+(wI+wS+wT)*C.waste+C.fixed+stored*C.farm;
 var profit=rev-cost;G.cash+=profit;
 var lossOut=Math.max(0,dem-sold);
 var cand=[
  ["ship",  (sold>=G.cap.sh-0.05&&dem>sold+0.05)?lossOut:0],
  ["stock", (sold<dem-0.05&&sellable<=sold+0.05)?lossOut:0],
  ["demand",(sold<G.cap.sh-0.05&&sellable>sold+0.05)?Math.max(0,G.cap.sh-dem):0],
  ["intake",byCap],
  ["store", byStore+wS+wT],
  ["supply",(byNeed<=0.05&&byCap<=0.05&&byStore<=0.05&&prod<G.cap.i-0.05)?(G.cap.i-prod):0],
  ["policy",byNeed]
 ];
 var b="none",bv=0.05;
 for(var ci=0;ci<cand.length;ci++)if(cand[ci][1]>bv){bv=cand[ci][1];b=cand[ci][0]}
 G.hist.push({day:G.day,prod:prod,dem:dem,acc:stored,refused:refused,sold:sold,
  missed:Math.max(0,dem-sold),ageMix:ageMix,wI:wI,wIcap:byCap,wIstore:byStore,wIneed:byNeed,wS:wS,wT:wT,end:end,profit:profit-ic,b:b,si:G.si,di:G.di,capI:G.cap.i,capS:G.cap.sh});
 var last3=G.hist.slice(-3),cnt={},best="none",bn=0;
 for(var z=0;z<last3.length;z++){var k=last3[z].b;cnt[k]=(cnt[k]||0)+1;if(cnt[k]>bn){bn=cnt[k];best=k}}
 G.hist[G.hist.length-1].b3=best;
 for(var mi=0;mi<G.mods.length;mi++){
  var md=G.mods[mi];
  if(G.day>md.day){
   md.use.push(md.kind==="intake"?stored/G.cap.i:sold/G.cap.sh);
   md.extra=(md.extra||0)+(md.kind==="intake"?Math.max(0,stored-md.from):Math.max(0,sold-md.from));
   if(G.day<=md.day+3){
    if(md.kind==="intake"&&stored>=G.cap.i-0.05)md.hit++;
    if(md.kind==="shipping"&&sold>=G.cap.sh-0.05)md.hit++;
   }
  }
 }
 var actionable=(b==="intake"||b==="ship"||b==="store"||b==="stock");
 var changed=(b!==G.prevB);
 G.prevB=b;
 setEvent((actionable&&changed)?{b:b}:null);
 if(G.event)G.evlog.push({day:G.day,b:b});
 G.day++;
 G.si=move(G.si);G.di=move(G.di);
 if(G.cash<=0){setPhase("bust")}
 else if(G.day>C.days){
  if(!G.over){G.salvaged=Math.round(G.spent*C.salvage);G.cash+=G.salvaged}
  setPhase("done");
 }
}

function capHits(kind,win){
 var lastBlocked=false;
 var since=kind==="intake"?G.lastBuyI:G.lastBuyS;
 var h=[];
 for(var i=0;i<G.hist.length;i++)if(G.hist[i].day>since)h.push(G.hist[i]);
 h=h.slice(-win);
 var n=0;
 for(var j=0;j<h.length;j++){
  if(kind==="intake"&&h[j].acc>=h[j].capI-0.05)n++;
  if(kind==="shipping"&&h[j].sold>=h[j].capS-0.05&&h[j].dem>h[j].sold+0.05)n++;
 }
 if(h.length){
  var z=h[h.length-1];
  lastBlocked=kind==="intake"?(z.acc>=z.capI-0.05):(z.sold>=z.capS-0.05&&z.dem>z.sold+0.05);
 }
 return{n:n,len:h.length,last:lastBlocked};
}


function dirOf(g){return g>=10?1:g<=-10?-1:0}

function phaseSync(gapI,gapS){
 var pairs=[["intake",gapI],["shipping",gapS]];
 for(var i=0;i<pairs.length;i++){
  var k=pairs[i][0],d=dirOf(pairs[i][1]),ph=G.phase[k];
  if(d!==ph.dir){ph.dir=d;ph.n=0}
 }
}

function useRate(n){
 var h=G.hist.slice(-n);
 if(!h.length)return{i:0,sh:0};
 var a=0,b=0;
 for(var i=0;i<h.length;i++){a+=h[i].acc/G.cap.i;b+=h[i].sold/G.cap.sh}
 return{i:a/h.length*100,sh:b/h.length*100};
}

function replay(seed,ni,ns){
 var pl={},dd=2,kk;
 for(kk=0;kk<ns;kk++){pl[dd]="shipping";dd+=2}
 for(kk=0;kk<ni;kk++){pl[dd]="intake";dd+=2}
 return replayPlan(seed,pl);
}

function replayPlan(seed,plan,untilDay){
 var R={rng:new Rng(seed),si:1,di:1,day:1,cash:C.cash,lots:[],
  cap:{i:C.cap.i,st:C.cap.st,sh:C.cap.sh},pend:null};
 R.si=mv(R,R.si);R.di=mv(R,R.di);
 var spent=0;
 function tot(){var t=0;for(var i=0;i<R.lots.length;i++)t+=R.lots[i].q;return t}
 var LIM=untilDay||C.days;
 for(var t2=0;t2<LIM;t2++){
  if(R.pend){R.cap[KEY[R.pend]]+=C.step[R.pend];R.pend=null}
  var act=plan[R.day];
  if(act&&R.cash>=C.cost[act]){R.cash-=C.cost[act];spent+=C.cost[act];R.pend=act}
  var prod=Math.max(0,R.rng.norm(C.sm[R.si],C.sd));
  var dem=Math.max(0,R.rng.norm(C.dm[R.di],C.dd));
  var on=Math.min(R.cap.sh,expD(R.di,1,3)),om=Math.min(R.cap.sh,expD(R.di,4,7));
  var need=Math.max(0,C.cover*on+C.alpha*Math.max(0,om-on)*C.mid-tot());
  var acc=Math.min(prod,R.cap.i,need);
  var wI=prod-acc;
  var free=Math.max(0,R.cap.st-tot());
  var stored=Math.min(acc,free),wS=acc-stored;
  if(stored>0)R.lots.push({q:stored,a:0});
  var rem=Math.min(dem,R.cap.sh,tot()),tgt=rem,rev=0;
  R.lots.sort(function(a,b){return b.a-a.a});
  for(var i2=0;i2<R.lots.length&&rem>1e-9;i2++){var take=Math.min(R.lots[i2].q,rem);
   R.lots[i2].q-=take;rem-=take;rev+=take*C.price*C.q[Math.min(R.lots[i2].a,C.ttl-1)]}
  R.lots=R.lots.filter(function(l){return l.q>1e-9});
  var wT=0;
  R.lots=R.lots.filter(function(l){l.a++;if(l.a>=C.ttl){wT+=l.q;return false}return true});
  var end=tot();
  R.cash+=rev-(end*C.hold+R.cap.i*C.maint.i+R.cap.st*C.maint.st+R.cap.sh*C.maint.sh+
   (wI+wS+wT)*C.waste+C.fixed+stored*C.farm);
  R.day++;R.si=mv(R,R.si);R.di=mv(R,R.di);
  if(R.cash<=0)return R.cash;
 }
 return untilDay?R.cash:(R.cash+Math.round(spent*C.salvage));
}

function mv(R,x){var r=R.rng.next();if(r<C.stay)return x;if(x!==1)return 1;
 return r<C.stay+(1-C.stay)/2?0:2}

function startNew(){
 var el=document.getElementById("kseed");
 var v=el&&el.value?parseInt(el.value,10):0;
 reset(v>0?v:Math.floor(Math.random()*99999)+1);
 if(el)el.value="";
}

function finishRun(){
 if(G.over)return;
 G.finDay=G.day;
 G.timeline.push({day:G.day,type:"act",text:"운영 종료 선택, 남은 기간 자동 운영"});
 setQueue([]);
 var from=G.day, cash0=G.cash;
 while(!G.over)stepDay("none");
 setAutorun(from,G.cash-cash0); SIG.manual.value=false; SIG.fin.value=false;
 render();
}

function advance(){
 if(G.over)return;
 var cash0=G.cash;
 var q=QUEUE.slice(); setQueue([]);
 for(var i=0;i<q.length;i++){
  var kd=q[i].kind;
  var newCap=kd==="intake"?(G.cap.i+C.step.intake):(G.cap.sh+C.step.shipping);
  G.timeline.push({day:G.day,type:"act",text:(kd==="intake"?"집하 +"+C.step.intake:"판매 +"+C.step.shipping)+" 증설, 다음날 "+(kd==="intake"?"집하 ":"판매 ")+newCap+" 적용"});
  stepDay(kd,q[i].path||"직접");
 }
 var from=G.day;
 if(q.length===0)stepDay("none");
 var run=0;
 while(!G.over&&!G.event&&run<C.autoMax-(q.length?0:1)){stepDay("none");run++}
 var to=G.day-1;
 if(to>=from)G.timeline.push({day:from,to:to,type:"auto",
  text:(from===to?from+"일":from+"~"+to+"일")+(from===1?" 첫날 운영":" 자동 운영")});
 if(G.event)G.timeline.push({day:to,type:"event",
  text:({intake:"집하 한도 도달",store:"창고 여유 없음",ship:"판매 한도 도달",stock:"판매할 재고 소진"})[G.event.b]});
 for(var pk in PENDPCT)PREVPCT[pk]=PENDPCT[pk];
 PENDPCT={};
 setAutorun(from,G.cash-cash0); SIG.manual.value=false;
 render();
}

var LASTDUMP="";

/* ---- Preact 렌더 브리지 ---- */
function hindsight(){
 var base=replay(G.seed,0,0),best={i:0,s:0,v:base};
 for(var i=0;i<=4;i++)for(var s2=0;s2<=5;s2++){
  var v=replay(G.seed,i,s2);
  if(v>best.v)best={i:i,s:s2,v:v};
 }
 return{base:base,best:best,mine:replay(G.seed,G.buys.intake,G.buys.shipping)};
}

function missedOps(){
 var full={};
 for(var i=0;i<G.mods.length;i++)full[G.mods[i].day]=G.mods[i].kind;
 var base=replayPlan(G.seed,full);
 var out=[];
 for(var day=2;day<=C.days-2;day++){
  if(full[day])continue;
  var kinds=["intake","shipping"];
  for(var k=0;k<kinds.length;k++){
   var p={};for(var dd in full)p[dd]=full[dd];
   p[day]=kinds[k];
   out.push({day:day,kind:kinds[k],gain:Math.round(replayPlan(G.seed,p)-base)});
  }
 }
 out.sort(function(a,b){return b.gain-a.gain});
 return out;
}

function cnt(axis,val){
 var k=axis===0?"si":"di",n=0;
 for(var i=0;i<G.hist.length;i++)if(G.hist[i][k]===val)n++;
 return n;
}

function modContrib(){
 if(!G.mods.length)return null;
 var full={};
 for(var i=0;i<G.mods.length;i++)full[G.mods[i].day]=G.mods[i].kind;
 var baseCash=replayPlan(G.seed,full);
 var out=[];
 for(var j=0;j<G.mods.length;j++){
  var p={};
  for(var d in full)if(+d!==G.mods[j].day)p[d]=full[d];
  out.push(Math.round(baseCash-replayPlan(G.seed,p)));
 }
 return out;
}

var PREVPCT={},PENDPCT={};
function dwellMedian(win){
 var h=G.hist.slice(-(win||7));
 var arr=[],tot=0;
 for(var i=0;i<h.length;i++){var m=h[i].ageMix||[];
  for(var j=0;j<m.length;j++){arr.push(m[j]);tot+=m[j].q}}
 if(tot<C.ui.eps)return null;
 arr.sort(function(a,b){return a.a-b.a});
 var acc=0,med=null,p90=null;
 for(i=0;i<arr.length;i++){acc+=arr[i].q;
  if(med===null&&acc>=tot*0.5)med=arr[i].a;
  if(p90===null&&acc>=tot*0.9){p90=arr[i].a;break}}
 return{med:med,p90:p90,days:h.length};
}

function invPerf(win){
 var h=G.hist.slice(-(win||5));
 if(h.length<2)return null;
 var sold=0,inv=0,acc=0,loss=0;
 for(var i=0;i<h.length;i++){sold+=h[i].sold;inv+=h[i].end;acc+=h[i].acc;loss+=h[i].wT;}
 var avgInv=inv/h.length, avgSold=sold/h.length;
 return{cover:avgSold>0.05?(avgInv/avgSold):null,loss:acc>0.05?(loss/acc):0,days:h.length};
}

function recoverPct(kind){
 var last=null;
 for(var i=0;i<G.mods.length;i++)if(G.mods[i].kind===kind)last=G.mods[i];
 if(!last||G.over||G.day<=last.day+1)return null;
 var full={};
 for(var j=0;j<G.mods.length;j++)full[G.mods[j].day]=G.mods[j].kind;
 var without={};
 for(var d in full)if(+d!==last.day)without[d]=full[d];
 var upto=G.day-1;
 var gain=replayPlan(G.seed,full,upto)-replayPlan(G.seed,without,upto);
 var days=upto-last.day;
 var cost=C.cost[kind]+days*C.step[kind]*(kind==="intake"?C.maint.i:C.maint.sh);
 var val=Math.round(gain);
 var key=kind+":"+last.day, prev=PREVPCT[key];
 PENDPCT[key]=val;
 return{val:val,cost:cost,prev:(prev===undefined?null:prev)};
}

window.ffFinish=function(){
 if(!G.finDay)return{운영종료:false};
 var m=missedOps().filter(function(x){return x.day>=G.finDay});
 var pos=m.filter(function(x){return x.gain>0});
 pos.sort(function(a,b){return b.gain-a.gain});
 var edge=Math.round(G.cash-replayPlan(G.seed,{}));
 var give=pos.length?pos[0].gain:0;
 return{운영종료일:G.finDay,
  확보우위:edge,
  포기옵션:give,
  포기옵션_위치:pos.length?{일차:pos[0].day,설비:pos[0].kind==="intake"?"집하":"판매"}:null,
  이후_양의기회_수:pos.length,
  종료여유:give>0?+(edge/give).toFixed(2):null};
};

window.ffCheck=function(){
 var bad=[];
 for(var i=0;i<G.hist.length;i++){
  var r=G.hist[i];
  var d1=Math.abs((r.prod-r.acc)-(r.wI+r.wS));
  var d2=Math.abs((r.dem-r.sold)-r.missed);
  if(d1>0.001)bad.push({day:r.day,식:"생산=집하+미집하",오차:+d1.toFixed(4)});
  if(d2>0.001)bad.push({day:r.day,식:"수요=판매+못판수요",오차:+d2.toFixed(4)});
 }
 return{검사일수:G.hist.length,위반:bad.length,목록:bad};
};

window.ffOption=function(k){var o=optionOf(k);return o};
window.ffTrace=function(){return G.hist.map(function(r){
 return{day:r.day,daily:r.b,trend3:r.b3,drift:+(r.acc-r.sold).toFixed(2),
  sold:+r.sold.toFixed(1),missed:+r.missed.toFixed(1),profit:Math.round(r.profit)}})};
window.ffEvents=function(){
 var NAME={intake:"집하 한도",store:"창고 공간",ship:"판매 한도",stock:"판매할 재고"};
 var out=G.evlog.map(function(e){
  var bought=G.buylog.filter(function(b){return b.day>=e.day&&b.day<=e.day+2});
  return{day:e.day,제약:NAME[e.b]||e.b,
   사건후2일내구매:bought.map(function(b){return b.kind}).join(",")||"없음"};
 });
 var hit=out.filter(function(x){return x.사건후2일내구매!=="없음"}).length;
 return{사건수:out.length,구매로이어짐:hit,
  구매율:out.length?Math.round(hit/out.length*100)+"%":"-",목록:out};
};

window.ffCapSignal=function(){
 var e=G.events,out={};
 ["intake","shipping"].forEach(function(k){
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
 var contrib=modContrib()||[];
 return G.mods.map(function(m,i){
  var u=m.use.length?m.use.reduce(function(a,b){return a+b},0)/m.use.length*100:0;
  var step=m.kind==="intake"?C.step.intake:C.step.shipping;
  var ex=m.extra||0, days=m.use.length;
  return{설비:m.kind==="intake"?"집하":"판매",순번:m.idx,구매일:m.day,보유일:days,
   추가용량사용:+ex.toFixed(1),
   여력비율:days?Math.round(ex/(days*step)*100)+"%":"-",
   반사실기여:contrib[i]===undefined?null:contrib[i],
   legacy_이후평균가동:Math.round(u)+"%",
   legacy_구매후3일내상한재도달:m.hit};
 });
};
window.ffBuys=function(){return{intake:G.buys.intake,shipping:G.buys.shipping,spent:G.spent}};
window.ffAgree=function(){var h=G.hist.filter(function(r){return r.day>=3});
 if(!h.length)return 0;return +(h.filter(function(r){return r.b===r.b3}).length/h.length*100).toFixed(0)};
function buyOffset(k){
 var o=ord(k);
 if(o>0)return o-1;
 return QUEUE.length;
}

function breakEven(k){
 var off=buyOffset(k);
 var days=Math.max(0,C.days-G.day-off);
 if(days<=0)return null;
 var step=C.step[k];
 var maint=(k==="intake"?C.maint.i:C.maint.sh)*step*days;
 var net=C.cost[k]*(1-C.salvage)+maint;
 var margin=(k==="intake")?(C.price-C.farm-C.hold):C.price;
 return{t:net/margin,cost:Math.round(net)};
}

function optionOf(k){
 var h=capHits(k,5), off=buyOffset(k);
 var usable=Math.max(0,C.days-G.day-off);
 var be=breakEven(k);
 var payback=be?(be.t/C.step[k]):null;
 return{kind:k,cost:C.cost[k],hits:h.n,window:h.len,lastHit:!!h.last,
  usable:usable,payback:payback,
  affordable:G.cash>=C.cost[k],
  overRun:(payback!==null&&payback>usable)};
}

var _h=window.preact.h, _render=window.preact.render, _html=window.htm.bind(_h);
var _signal=window.preactSignals.signal;
var _computed=window.preactSignals.computed;
var GAME=_signal(0);
function game(){GAME.value;return G}
var EVENT=_signal(null);
function setEvent(e){EVENT.value=e;if(G)G.event=e}
function evt(){return EVENT.value}
var PENDING=_signal(null);
function setPending(p){PENDING.value=p;if(G)G.pend=p}
var AUTORUN=_signal(null);
function setAutorun(from,cash){AUTORUN.value=(from&&from>0)?{from:from,cash:cash}:null;if(G){G.autoFrom=from;G.autoCash=cash}}

var MATRIXHTML=_computed(function(){GAME.value;return (G&&G.hist.length&&!isOver())?matrixHtml():""});
var CHARTSVG=_computed(function(){GAME.value;return (G&&isOver()&&G.hist.length)?chartHtml():""});
var QUEUE_S=_signal([]);
function queueOf(){return QUEUE_S.value}
function toggleBuy(kind){
 var q=QUEUE_S.value, on=false, i;
 for(i=0;i<q.length;i++)if(q[i].kind===kind)on=true;
 if(on)setQueue(q.filter(function(x){return x.kind!==kind}));
 else{ if(G.cash<C.cost[kind])return; setQueue(q.concat([{kind:kind,path:evt()?"사건":"직접"}])); }
}
function clearQueue(){setQueue([])}
function setQueue(a){QUEUE_S.value=a;QUEUE=a}
var PHASE=_signal("play");
function isOver(){return PHASE.value!=="play"}
function isBust(){return PHASE.value==="bust"}
function setPhase(p){PHASE.value=p;if(G){G.over=(p!=="play");G.bust=(p==="bust")}}
var SIG={fin:_signal(false),manual:_signal(false)};
var OPENSIG=_signal(0),NEWSIG=_signal(0),CMPSIG=_signal(0);
var ENDHTML=_computed(function(){GAME.value;OPENSIG.value;return isOver()?endCard():null});
CMPSIG.open=false;
NEWSIG.armed=false;
var PANE=0;
function goPane(i){
 PANE=i;
 var el=document.querySelector(".pager");
 if(el&&el.scrollTo)el.scrollTo({left:i*el.clientWidth,behavior:"smooth"});
 bump();
}
function bump(){GAME.value=GAME.value+1}
var MOUNT=null;






function FlowView(){
 game();
 var d=G.hist.length?G.hist[G.hist.length-1]:null;
 var rec=G.hist.slice(-3),dr=rec.length?rec.reduce(function(a,x){return a+x.acc-x.sold},0)/rec.length:0;
 var head=isOver()?(isBust()?"현금이 바닥났다":"30일이 끝났다")
  :(d?('<span style="font-size:12px;color:var(--text-muted)">가장 의심되는 제약</span><br><span style="color:var(--text-warning)">'+BL[d.b].replace("어제 ","")+'</span><br><span style="font-size:12px;color:var(--text-secondary)">'+causeLine(dr,d)+'</span>'):"");
 return _h("div",{},[
  _h("div",{id:"kylabel",class:"lbl"},d?(d.day+"일 결과"):"운영 시작 전"),
  _h("div",{id:"kbn",class:"sub-p",dangerouslySetInnerHTML:{__html:head}}),
  _h("div",{id:"kchain",class:"gap-s"},[chainNodes()])
 ]);
}

function HistoryView(){
 game();
 if(!G.hist.length)return null;
 var kids=[];
 var ar=AUTORUN.value;
 if(!isOver()&&ar&&(G.day-1-ar.from)>=1)
  kids.push(_h("div",{id:"kauto",class:"card-note"},
   ar.from+"~"+(G.day-1)+"일 자동 운영 · 현금 "+(ar.cash>=0?"+":"")+mo(ar.cash)));
 if(!isOver()){
  var mods=modCardHtml();
  if(mods)kids.push(_h("div",{id:"kmods",class:"card-sm",dangerouslySetInnerHTML:{__html:mods}}));
  kids.push(_h("div",{id:"klog",class:"sub",dangerouslySetInnerHTML:{__html:logHtml(G.hist.slice(-C.ui.logRows).reverse())}}));
 }
 return kids.length?_h("div",{},kids):null;
}

function OptionCompareView(){
 game(); QUEUE_S.value; CMPSIG.value; SIG.manual.value;
 var started=G.hist.length>0;
 if(!started||isOver())return null;
 var openDec=!!evt()||SIG.manual.value||queueOf().length>0;
 if(!openDec)return null;
 var open=CMPSIG.open;
 var kids=[_h("button",{id:"kcmp",class:"btn-plain",
   onClick:function(){CMPSIG.open=!CMPSIG.open;CMPSIG.value=CMPSIG.value+1}},
   open?"비교 근거 접기":"비교 근거 보기")];
 if(open){
  var u3=useRate(3), hI=capHits("intake",5), hS=capHits("shipping",5);
  kids.push(_h("div",{id:"kchoice",class:"frame",
   style:{borderColor:queueOf().length?"var(--border-accent)":"var(--border)"},
   dangerouslySetInnerHTML:{__html:choiceHtml(u3,hI,hS)}}));
 }
 return _h("div",{},kids);
}

function NavBarView(){
 game(); NEWSIG.value;
 var mid=G&&!isOver()&&G.hist.length>0, done=isOver(), arm=NEWSIG.armed;
 var d=G?Math.min(G.day,C.days):1;
 var pf=G&&G.hist.length?G.hist[G.hist.length-1].profit:null;
 return _h("div",{},[
  _h("div",{style:{display:"flex",alignItems:"center",gap:"6px",margin:"20px 0 12px"}},[
   _h("div",{style:{fontSize:"16px",fontWeight:"600",letterSpacing:"-.01em",flex:"1"}},"양파 · 30일 운영"),
   _h("input",{id:"kseed",inputmode:"numeric",placeholder:"시드",class:"btn-sm",
     style:{width:"64px",background:"transparent",color:"var(--text-primary)",
       border:"1px solid var(--border-strong)",borderRadius:"var(--radius)"}}),
   _h("button",{id:"knew",class:"btn-sm",
     style:{borderColor:arm?"var(--border-warning)":(mid?"var(--border-strong)":(done?"var(--border-accent)":"var(--border-accent)")),
       color:arm?"var(--text-warning)":(mid?"var(--text-muted)":(done?"var(--text-success)":"var(--text-primary)"))},
     onClick:function(){
      var m=G&&!isOver()&&G.hist.length>0;
      if(m&&!NEWSIG.armed){NEWSIG.armed=true;NEWSIG.value=NEWSIG.value+1;
       setTimeout(function(){NEWSIG.armed=false;NEWSIG.value=NEWSIG.value+1},C.ui.newArmMs);return}
      NEWSIG.armed=false;startNew();
     }},arm?"버리고 새 게임":(done?"새 게임 ▸":"새 게임"))
  ]),
  _h("div",{style:{display:"flex",gap:"14px",flexWrap:"wrap",paddingBottom:"10px",
    borderBottom:"1px solid var(--border)",marginBottom:"14px"}},[
   _h("div",{style:{fontSize:"13px",color:"var(--text-secondary)"}},["일차 ",
     _h("span",{id:"kd",style:{color:"var(--text-primary)",fontWeight:"500"}},String(d))," / "+C.days]),
   _h("div",{style:{fontSize:"13px",color:"var(--text-secondary)"}},["현금 ",
     _h("span",{id:"kc",style:{color:"var(--text-primary)",fontWeight:"500"}},mo(G.cash))]),
   _h("div",{style:{fontSize:"13px",color:"var(--text-secondary)"}},["어제 손익 ",
     _h("span",{id:"kp",style:{fontWeight:"500",color:pf===null?"var(--text-primary)":(pf>=0?"var(--text-success)":"var(--text-danger)")}},
       pf===null?"—":((pf>=0?"+":"-")+mo(Math.abs(pf))))]),
   _h("div",{style:{fontSize:"13px",color:"var(--text-secondary)"}},["시드 ",
     _h("span",{id:"ks",style:{color:"var(--text-primary)"}},String(G.seed))])
  ])
 ]);
}

function DecisionView(){
 game(); QUEUE_S.value; SIG.manual.value;
 var started=G.hist.length>0;
 if(isOver())return _h("div",{id:"klabel",class:"lbl"},"운영 종료");
 if(!started)return _h("div",{id:"kexplore",class:"card"},[
   _h("div",{style:{fontSize:"13px",color:"var(--text-primary)",marginBottom:"4px"}},"첫날"),
   _h("div",{style:{fontSize:"12px",color:"var(--text-secondary)",lineHeight:"1.6"}},"먼저 하루를 운영해 보자.")]);

 var ev=evt();
 var Q=queueOf();
 var isEvent=!!ev, openDec=isEvent||SIG.manual.value||Q.length>0;
 var EV={intake:"집하 한도 도달",store:"창고 여유 없음",ship:"판매 한도 도달",stock:"판매할 재고 소진"};
 var evTxt=ev?EV[ev.b]:"특이사항 없이 운영 중";
 var kids=[_h("div",{id:"klabel",class:"lbl"},evTxt+" · 남은 "+(C.days-G.day+1)+"일")];
 if(openDec){
  var mk=function(kind,id,label){
   var on=queued(kind), o=ord(kind), opt=optionOf(kind), tx=optionText(opt);
   var row=function(v,warn){return _h("div",{style:{fontSize:"11px",padding:"0",
     color:warn?"var(--text-warning)":"var(--text-secondary)"}},v)};
   return _h("button",{id:id,class:"btn-cell",
    style:{borderColor:on?"var(--border-accent)":"var(--border-strong)",background:"transparent",
      opacity:(opt.affordable||on)?"1":"0.4"},
    onClick:function(){
     if(isOver())return;
     toggleBuy(kind);
    },
    },[
     on?_h("b",{},o+"순위"):null, on?" ":null, label,
     _h("div",{style:{fontSize:"11px",color:"var(--text-muted)",padding:"3px 0 5px"}},mo(opt.cost)),
     row(tx.past), row(tx.usable,opt.usable<=C.ui.lowDays), row(tx.payback,opt.overRun)
    ]);
  };
  kids.push(_h("div",{id:"kacts",class:"acts"},[
   mk("intake","kbi","집하 +"+C.step.intake),
   mk("shipping","kbs","판매 +"+C.step.shipping),
   _h("button",{id:"kbw",class:"btn-cell",
    style:{borderColor:Q.length?"var(--border-strong)":"var(--border-accent)",background:"transparent"},
    onClick:function(){if(isOver())return;clearQueue()},
    },["관망",
     _h("div",{style:{fontSize:"11px",color:"var(--text-muted)",padding:"3px 0 5px"}},"0"),
     _h("div",{style:{fontSize:"11px",color:"var(--text-secondary)"}},"—"),
     _h("div",{style:{fontSize:"11px",color:"var(--text-secondary)"}},"—"),
     _h("div",{style:{fontSize:"11px",color:"var(--text-secondary)"}},"—")])
  ]));
  kids.push(_h("div",{id:"klegend",class:"note"},"가격 · 최근 도달 · 사용 가능일 · 최소 회수기간"));
  var pend=Q.length===0?"사지 않고 계속 운영해도 된다."
   :(Q.length===1?("이번에 증설: "+lblOf(Q[0].kind)+" · 다른 설비도 같이 고른다.")
   :("이번에 증설: "+Q.map(function(q){return lblOf(q.kind)}).join(", ")+" · 하루에 하나씩 순서대로 산다."));
  kids.push(_h("div",{id:"kpend",class:"sub"},pend));
 }
 kids.push(_h("div",{id:"khint",class:"note-b"},
   PENDING.value?("어제 산 설비가 내일 적용된다: "+(PENDING.value==="intake"?"집하":"출하")):"오늘 산 설비는 내일부터 작동한다."));
 return _h("div",{},kids);
}

function ForecastView(){
 game();
 if(!G.hist.length||isOver())return null;
 var html=MATRIXHTML.value;
 if(!html)return null;
 return _h("div",{id:"kchart",class:"gap-m",dangerouslySetInnerHTML:{__html:html}});
}

function TimelineChartView(){
 game();
 if(!isOver()||!G.hist.length)return null;
 var html=CHARTSVG.value;
 if(!html)return null;
 return _h("div",{id:"kchart",class:"gap-m",dangerouslySetInnerHTML:{__html:html}});
}

function GameResultView(){
 var html=ENDHTML.value;
 if(!html)return null;
 return _h("div",{id:"kbrief",class:"card",
  onClick:function(ev){
   var t=ev&&ev.target&&ev.target.closest?ev.target.closest("[data-fold]"):null;
   if(t){var k=t.getAttribute("data-fold");OPEN[k]=!OPEN[k];OPENSIG.value=OPENSIG.value+1;return}
   var c=ev&&ev.target&&ev.target.closest?ev.target.closest("#kcopy"):null;
   if(c)copyLog();
  },
  dangerouslySetInnerHTML:{__html:html}});
}

function DockView(){
 game();
 var started=G.hist.length>0, over=isOver();
 var ev=evt();
 var isEvent=!!ev, openDec=started&&(isEvent||SIG.manual.value||queueOf().length>0);
 var goText=over?"30일 종료 · 결과 확인":(started?(ev?"계속 운영":C.autoMax+"일 더 운영"):"첫날 운영");
 var kids=[_h("button",{id:"kgo",class:"btn-full",
   style:{borderColor:over?"var(--border)":"var(--border-strong)",color:over?"var(--text-muted)":"var(--text-primary)"},
   onClick:function(){if(!isOver())advance()}},goText)];
 if(started&&!over&&!isEvent&&!openDec)
  kids.push(_h("button",{id:"kopen",class:"btn-sub",
   style:{color:"var(--text-secondary)"},
   onClick:function(){SIG.manual.value=true;bump()}},"설비 관리"));
 if(started&&!over){
  var arm=SIG.fin.value, leftD=C.days-G.day+1;
  kids.push(_h("button",{id:"kfin",class:"btn-sub",
   style:{borderColor:"var(--text-danger)",color:arm?"var(--text-danger)":"var(--text-secondary)",
     background:arm?"var(--bg-danger)":"transparent"},
   onClick:function(){
     if(!SIG.fin.value){SIG.fin.value=true;
      setTimeout(function(){SIG.fin.value=false},C.ui.armMs);return}
     SIG.fin.value=false;finishRun();
   },
   dangerouslySetInnerHTML:{__html:arm
     ?('<b>30일까지 운영</b><br><span style="font-size:11px">남은 '+leftD+'일을 더 사지 않고 운영한다. 되돌릴 수 없다.</span>')
     :('운영 종료<br><span style="font-size:11px;color:var(--text-danger)">되돌릴 수 없다 · 이후 투자 불가</span>')}}));
 }
 return _h("div",{class:"dock"},kids);
}

function App(){
 game();
 return _html`
  <div>
   ${_h(NavBarView,{})}
   ${_h(ForecastView,{})}
   ${_h(TimelineChartView,{})}
   ${_h(GameResultView,{})}
   ${_h(DecisionView,{})}
   ${(G&&!G.hist.length)?_h(FlowView,{}):null}
   ${(G&&G.hist.length&&!isOver())?_h("div",{class:"tabs"},[
     _h("span",{class:PANE===0?"tab-on":"",onClick:function(){goPane(0)}},"어제 흐름"),
     _h("span",{class:PANE===1?"tab-on":"",onClick:function(){goPane(1)}},"일별 기록"),
     _h("span",{class:PANE===2?"tab-on":"",onClick:function(){goPane(2)}},"대안 비교")
   ]):null}
   ${(G&&G.hist.length&&!isOver())?_h("div",{class:"pager",onScroll:function(ev){
     var el=ev.currentTarget, i=Math.round(el.scrollLeft/el.clientWidth);
     if(i!==PANE){PANE=i;bump()}
   }},[
     _h("div",{class:"pane"},[_h(FlowView,{})]),
     _h("div",{class:"pane"},[_h(HistoryView,{})]),
     _h("div",{class:"pane"},[_h(OptionCompareView,{})])
   ]):null}
   ${isOver()?_h("div",{},[_h(FlowView,{})]):null}
   ${_h("div",{class:"dock-space"})}
   ${_h(DockView,{})}
  </div>`;
}
function render(){bump();}
function paint(){
 if(MOUNT)return;
 MOUNT=document.getElementById("app");
 _render(_h(App,{}),MOUNT);
}

var OPEN={},QUEUE=[];

function line(label,value,note){
 return '<div style="display:flex;justify-content:space-between;align-items:baseline;gap:12px;padding:5px 0">'+
 '<span style="font-size:12px;color:var(--text-secondary);min-width:76px">'+label+'</span>'+
 '<span style="font-size:14px;color:var(--text-primary);flex:1">'+value+'</span>'+
 '<span style="font-size:11px;color:var(--text-muted);text-align:right">'+(note||"")+'</span></div>';
}

function p1(h){return h.len===0?"관측 없음":(h.last?"막힘":"여유")}
function p2(h){return h.len<3?("관측 "+h.len+"일뿐"):(h.n+"/"+h.len+"일")}


function choiceHtml(u3,hI,hS){
 var sv=pct(blur(hor(G.si,4,7))),dv=pct(blur(hor(G.di,4,7)));
 var gapI=sv[2]-sv[0],gapS=dv[2]-dv[0];
 var word=function(g){return g>=10?"늘어날 쪽 +"+g+"%p":g<=-10?"줄어들 쪽 "+g+"%p":"보합 "+(g>=0?"+":"")+g+"%p"};
 var sign=function(g){return " "+(g>=0?"+":"")+g+"%p"};
 var days=function(h){return h.len<3?("관측 "+h.len+"일뿐"):(h.n+"/"+h.len+"일")};
 phaseSync(gapI,gapS);
 var rows=[
  ["앞으로","-","물량 "+word(gapI),"수요 "+word(gapS)],
  ["비용","0",mo(C.cost.intake)+" + "+(C.step.intake*C.maint.i)+"/일",mo(C.cost.shipping)+" + "+(C.step.shipping*C.maint.sh)+"/일"]
 ];
 if(true){
  rows=[["어제","-",p1(hI),p1(hS)],
        rows[0],
        ["최근","-",p2(hI),p2(hS)],
        rows[1]];
 }else{
  rows=[["최근","-",recentText(hI),recentText(hS)]].concat(rows);
 }
 var keys=["intake","shipping"];
 var sub=function(n,k){var o=ord(k);
  return '<br><span style="font-size:11px;color:var(--text-secondary);font-weight:400">'+(o?o+"순위 · ":"")+'증설 '+n+'회</span>'};
 var heads=["집하 "+G.cap.i+" → "+(G.cap.i+C.step.intake)+sub(G.buys.intake,"intake"),
            "판매 "+G.cap.sh+" → "+(G.cap.sh+C.step.shipping)+sub(G.buys.shipping,"shipping")];
 var sel=function(k){return queued(k)};
 var cellBg=function(k){return ord(k)?"var(--surface-1)":"transparent"};
 var cellFg=function(k){return "var(--text-primary)"};
 var html='<div style="display:grid;grid-template-columns:64px repeat(2,minmax(0,1fr))">';
 html+='<div style="padding:9px 8px;font-size:11px;color:var(--text-muted);border-bottom:0.5px solid var(--border)"></div>';
 for(var h=0;h<2;h++){
  html+='<div style="padding:9px 6px;text-align:center;font-size:13px;font-weight:500;border-bottom:0.5px solid var(--border);border-left:0.5px solid var(--border);background:'+cellBg(keys[h])+';color:'+cellFg(keys[h])+'">'+heads[h]+'</div>';
 }
 for(var r=0;r<rows.length;r++){
  var last=r===rows.length-1;
  var grp=(r===1||r===2);
  var bb=last?"none":(grp?"0.5px solid var(--border-strong)":"0.5px solid var(--border)");
  html+='<div style="padding:7px 8px;font-size:11px;color:var(--text-secondary);border-bottom:'+bb+'">'+rows[r][0]+'</div>';
  for(var c=0;c<2;c++){
   html+='<div style="padding:7px 6px;text-align:center;font-size:12px;border-bottom:'+bb+';border-left:0.5px solid var(--border);background:'+cellBg(keys[c])+';color:'+cellFg(keys[c])+'">'+rows[r][c+2]+'</div>';
  }
 }
 html+='</div>';
 return html;
}

function fold(id,title,body){
 var open=OPEN[id]?"":"none";
 return '<div style="border-top:0.5px solid var(--border);margin-top:10px;padding-top:8px">'+
  '<div data-fold="'+id+'" style="cursor:pointer;font-size:12px;color:var(--text-secondary)">'+
   (OPEN[id]?"▾ ":"▸ ")+title+'</div>'+
  '<div style="display:'+open+';margin-top:6px">'+body+'</div></div>';
}

function finBrief(){
 if(!G.finDay)return "";
 return line("운영 종료",G.finDay+"일차",(G.finDay+1)+"~"+C.days+"일 자동 운영");
}

function finAfter(){
 if(!G.finDay)return "";
 var all=missedOps().filter(function(x){return x.gain>0});
 all.sort(function(a,b){return b.gain-a.gain});
 var aft=all.filter(function(x){return x.day>=G.finDay});
 if(!aft.length)return '<div style="font-size:12px;color:var(--text-secondary);padding-left:2px">접은 뒤로는 사도 이득이 없었다</div>';
 var t=aft[0];
 if(all.length&&all[0].day===t.day&&all[0].kind===t.kind)
  return '<div style="font-size:12px;color:var(--text-secondary);padding-left:2px">이 기회는 운영 종료 이후에 있었다</div>';
 return line("종료 후 최대 기회","+"+mo(t.gain),t.day+"일 "+(t.kind==="intake"?"집하 +"+C.step.intake:"판매 +"+C.step.shipping));
}

function missedBrief(){
 var m=missedOps();
 var pos=m.filter(function(x){return x.gain>0});
 if(!pos.length)return line("놓친 최대 기회","없음","어느 날 더 사도 돈이 늘지 않았다");
 var top=pos[0];
 var near=pos.filter(function(x){return x.kind===top.kind&&x.gain>=top.gain*0.9});
 var days=near.map(function(x){return x.day}).sort(function(a,b){return a-b});
 var lbl=top.kind==="intake"?"집하 +"+C.step.intake:"판매 +"+C.step.shipping;
 var span=days.length>1?("이 계획에 "+days[0]+"~"+days[days.length-1]+"일 중 아무 날에 하나를 더 샀어도 비슷했다"):"이날 하나를 더 샀다면 가장 많이 벌었다";
 return line("놓친 최대 기회",top.day+"일 "+lbl,"+"+mo(top.gain))+
  '<div style="font-size:12px;color:var(--text-secondary);padding-left:2px">'+span+'</div>';
}

function missedHtml(){
 var m=missedOps();
 if(!m.length)return '<div style="font-size:12px;color:var(--text-secondary)">더 살 날이 없다.</div>';
 var head='<div style="font-size:12px;color:var(--text-muted);margin-bottom:6px">그날 하나를 더 샀다면 생겼을 현금 차이다. 오른쪽은 전날과의 차이다.<br>차분이 유지비(집하 '+(C.step.intake*C.maint.i)+' / 판매 '+(C.step.shipping*C.maint.sh)+')와 같으면 그 설비는 놀았다. 그보다 크면 하루 미루는 사이에 벌 돈을 놓쳤다.</div>';
 var byKind={intake:[],shipping:[]};
 for(var i=0;i<m.length;i++)byKind[m[i].kind].push(m[i]);
 var out=head;
 var names={intake:"집하 +"+C.step.intake,shipping:"판매 +"+C.step.shipping};
 var step={intake:C.step.intake*C.maint.i,shipping:C.step.shipping*C.maint.sh};
 for(var k in byKind){
  var arr=byKind[k].slice().sort(function(a,b){return a.day-b.day});
  if(!arr.length)continue;
  out+='<div style="font-size:12px;color:var(--text-secondary);margin:8px 0 3px">'+names[k]+'</div>';
  for(i=0;i<arr.length;i++){
   var t=arr[i], d=(i>0)?(t.gain-arr[i-1].gain):null;
   var flat=(d!==null&&Math.abs(d-step[k])<=2);
   var dtxt=(d===null)?"":((d>=0?"+":"")+mo(d));
   out+='<div style="display:flex;justify-content:space-between;gap:8px;padding:2px 0;font-size:12px">'+
    '<span style="width:40px;color:var(--text-muted)">'+t.day+'일</span>'+
    '<span style="flex:1;text-align:right;color:'+(t.gain>=0?"var(--text-success)":"var(--text-warning)")+'">'+(t.gain>=0?"+":"")+mo(t.gain)+'</span>'+
    '<span style="width:64px;text-align:right;color:'+(flat?"var(--text-muted)":"var(--text-secondary)")+'">'+dtxt+'</span></div>';
  }
 }
 return out;
}


function contribSummary(){
 if(!G.mods.length)return "";
 var c=modContrib()||[];
 var out='<div>';
 for(var i=0;i<G.mods.length;i++){
  var m=G.mods[i],v=c[i]||0;
  out+='<div style="display:flex;justify-content:space-between;padding:3px 0;font-size:13px">'+
   '<span style="color:var(--text-secondary)">'+m.day+'일 '+(m.kind==="intake"?"집하 +"+C.step.intake:"판매 +"+C.step.shipping)+'</span>'+
   '<span style="color:'+(v>=0?"var(--text-success)":"var(--text-warning)")+'">'+(v>=0?"+":"")+mo(v)+'</span></div>';
 }
 return out+'</div>';
}

function endCard(){
 var last=G.hist[G.hist.length-1];
 var iv2=inv();
 var u=useRate(30);
 var h=hindsight();
 var mine=Math.round(G.cash-h.base), opt=Math.round(h.best.v-h.base);

 var sec=function(t){return '<div style="font-size:11px;color:var(--text-muted);letter-spacing:.04em;margin:14px 0 4px">'+t+'</div>'};
 var head='<div style="font-size:15px;font-weight:600;margin-bottom:2px">'+
  (G.bust?"현금이 바닥났다":"30일이 끝났다")+'</div>'+
  sec("성과")+
  line("최종 현금",mo(G.cash),"시드 "+G.seed)+
  line("무투자 대비",(mine>=0?"+":"")+mo(mine),"내 투자 묶음의 효과")+
  sec("내 결정")+
  line("증설",(G.buys.intake+G.buys.shipping===0)?"없음":("집하 "+G.buys.intake+"회 / 판매 "+G.buys.shipping+"회"),mo(G.spent)+" 투입")+
  contribSummary()+finBrief()+
  sec("복기")+
  line("사후 기준 대비",(mine-opt>=0?"+":"")+mo(mine-opt),"기준 집하 "+h.best.i+"회 / 판매 "+h.best.s+"회")+
  missedBrief()+finAfter();

 var ops=line("최종 재고",f1(iv2)+" t","저장 "+G.cap.st+" t")+
  line("최종 용량","집하 "+G.cap.i+" / 판매 "+G.cap.sh,"시작 20 / 21")+
  line("총 투자비",mo(G.spent),G.buys.intake+G.buys.shipping+"회")+
  line("종료 시 처분가치",mo(G.salvaged||0),"취득비의 "+Math.round(C.salvage*100)+"%")+

  line("재고 체류일",(function(){var d=dwellMedian(C.days);return d?("중앙값 "+d.med+"일 / 90% "+d.p90+"일"):"—"})(),"판매된 물량 기준, TTL "+C.ttl+"일")+
  line("로스율",(function(){var p=invPerf(C.days);return p?Math.round(p.loss*100)+"%":"—"})(),"상함 / 집하")+
  line("집하 평균 가동",u.i.toFixed(0)+"%","30일 기준")+
  line("판매 평균 가동",u.sh.toFixed(0)+"%","30일 기준")+
  line("수요 국면",cnt(1,0)+"일 침체, "+cnt(1,1)+"일 정상, "+cnt(1,2)+"일 호황","")+
  line("생산 국면",cnt(0,0)+"일 부족, "+cnt(0,1)+"일 평년, "+cnt(0,2)+"일 풍작","")+
  '<div style="margin-top:8px;font-size:12px;color:var(--text-secondary)">'+worldNote()+'</div>';

 return head+
  fold("ops","운영 결과",ops)+
  fold("mods","투자 분석",modCardHtml()||'<div style="font-size:12px;color:var(--text-muted)">이번 판에는 아무것도 사지 않았다.</div>')+
  fold("miss","기회 분석",missedHtml())+
  fold("log","전체 기록",timelineHtml()+logHtml(G.hist.slice(-C.ui.logRows).reverse())+buyLogHtml())+
  '<div style="margin-top:8px;font-size:11px;color:var(--text-muted)">사후 기준은 30일을 미리 알 때 같은 횟수로 얻는 최선이다. 사는 날은 이틀 간격으로 고정했다.</div>';
}

function worldNote(){
 var slump=cnt(1,0),boom=cnt(1,2),poor=cnt(0,0),good=cnt(0,2),n=G.hist.length||1;
 if(slump/n>=0.5)return "수요 침체가 "+slump+"일 이어져 추가 용량이 팔 자리를 찾기 어려웠다.";
 if(boom/n>=0.5)return "수요 호황이 "+boom+"일 이어져 판매 창구가 성과를 갈랐다.";
 if(poor/n>=0.5)return "생산 부족이 "+poor+"일 이어져 공급망에 들어올 물량 자체가 적었다.";
 if(good/n>=0.5)return "풍작이 "+good+"일 이어져 받아들일 물량은 많았다.";
 return "생산과 수요가 30일 동안 뚜렷한 한쪽으로 기울지 않았다.";
}

function causeLine(dr,d){
 if(!d)return "아직 관측이 없다";
 var f=function(n){return n.toFixed(1)};
 switch(d.b){
  case "intake": return "집하가 한도 "+d.capI+"t에 닿았고 "+f(d.wIcap)+"t이 남았다";
  case "store":  return "창고 여유가 없었고 "+f(d.wIstore+d.wS)+"t이 남았다";
  case "supply": return "집하 한도에는 여유가 있었고 생산이 "+f(d.prod)+"t에 그쳤다";
  case "ship":   return "판매가 한도 "+d.capS+"t에 닿았고 수요 "+f(d.missed)+"t이 남았다";
  case "stock":  return "재고가 바닥났고 수요 "+f(d.missed)+"t이 남았다";
  case "demand": return "판매 한도에는 여유가 있었고 시장 수요가 "+f(d.dem)+"t에 그쳤다";
  case "policy": return "지금 필요한 물량이 적어 "+f(d.wIneed)+"t을 집하하지 않았다";
 }
 return "흐름이 안정적이다";
}


var f1=function(n){return n.toFixed(1)},mo=function(n){return Math.round(n).toLocaleString("ko-KR")};
var BL={none:"어제는 뚜렷한 제약이 없었다",
 intake:"어제 유입 제약: 집하 한도",
 store:"어제 유입 제약: 창고 공간",
 supply:"어제 유입 제약: 생산량",
 ship:"어제 유출 제약: 판매 한도",
 stock:"어제 유출 제약: 판매할 재고",
 demand:"어제 유출 제약: 시장 수요",
 policy:"어제는 목표재고를 채워 더 받지 않았다"};
var RAMP=["#5F5E5A","#185FA5","#0F6E56"],TINT=["#F1EFE8","#E6F1FB","#E1F5EE"];



function chainNodes(){
 var d=G.hist.length?G.hist[G.hist.length-1]:null;
 var iv=inv();
 var rec=G.hist.slice(-3),dr=rec.length?rec.reduce(function(a,x){return a+x.acc-x.sold},0)/rec.length:0;
 var wtot=d?(d.wI+d.wS+d.wT):0;
 var wtxt="";
 var wsub="";
 var lostIn=function(x){
  if(!x)return null;
  var tot=x.wI+x.wS;
  if(tot<C.ui.eps)return null;
  var byStore=x.wIstore+x.wS, parts=[];
  if(x.wIcap>C.ui.eps)parts.push("한도 "+f1(x.wIcap));
  if(byStore>C.ui.eps)parts.push("창고 부족 "+f1(byStore));
  if(x.wIneed>C.ui.eps)parts.push("필요 없음 "+f1(x.wIneed));
  return{amt:tot,txt:"미집하 "+f1(tot)+"t"+(parts.length?" · "+parts.join(" / "):"")};
 };
 var priceNote=function(x){
  var base='<div style="padding-left:38px;font-size:11px;color:var(--text-muted);margin-top:1px">경락단가 '+mo(C.price)+'원/t';
  if(x&&x.ageMix&&x.ageMix.length){
   var q=0,tq=0;
   for(var i=0;i<x.ageMix.length;i++){var m=x.ageMix[i];tq+=m.q;q+=m.q*C.q[Math.min(m.a,C.ttl-1)]}
   if(tq>0.05){
    var eff=Math.round(C.price*(q/tq));
    if(eff<C.price)base+=' · 어제 실현 '+mo(eff)+'원/t';
   }
  }
  return base+'</div>';
 };
 var invNote=function(){
  var p=invPerf(C.ui.recentWin);
  if(!p)return "";
  var dm=dwellMedian(C.ui.dwellWin);
  var lw=Math.round(p.loss*100);
  var dtxt=dm?("체류 중앙값 "+dm.med+"일 · 90% "+dm.p90+"일"):"체류 —";
  return '<span style="color:var(--text-muted)">최근 7일 '+dtxt+' · 로스 '+lw+'%</span>';
 };
 var recText=function(k){
  var r=recoverPct(k);
  if(!r)return "";
  var col=r.val>=0?"var(--text-success)":"var(--text-warning)";
  var main='<span style="color:'+col+'">이 증설로 현재 '+(r.val>=0?"+":"")+mo(r.val)+'</span>';
  if(r.prev!==null&&r.prev!==r.val){
   var dv=r.val-r.prev;
   main+='<span style="color:var(--text-muted)"> · 전일보다 '+(dv>=0?"+":"")+mo(dv)+'</span>';
  }
  return main;
 };
 var row=function(name,body,hot,lossTxt,noteTxt){
  return '<div style="padding:5px 9px;border-left:3px solid '+(hot?"var(--border-warning)":"transparent")+
   ';background:'+(hot?"var(--bg-warning)":"transparent")+'">'+body+'</div>'+
   (noteTxt?'<div style="padding:0 10px 4px 44px;font-size:12px">'+noteTxt+'</div>':"")+
   (lossTxt?'<div style="padding:0 9px 4px 38px;font-size:11px;color:var(--text-danger)">└ '+lossTxt+'</div>':"")+
   '';
 };
 var headLine=function(name,label,val,hot,sub){
  return '<div style="display:flex;align-items:baseline;gap:8px">'+
   '<span style="width:30px;font-size:12px;color:'+(hot?"var(--text-warning)":"var(--text-secondary)")+'">'+name+'</span>'+
   '<span style="flex:1;font-size:11px;color:var(--text-muted)">'+(sub||"")+'</span>'+
   '<span style="font-size:15px;font-weight:500;color:'+(hot?"var(--text-warning)":"var(--text-primary)")+'">'+val+'</span></div>';
 };
 var splitBar=function(a,b,la,lb){
  var t=a+b; if(t<=0)t=1;
  var pa=Math.round(a/t*100);
  return '<div style="display:flex;height:13px;border-radius:2px;overflow:hidden;margin-top:4px;font-size:10px;line-height:13px">'+
   '<div style="width:'+pa+'%;background:var(--border-strong);color:var(--text-primary);text-align:center;white-space:nowrap;overflow:hidden">'+(pa>=22?la:"")+'</div>'+
   '<div style="width:'+(100-pa)+'%;background:var(--bg-danger,#3a1f1f);color:var(--text-danger);text-align:center;white-space:nowrap;overflow:hidden">'+(100-pa>=22?lb:"")+'</div></div>';
 };
 var FLOWMAX=Math.max(G.cap.i,G.cap.sh,30);
 var conn=function(v){
  var w=Math.max(2,Math.round(v/FLOWMAX*10));
  return '<div style="display:flex;align-items:center;gap:6px;height:10px;padding-left:'+(20-w/2).toFixed(0)+'px">'+
   '<div style="width:'+w+'px;height:10px;background:var(--border-strong)"></div>'+
   '<span style="font-size:11px;color:var(--text-muted)">'+f1(v)+'</span></div>';
 };
 var headroom=function(v,cap){
  var w=Math.max(1,Math.round(v/cap*100));
  return '<div style="height:6px;background:var(--surface-1);border-radius:3px;overflow:hidden;margin-top:5px">'+
   '<div style="height:6px;width:'+Math.min(100,w)+'%;background:var(--text-muted)"></div></div>';
 };
 var capLine=function(v){return ""};
 var fillBar=function(v,cap){
  var w=Math.max(1,Math.round(v/cap*100));
  return '<div style="height:6px;background:var(--surface-1);border-radius:3px;overflow:hidden;margin-top:4px">'+
   '<div style="height:6px;width:'+w+'%;background:var(--text-muted)"></div></div>';
 };
 var li=lostIn(d);
 var prod=d?d.prod:0, acc=d?d.acc:0, dem=d?d.dem:0, sold=d?d.sold:0, miss=d?d.missed:0;
 var stage=function(hot,inner,loss,note){
  var kids=[_h("div",{style:{padding:"5px 9px",borderLeft:"3px solid "+(hot?"var(--border-warning)":"transparent"),
    background:hot?"var(--bg-warning)":"transparent"},dangerouslySetInnerHTML:{__html:inner}})];
  if(note)kids.push(_h("div",{style:{padding:"1px 9px 3px 38px",fontSize:"11px"},dangerouslySetInnerHTML:{__html:note}}));
  if(loss)kids.push(_h("div",{style:{padding:"0 9px 4px 38px",fontSize:"11px",color:"var(--text-danger)"}},"└ "+loss));
  return kids;
 };
 var pipe=function(v){return d?_h("div",{dangerouslySetInnerHTML:{__html:conn(v)}}):null};
 var kids=[];
 kids=kids.concat(stage(d&&d.b==="supply",
   headLine("농가","생산",d?f1(prod)+"t":"—",d&&d.b==="supply","매입 "+mo(C.farm)+"원/t")+
   (d?splitBar(acc,prod-acc,"집하 "+f1(acc),"미집하 "+f1(prod-acc)):""),
   li?li.txt.replace(/^미집하 [\d.]+t · ?/,""):"",""));
 kids.push(pipe(acc));
 kids=kids.concat(stage(d&&d.b==="intake",
   headLine("집하","처리",d?f1(acc)+"t":"—",d&&d.b==="intake","한도 "+G.cap.i+"t"),"",recText("intake")));
 kids.push(pipe(acc));
 kids=kids.concat(stage(d&&(d.b==="store"||d.b==="stock"),
   headLine("창고","재고",f1(iv)+"t",d&&(d.b==="store"||d.b==="stock"),"용량 "+C.cap.st+"t")+fillBar(iv,G.cap.st),
   (d&&d.wT>C.ui.eps)?("보관 중 상함 "+f1(d.wT)+"t"):"",invNote()));
 kids.push(pipe(sold));
 kids=kids.concat(stage(d&&d.b==="ship",
   headLine("출하","판매",d?f1(sold)+"t":"—",d&&d.b==="ship","한도 "+G.cap.sh+"t"),"",recText("shipping")));
 kids.push(pipe(sold));
 kids=kids.concat(stage(d&&d.b==="demand",
   headLine("시장","수요",d?f1(dem)+"t":"—",d&&d.b==="demand","경락 "+mo(C.price)+"원/t")+
   (d?splitBar(sold,miss,"판매 "+f1(sold),"못 판 "+f1(miss)):""),"",""));
 return _h("div",{style:{border:"1px solid var(--border)",borderRadius:"var(--radius)",overflow:"hidden"}},kids);
}


function buyLogHtml(){
 if(!G.buylog.length)return '<div style="color:var(--text-muted);margin-top:12px">이번 판에는 아무것도 사지 않았다.</div>';
 var h='<div style="margin-top:14px;font-size:12px;color:var(--text-muted)">증설 기록</div>'+
  '<div style="display:grid;grid-template-columns:34px 34px 32px 48px 52px 42px 40px 52px;gap:4px;font-size:11px;padding:5px 0;border-bottom:0.5px solid var(--border);color:var(--text-muted)">'+
  ["일차","설비","순번","전망격차","반복제약","가동률","사용가능","경로"].map(function(x){return '<span>'+x+'</span>'}).join("")+'</div>';
 for(var i=0;i<G.buylog.length;i++){var b=G.buylog[i];
  h+='<div style="display:grid;grid-template-columns:34px 34px 32px 48px 52px 42px 40px 52px;gap:4px;font-size:12px;padding:4px 0;border-bottom:0.5px solid var(--border);color:var(--text-primary)">'+
   '<span>'+b.day+'</span><span>'+b.kind+'</span><span>'+b.nth+'회</span><span>'+(b.gap>=0?"+":"")+b.gap+'%p</span><span>'+b.hit+'일</span><span>'+b.util+'%</span><span>'+b.left+'일</span><span>'+b.path+'</span></div>';
 }
 h+='<button id="kcopy" style="width:100%;padding:9px;font-size:12px;margin-top:10px">기록 복사</button>'+
  '<textarea id="kdump" readonly style="width:100%;height:0;opacity:0;border:0;padding:0"></textarea>';
 return h;
}

function copyLog(){
 var lines=["seed "+G.seed+" 현금 "+Math.round(G.cash)+" 집하 "+G.buys.intake+"회 출하 "+G.buys.shipping,
  "일차\t설비\t순번\t전망격차\t반복제약\t가동률\t사용가능\t경로\t표기"];
 for(var i=0;i<G.buylog.length;i++){var b=G.buylog[i];
  lines.push(b.day+"\t"+b.kind+"\t"+b.nth+"\t"+(b.gap>=0?"+":"")+b.gap+"%p\t"+b.hit+"\t"+b.util+"%\t"+b.left+"\t"+b.path+"\t"+b.ui)}
 var txt=lines.join("\n");
 LASTDUMP=txt;
 try{if(navigator&&navigator.clipboard)navigator.clipboard.writeText(txt)}catch(e){}
 var ta=document.getElementById("kdump");
 if(ta){ta.style.height="120px";ta.style.opacity="1";ta.value=txt;
  try{ta.select();ta.setSelectionRange(0,txt.length);document.execCommand("copy")}catch(e){}}
 var b2=document.getElementById("kcopy");
 if(b2)b2.textContent="복사됨. 안 되면 아래 상자를 길게 눌러 선택한다";
}

function modCardHtml(){
 if(!G.mods.length)return "";
 var CONTRIB=modContrib();
 var h='<div style="font-size:12px;color:var(--text-muted);margin:0 0 6px">기여는 그 설비 하나만 빼고 30일을 다시 돌린 결과와의 차이다. 설비끼리 영향을 주므로 합계는 전체 차이와 다르다.</div>';
 for(var i=0;i<G.mods.length;i++){
  var m=G.mods[i], days=m.use.length;
  var lbl=(m.kind==="intake"?"집하 +"+C.step.intake:"판매 +"+C.step.shipping);
  if(days===0){
   h+='<div style="font-size:12px;color:var(--text-secondary);padding:3px 0">'+m.day+'일 '+lbl+' · 내일부터 작동</div>';
   continue;
  }
  var ex=(m.extra||0);
  var step=m.kind==="intake"?C.step.intake:C.step.shipping;
  var fill=ex/(days*step);
  var cost=C.cost[m.kind]+days*step*(m.kind==="intake"?C.maint.i:C.maint.sh);
  var contrib=CONTRIB?CONTRIB[i]:0;
  var verdict="이 증설의 기여";
  var zero=(G.over&&ex<0.05)?"추가 용량 사용 없음 · ":"";
  h+='<div style="font-size:12px;color:var(--text-secondary);padding:4px 0">'+
   m.day+'일 '+lbl+' · '+days+'일 보유<br>'+
   '<span style="padding-left:10px">추가 용량 사용 '+ex.toFixed(1)+'t (여력의 '+Math.round(fill*100)+'%) · '+
   '들인 돈 '+mo(cost)+' · '+
   '<span style="color:'+(contrib>=0?"var(--text-success)":"var(--text-warning)")+'">'+zero+verdict+' '+(contrib>=0?"+":"")+mo(contrib)+'</span></span></div>';
 }
 return h;
}

function matrixHtml(){
 var h=G.hist;
 if(h.length<2)return "";
 var days=h.slice(-C.ui.matrixDays);
 var FC=(!G.over&&G.day<=C.days)?3:0;
 var capW=function(v,cap){return v>=cap-0.05?"한도":(v>=cap*C.ui.nearCap?"근접":"여유")};
 var stW=function(v){var r=v/C.cap.st;return r>=C.ui.storeFull?"가득":(r>=C.ui.storeMid?"보통":"여유")};
 var SUP=["부족","평년","풍작"], DEM=["침체","정상","호황"];
 var EVW={intake:"집하",store:"창고",ship:"출하",stock:"재고"};
 var modOn={};
 for(var i=0;i<G.mods.length;i++)modOn[G.mods[i].day]=(G.mods[i].kind==="intake"?"집하":"판매");
 var evOn={};
 for(i=0;i<G.evlog.length;i++)evOn[G.evlog[i].day]=EVW[G.evlog[i].b]||"";
 var cw='min-width:32px;flex:1;text-align:center;font-size:11px';
 var left=Math.max(0,C.days-G.day+1);
 var out='<div style="font-size:11px;color:var(--text-muted);margin-bottom:4px">최근 '+days.length+'일 상태'+(FC?' · 오른쪽은 앞 3일 전망':'')+
  (G.over?'':' · 남은 '+left+'일')+'</div>';
 var hd='<div style="display:flex;gap:2px"><span style="width:26px;flex-shrink:0"></span>';
 for(i=0;i<days.length;i++)hd+='<span style="'+cw+';color:var(--text-muted)">'+days[i].day+'</span>';
 if(FC)for(i=1;i<=FC;i++)hd+='<span style="'+cw+';color:var(--text-muted)">+'+i+'</span>';
 out+=hd+'</div>';
 var mkRow=function(name,vals,fut,warnOf){
  var line='<div style="display:flex;gap:2px;padding:2px 0"><span style="width:26px;flex-shrink:0;font-size:11px;color:var(--text-secondary)">'+name+'</span>';
  for(var k=0;k<vals.length;k++){
   var w=warnOf?warnOf(vals[k]):false;
   var muted=(vals[k]==="없음");
   var col=w?"var(--text-warning)":(muted?"var(--text-muted)":"var(--text-primary)");
   var txt=muted?"·":vals[k];
   line+='<span style="'+cw+';color:'+col+';opacity:'+(muted?"0.45":"1")+'">'+txt+'</span>';
  }
  if(FC)for(k=0;k<FC;k++)line+='<span style="'+cw+';color:var(--text-muted)">'+(fut?fut[k]:"·")+'</span>';
  return line+'</div>';
 };
 var futPhase=function(idx,W){
  var a=[];
  for(var dd=1;dd<=FC;dd++){var v=blur(hor(idx,dd,dd));
   var b=0;for(var t2=1;t2<3;t2++)if(v[t2]>v[b])b=t2;a.push(W[b])}
  return a;
 };
 out+=mkRow("생산",days.map(function(r){return SUP[r.si]}),FC?futPhase(G.si,SUP):null,function(v){return v==="부족"});
 out+=mkRow("집하",days.map(function(r){return capW(r.acc,r.capI)}),null,function(v){return v==="한도"});
 out+=mkRow("창고",days.map(function(r){return stW(r.end)}),null,function(v){return v==="가득"});
 out+=mkRow("출하",days.map(function(r){return capW(r.sold,r.capS)}),null,function(v){return v==="한도"});
 out+=mkRow("수요",days.map(function(r){return DEM[r.di]}),FC?futPhase(G.di,DEM):null,function(v){return v==="침체"});
 out+=mkRow("사건",days.map(function(r){return evOn[r.day]||"없음"}),null,function(v){return v!=="없음"});
 out+=mkRow("증설",days.map(function(r){return modOn[r.day]||"없음"}),null,function(v){return false});
 return out;
}

function chartHtml(){
 var h=G.hist;
 if(h.length<3)return "";
 var FC=(!G.over&&G.day<=C.days)?3:0;
 var W=340,H=96,PAD=4,BH=22,GAP=6;
 var n=C.days;
 var lastDay=h[h.length-1].day;
 var domain=Math.max(8,Math.min(n,lastDay+FC));
 var x=function(day){return PAD+(day-1)/(domain-1)*(W-2*PAD)};
 var mx=1;
 for(var i=0;i<h.length;i++)mx=Math.max(mx,h[i].prod,h[i].sold);
 if(FC>0){
  var fmax=function(idx,means,noiseSd){
   var t=0;
   for(var dd=1;dd<=FC;dd++){
    var v=blur(hor(idx,dd,dd));
    var m=v[0]*means[0]+v[1]*means[1]+v[2]*means[2];
    var sdv=Math.sqrt(v[0]*Math.pow(means[0]-m,2)+v[1]*Math.pow(means[1]-m,2)+v[2]*Math.pow(means[2]-m,2))+noiseSd;
    t=Math.max(t,m+sdv);
   }
   return t;
  };
  mx=Math.max(mx,fmax(G.si,C.sm,C.sd),fmax(G.di,C.dm,C.dd));
 }
 var TOP=PAD+20;
 var y=function(v){return TOP+(1-v/mx)*(H-BH-GAP-PAD-TOP)};
 var poly=function(key,col,dash){
  var pts=h.map(function(r){return x(r.day).toFixed(1)+","+y(r[key]).toFixed(1)}).join(" ");
  return '<polyline points="'+pts+'" fill="none" stroke="'+col+'" stroke-width="1.6"'+(dash?' stroke-dasharray="3 2"':'')+' />';
 };
 var mxInv=1;
 for(i=0;i<h.length;i++)mxInv=Math.max(mxInv,h[i].end);
 var bars="";
 var bw=(W-2*PAD)/domain;
 for(i=0;i<h.length;i++){
  var hh=Math.max(1,h[i].end/Math.max(mxInv,C.cap.st)*BH);
  bars+='<rect x="'+(PAD+(h[i].day-1)*bw).toFixed(1)+'" y="'+(H-PAD-hh).toFixed(1)+'" width="'+Math.max(1.5,bw*0.8).toFixed(1)+'" height="'+hh.toFixed(1)+'" fill="var(--text-muted)" opacity="0.5" />';
 }
 var band="";
 if(FC>0){
  var xNow=x(Math.min(G.day-1,n));
  band+='<line x1="'+xNow.toFixed(1)+'" y1="'+PAD+'" x2="'+xNow.toFixed(1)+'" y2="'+(H-BH-GAP-PAD).toFixed(1)+'" stroke="var(--border-strong)" stroke-width="0.7" stroke-dasharray="2 2" />';
  var rng2=function(idx,means,noiseSd,col,dx,cap){
   var out="";
   for(var dd=1;dd<=FC;dd++){
    var v=blur(hor(idx,dd,dd));
    var m=v[0]*means[0]+v[1]*means[1]+v[2]*means[2];
    var sdv=Math.sqrt(v[0]*Math.pow(means[0]-m,2)+v[1]*Math.pow(means[1]-m,2)+v[2]*Math.pow(means[2]-m,2))+noiseSd;
    var px=x(Math.min(n,G.day-1+dd))+dx;
    var y1=y(m+sdv), y2=y(Math.max(0,m-sdv));
    out+='<line x1="'+px.toFixed(1)+'" y1="'+y1.toFixed(1)+'" x2="'+px.toFixed(1)+'" y2="'+y2.toFixed(1)+'" stroke="'+col+'" stroke-width="1.4" opacity="0.8" />';
    out+='<line x1="'+(px-2.5).toFixed(1)+'" y1="'+y1.toFixed(1)+'" x2="'+(px+2.5).toFixed(1)+'" y2="'+y1.toFixed(1)+'" stroke="'+col+'" stroke-width="1" opacity="0.8" />';
    out+='<line x1="'+(px-2.5).toFixed(1)+'" y1="'+y2.toFixed(1)+'" x2="'+(px+2.5).toFixed(1)+'" y2="'+y2.toFixed(1)+'" stroke="'+col+'" stroke-width="1" opacity="0.8" />';
   }
   return out;
  };
  var dirWord=function(idx){
   var v=blur(hor(idx,1,3)), g=Math.round((v[2]-v[0])*100);
   return g>=10?"증가":g<=-10?"하락":"보합";
  };
  var lx=x(Math.min(n,G.day))+6;
  band+='<text x="'+lx.toFixed(1)+'" y="'+(PAD+7)+'" font-size="7.5" fill="var(--text-primary)">생산 '+dirWord(G.si)+'</text>';
  band+='<text x="'+lx.toFixed(1)+'" y="'+(PAD+16)+'" font-size="7.5" fill="var(--text-secondary)">수요 '+dirWord(G.di)+'</text>';
  band+=rng2(G.si,C.sm,C.sd,"var(--text-primary)",-3);
  band+=rng2(G.di,C.dm,C.dd,"var(--text-secondary)",3);
 }
 var marks="";
 for(i=0;i<G.evlog.length;i++){
  var ex=x(G.evlog[i].day);
  var b=G.evlog[i].b;
  var lane=(b==="intake")?0.22:(b==="store"||b==="stock")?0.5:0.78;
  var ey=PAD+lane*(H-BH-GAP-2*PAD);
  marks+='<circle cx="'+ex.toFixed(1)+'" cy="'+ey.toFixed(1)+'" r="2.2" fill="var(--text-warning)" />';
 }
 var ctb=G.over?(modContrib()||[]):null;
 var labels="";
 for(i=0;i<G.mods.length;i++){
  var m=G.mods[i], bx=x(m.day);
  var col=ctb?(ctb[i]>=0?"var(--text-success)":"var(--text-warning)"):"var(--text-primary)";
  marks+='<rect x="'+(bx-2.5).toFixed(1)+'" y="'+(PAD+1)+'" width="5" height="5" transform="rotate(45 '+bx.toFixed(1)+' '+(PAD+3.5)+')" fill="'+col+'" />';
  marks+='<line x1="'+bx.toFixed(1)+'" y1="'+(PAD+6)+'" x2="'+bx.toFixed(1)+'" y2="'+(H-PAD)+'" stroke="'+col+'" stroke-width="0.5" opacity="0.4" />';
  if(ctb){
   var ly=(i%2===0)?(PAD+9):(PAD+18);
   var anc="middle", lx=bx;
   if(bx<28){anc="start";lx=PAD}
   else if(bx>W-28){anc="end";lx=W-PAD}
   labels+='<text x="'+lx.toFixed(1)+'" y="'+ly+'" font-size="7.5" fill="'+col+'" text-anchor="'+anc+'">'+(ctb[i]>=0?"+":"")+ctb[i]+'</text>';
  }
 }
 return '<div style="font-size:11px;color:var(--text-muted);margin-bottom:4px">'+
   '<span style="color:var(--text-primary)">━</span> 생산 · '+
   '<span style="color:var(--text-secondary)">╌</span> 판매 · '+
   '<span style="color:var(--text-muted)">▮</span> 재고 · '+
   '<span style="color:var(--text-warning)">●</span> 사건(위 유입·중간 창고·아래 유출) · ◆ 증설'+(FC>0?' · 오른쪽은 앞으로 3일 가능 범위':'')+'</div>'+
  '<svg viewBox="0 0 '+W+' '+H+'" style="width:100%;height:auto;display:block">'+
   bars+band+poly("prod","var(--text-primary)",false)+poly("sold","var(--text-secondary)",true)+marks+labels+
  '</svg>'+
  '<div style="display:flex;justify-content:space-between;font-size:10px;color:var(--text-muted)"><span>1일</span><span>'+domain+'일</span></div>';
}

function timelineHtml(){
 if(!G.timeline.length)return "";
 var byDay={};
 for(var i=0;i<G.timeline.length;i++){
  var t=G.timeline[i];
  if(t.type==="auto"){
   var key="a"+t.day;
   byDay[key]={sort:t.day,kind:"auto",text:t.text};
  }else{
   var k2="d"+t.day;
   if(!byDay[k2])byDay[k2]={sort:t.day+0.5,kind:"day",day:t.day,ev:[],act:[]};
   if(t.type==="event")byDay[k2].ev.push(t.text);
   else byDay[k2].act.push(t.text);
  }
 }
 var arr=[];
 for(var kk in byDay)arr.push(byDay[kk]);
 arr.sort(function(a,b){return a.sort-b.sort});
 var h='<div style="font-size:12px;color:var(--text-muted);margin-bottom:6px">진행 기록</div>';
 h='<div style="font-size:12px;line-height:1.7">'+h;
 for(var j=0;j<arr.length;j++){
  var r=arr[j];
  if(r.kind==="auto"){
   h+='<div style="color:var(--text-muted);padding:3px 0">'+r.text+'</div>';
   continue;
  }
  var parts=[];
  if(r.ev.length)parts.push('<span style="color:var(--text-warning)">'+r.ev.join(", ")+'</span>');
  if(r.act.length)parts.push('<span style="color:var(--text-primary)">'+r.act.join(", ")+'</span>');
  h+='<div style="display:flex;gap:8px;padding:3px 0">'+
   '<span style="width:34px;color:var(--text-secondary);flex-shrink:0">'+r.day+'일</span>'+
   '<span style="flex:1">'+parts.join(' → ')+'</span></div>';
 }
 return h+'</div>';
}

function logHtml(rows){
 return rows.length?
  '<div style="display:grid;grid-template-columns:repeat(8,minmax(0,1fr));gap:3px;padding:4px 0;border-bottom:0.5px solid var(--border)">'+
  ["일차","생산","수요","판매","미집하","상함","못판수요","손익"].map(function(h,i){return '<span style="text-align:'+(i?"right":"left")+'">'+h+'</span>'}).join("")+'</div>'+
  rows.map(function(r){return '<div style="display:grid;grid-template-columns:repeat(8,minmax(0,1fr));gap:3px;padding:3px 0;border-bottom:0.5px solid var(--border);color:var(--text-primary)">'+
   '<span>'+r.day+'</span><span style="text-align:right">'+f1(r.prod)+'</span><span style="text-align:right">'+f1(r.dem)+'</span>'+
   '<span style="text-align:right">'+f1(r.sold)+'</span>'+
   '<span style="text-align:right">'+f1(r.wI+r.wS)+'</span>'+
   '<span style="text-align:right">'+f1(r.wT)+'</span>'+
   '<span style="text-align:right">'+f1(r.missed)+'</span>'+
   '<span style="text-align:right;color:'+(r.profit>=0?"var(--text-success)":"var(--text-danger)")+'">'+mo(r.profit)+'</span></div>'}).join(""):
  '<div style="color:var(--text-muted)">하루를 운영하면 결과가 쌓인다.</div>';
}

function lblOf(k){return k==="intake"?"집하 +"+C.step.intake:"판매 +"+C.step.shipping}

function optionText(o){
 return{
  past:o.window<3?("관측 "+o.window+"일"):(o.hits>0?(o.hits+"/"+o.window+"일"):(o.lastHit?"어제만":"없음")),
  usable:o.usable+"일",
  payback:o.payback===null?"—":(o.payback.toFixed(1)+"일")
 };
}

function ord(k){for(var i=0;i<QUEUE.length;i++)if(QUEUE[i].kind===k)return i+1;return 0}

function queued(k){
 for(var i=0;i<QUEUE.length;i++)if(QUEUE[i].kind===k)return true;
 return false;
}


var h=(location.hash||"").match(/seed=(\d+)/);
reset(h?parseInt(h[1],10):Math.floor(Math.random()*99999)+1);
paint();
})();

