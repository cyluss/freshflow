

(function(){
var C={days:30,cash:60000,sm:[14,20,27],sd:2,dm:[10,20,32],dd:2,stay:0.8,
cap:{i:20,st:30,sh:21},step:{intake:2,shipping:1},cost:{intake:1500,shipping:412},
maint:{i:20,st:8,sh:25},ttl:10,q:[1,1,1,1,.8,.8,.8,.5,.5,.5],
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

function reset(seed){PREVPCT={};PENDPCT={};G={rng:new Rng(seed),seed:seed,si:1,di:1,day:1,cash:C.cash,lots:[],
cap:{i:C.cap.i,st:C.cap.st,sh:C.cap.sh},pend:null,hist:[],over:false,
buys:{intake:0,shipping:0},spent:0,mods:[],events:[],lastBuyI:0,lastBuyS:0,uiSwitched:false,salvaged:0,bust:false,timeline:[],prevB:"none",evlog:[],autoFrom:1,autoCash:0,event:null,buylog:[],phase:{intake:{dir:0,n:0},shipping:{dir:0,n:0}}};
G.si=move(G.si);G.di=move(G.di);pick="none";QUEUE=[];render()}

function stepDay(act){
 if(G.over)return;
 if(G.pend){G.cap[KEY[G.pend]]+=C.step[G.pend];G.pend=null}
 var ic=0;
 var prev=G.hist[G.hist.length-1]||null;
 var atCapI=prev?prev.acc>=G.cap.i-0.05:false;
 var atCapS=prev?prev.sold>=G.cap.sh-0.05:false;
 if(act!=="none"&&G.cash>=C.cost[act]){ic=C.cost[act];G.cash-=ic;G.pend=act;G.buys[act]++;G.spent+=ic;
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
   ui:LAYOUT==="rows"?"행분리":"압축",
   path:PENDPATH||"직접",
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
 for(var i=0;i<G.lots.length&&rem>1e-9;i++){var take=Math.min(G.lots[i].q,rem);G.lots[i].q-=take;rem-=take;
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
  missed:Math.max(0,dem-sold),wI:wI,wIcap:byCap,wIstore:byStore,wIneed:byNeed,wS:wS,wT:wT,end:end,profit:profit-ic,b:b,si:G.si,di:G.di,capI:G.cap.i,capS:G.cap.sh});
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
 G.event=(actionable&&changed)?{b:b}:null;
 if(G.event)G.evlog.push({day:G.day,b:b});
 G.day++;
 G.si=move(G.si);G.di=move(G.di);
 if(G.cash<=0){G.bust=true;G.over=true}
 else if(G.day>C.days){
  if(!G.over){G.salvaged=Math.round(G.spent*C.salvage);G.cash+=G.salvaged}
  G.over=true;
 }
}

var OPEN={},SHOWCMP=false,VIEW="brief",FULLOPENS=[],LAYOUT="rows",QUEUE=[],MANUAL=false,PENDPATH="";
function setView(v){
 if(v==="full"&&VIEW!=="full")FULLOPENS.push({day:G?G.day:1,at:Date.now()});
 VIEW=v;
 var list=document.querySelectorAll(".dtl");
 for(var i=0;i<list.length;i++)list[i].style.display=(v==="full")?"":"none";
 var a=document.getElementById("kv1"),b=document.getElementById("kv2");
 a.style.borderColor=v==="brief"?"var(--border-accent)":"var(--border-strong)";
 b.style.borderColor=v==="full"?"var(--border-accent)":"var(--border-strong)";
 render()}

function line(label,value,note){
 return '<div style="display:flex;justify-content:space-between;align-items:baseline;gap:12px;padding:5px 0">'+
 '<span style="font-size:12px;color:var(--text-secondary);min-width:76px">'+label+'</span>'+
 '<span style="font-size:14px;color:var(--text-primary);flex:1">'+value+'</span>'+
 '<span style="font-size:11px;color:var(--text-muted);text-align:right">'+(note||"")+'</span></div>';
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

function hitText(h,word){
 if(h.len<3)return "관측 "+h.len+"일";
 return h.n+"/"+h.len+"일 "+word;
}

function dirOf(g){return g>=10?1:g<=-10?-1:0}

function phaseSync(gapI,gapS){
 var pairs=[["intake",gapI],["shipping",gapS]];
 for(var i=0;i<pairs.length;i++){
  var k=pairs[i][0],d=dirOf(pairs[i][1]),ph=G.phase[k];
  if(d!==ph.dir){ph.dir=d;ph.n=0}
 }
}

function p1(h){return h.len===0?"관측 없음":(h.last?"막힘":"여유")}
function p2(h){return h.len<3?("관측 "+h.len+"일뿐"):(h.n+"/"+h.len+"일")}


function renderChoice(u3,hI,hS){
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
 if(LAYOUT==="rows"){
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
  var grp=(LAYOUT==="rows"&&(r===1||r===2))||(LAYOUT==="compact"&&(r===0||r===1));
  var bb=last?"none":(grp?"0.5px solid var(--border-strong)":"0.5px solid var(--border)");
  html+='<div style="padding:7px 8px;font-size:11px;color:var(--text-secondary);border-bottom:'+bb+'">'+rows[r][0]+'</div>';
  for(var c=0;c<2;c++){
   html+='<div style="padding:7px 6px;text-align:center;font-size:12px;border-bottom:'+bb+';border-left:0.5px solid var(--border);background:'+cellBg(keys[c])+';color:'+cellFg(keys[c])+'">'+rows[r][c+2]+'</div>';
  }
 }
 html+='</div>';
 var box=document.getElementById("kchoice");
 box.innerHTML=html;
 box.style.borderColor=QUEUE.length?"var(--border-accent)":"var(--border)";
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

function hindsight(){
 var base=replay(G.seed,0,0),best={i:0,s:0,v:base};
 for(var i=0;i<=4;i++)for(var s2=0;s2<=5;s2++){
  var v=replay(G.seed,i,s2);
  if(v>best.v)best={i:i,s:s2,v:v};
 }
 return{base:base,best:best,mine:replay(G.seed,G.buys.intake,G.buys.shipping)};
}

function fold(id,title,body){
 var open=OPEN[id]?"":"none";
 return '<div style="border-top:0.5px solid var(--border);margin-top:10px;padding-top:8px">'+
  '<div data-fold="'+id+'" style="cursor:pointer;font-size:12px;color:var(--text-secondary)">'+
   (OPEN[id]?"▾ ":"▸ ")+title+'</div>'+
  '<div style="display:'+open+';margin-top:6px">'+body+'</div></div>';
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

function missedBrief(){
 var m=missedOps();
 var pos=m.filter(function(x){return x.gain>0});
 if(!pos.length)return '<div style="border-top:0.5px solid var(--border);margin:10px 0 6px;padding-top:8px">'+
  line("놓친 기회","없음","어느 날 더 사도 현금이 늘지 않았다")+'</div>';
 var top=pos[0];
 var near=pos.filter(function(x){return x.kind===top.kind&&x.gain>=top.gain*0.9});
 var days=near.map(function(x){return x.day}).sort(function(a,b){return a-b});
 var lbl=top.kind==="intake"?"집하 +"+C.step.intake:"판매 +"+C.step.shipping;
 var span=days.length>1?("이 계획에 "+days[0]+"~"+days[days.length-1]+"일 중 하루 추가했다면 비슷하게 유리했다"):"이 계획에 이날 추가했다면 가장 유리했다";
 return '<div style="border-top:0.5px solid var(--border);margin:10px 0 6px;padding-top:8px">'+
  line("놓친 기회",top.day+"일 "+lbl,"+"+mo(top.gain))+
  '<div style="font-size:12px;color:var(--text-secondary);padding-left:2px">'+span+'</div></div>';
}

function missedHtml(){
 var m=missedOps();
 var top=m.filter(function(x){return x.gain>0}).slice(0,3);
 var head='<div style="font-size:12px;color:var(--text-muted);margin-bottom:4px">놓친 기회 · 지금 계획에 그날 한 건만 더했을 때의 현금 차이</div>';
 if(!top.length)return head+'<div style="font-size:12px;color:var(--text-secondary)">어느 날 무엇을 더 사도 현금이 늘지 않았다.</div>';
 var h=head;
 for(var i=0;i<top.length;i++){
  var t=top[i];
  h+='<div style="display:flex;justify-content:space-between;padding:3px 0;font-size:13px">'+
   '<span style="color:var(--text-secondary)">'+t.day+'일 '+(t.kind==="intake"?"집하 +"+C.step.intake:"판매 +"+C.step.shipping)+'</span>'+
   '<span style="color:var(--text-success)">+'+mo(t.gain)+'</span></div>';
 }
 return h;
}

function contribSummary(){
 if(!G.mods.length)return "";
 var c=modContrib()||[];
 var out='<div style="border-top:0.5px solid var(--border);margin:10px 0 6px;padding-top:8px">'+
  '<div style="font-size:12px;color:var(--text-muted);margin-bottom:4px">투자 결과</div>';
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

 var head='<div style="font-size:13px;color:var(--text-secondary);margin-bottom:8px">'+
  (G.bust?"현금이 바닥나 운영이 중단됐다":"30일 운영이 끝났다")+'</div>'+
  line("최종 현금",mo(G.cash),"시드 "+G.seed)+
  line("무투자 대비",(mine>=0?"+":"")+mo(mine),"내 투자 묶음의 효과")+
  '<div style="border-top:0.5px solid var(--border);margin:10px 0 8px"></div>'+
  line("내 결정",(G.buys.intake+G.buys.shipping===0)?"증설 없음":("집하 "+G.buys.intake+"회 / 판매 "+G.buys.shipping+"회"),mo(G.spent)+" 투입")+
  line("사후 기준 대비",(mine-opt>=0?"+":"")+mo(mine-opt),"기준 집하 "+h.best.i+"회 / 판매 "+h.best.s+"회")+
  contribSummary()+missedBrief();

 var ops=line("최종 재고",f1(iv2)+" t","저장 "+G.cap.st+" t")+
  line("최종 용량","집하 "+G.cap.i+" / 판매 "+G.cap.sh,"시작 20 / 21")+
  line("총 투자비",mo(G.spent),G.buys.intake+G.buys.shipping+"회")+
  line("종료 시 처분가치",mo(G.salvaged||0),"취득비의 "+Math.round(C.salvage*100)+"%")+
  line("집하 평균 가동",u.i.toFixed(0)+"%","30일 기준")+
  line("판매 평균 가동",u.sh.toFixed(0)+"%","30일 기준")+
  line("수요 국면",cnt(1,0)+"일 침체, "+cnt(1,1)+"일 정상, "+cnt(1,2)+"일 호황","")+
  line("생산 국면",cnt(0,0)+"일 부족, "+cnt(0,1)+"일 평년, "+cnt(0,2)+"일 풍작","")+
  '<div style="margin-top:8px;font-size:12px;color:var(--text-secondary)">'+worldNote()+'</div>';

 return head+
  fold("ops","운영 상세",ops)+
  fold("miss","놓친 기회 전체",missedHtml())+
  fold("mods","증설별 성적",modCardHtml()||'<div style="font-size:12px;color:var(--text-muted)">이번 판은 증설이 없었다.</div>')+
  fold("log","전체 기록",'<div style="font-size:12px;color:var(--text-muted)">아래 진행 기록과 일별 표를 참고한다.</div>')+
  '<div style="margin-top:8px;font-size:11px;color:var(--text-muted)">사후 기준은 30일을 모두 안다고 가정하고 증설 횟수만 비교한다. 매수 시점은 이틀 간격으로 고정했다.</div>';
}

function cnt(axis,val){
 var k=axis===0?"si":"di",n=0;
 for(var i=0;i<G.hist.length;i++)if(G.hist[i][k]===val)n++;
 return n;
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

function summarize(sv,dv){
 var su=sv[2]-sv[0],du=dv[2]-dv[0];
 var st=su>10?"생산은 늘어날 쪽":su<-10?"생산은 줄어들 쪽":"생산은 방향이 뚜렷하지 않음";
 var dt=du>10?"수요는 늘어날 쪽":du<-10?"수요는 줄어들 쪽":"수요는 방향이 뚜렷하지 않음";
 return st+", "+dt+"이다.";
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

function bars(el,lab,vals,names){
 el.innerHTML=vals.map(function(v,i){return '<div style="width:'+v+'%;background:'+RAMP[i]+';color:'+TINT[i]+';display:flex;align-items:center;justify-content:center;font-size:11px">'+(v>=12?v:"")+'</div>'}).join("");
 lab.innerHTML=names.map(function(n,i){return '<span>'+n+' '+vals[i]+'%</span>'}).join("");
}

function node(name,val,sub,hot,loss){
 return '<div style="border:0.5px solid '+(hot?"var(--border-warning)":"var(--border)")+';background:'+(hot?"var(--bg-warning)":"transparent")+';border-radius:var(--radius);padding:8px 6px;text-align:center">'+
 '<div style="font-size:11px;color:var(--text-secondary)">'+name+'</div>'+
 '<div style="font-size:16px;font-weight:500;margin:3px 0;color:'+(hot?"var(--text-warning)":"var(--text-primary)")+'">'+val+'</div>'+
 '<div style="font-size:11px;color:var(--text-secondary);min-height:15px">'+sub+'</div>'+
 '<div style="font-size:11px;color:var(--text-danger);min-height:15px">'+(loss||"")+'</div></div>';
}

function render(){
 var d=G.hist.length?G.hist[G.hist.length-1]:null;
 document.getElementById("kd").textContent=Math.min(G.day,C.days);
 document.getElementById("kc").textContent=mo(G.cash);
 document.getElementById("ks").textContent=G.seed;
 var pe=document.getElementById("kp");
 pe.textContent=d?mo(d.profit):"—";
 pe.style.color=d?(d.profit>=0?"var(--text-success)":"var(--text-danger)"):"var(--text-primary)";
 bars(document.getElementById("kfs"),document.getElementById("kfsl"),pct(blur(hor(G.si,4,7))),["부족","평년","풍작"]);
 bars(document.getElementById("kfd"),document.getElementById("kfdl"),pct(blur(hor(G.di,4,7))),["침체","정상","호황"]);
 var iv=inv();
 document.getElementById("kinv").textContent=f1(iv);
 var rec=G.hist.slice(-3),dr=rec.length?rec.reduce(function(a,x){return a+x.acc-x.sold},0)/rec.length:0;
 var de=document.getElementById("kdr");
 de.textContent=(dr>=0?"+":"")+f1(dr)+" t/day";
 de.style.color="var(--text-primary)";
  document.getElementById("kdrlabel").textContent=dr>0.25?"최근 3일: 재고가 쌓이는 중":dr<-0.25?"최근 3일: 재고가 줄어드는 중":"최근 3일: 재고가 대체로 유지됨";
 var bk=[0,0,0];
 G.lots.forEach(function(l){var r=C.ttl-l.a;if(r>=7)bk[0]+=l.q;else if(r>=3)bk[1]+=l.q;else bk[2]+=l.q});
 document.getElementById("kttl").innerHTML=["잔여 7일 이상","잔여 3일에서 6일","잔여 2일 이하"].map(function(n,i){
  return '<div style="display:flex;justify-content:space-between;padding:2px 0"><span>'+n+'</span><span style="color:var(--text-primary)">'+f1(bk[i])+' t</span></div>'}).join("");
 document.getElementById("kylabel").textContent=d?(d.day+"일 결과"):"운영 시작 전";
 var wtot=d?(d.wI+d.wS+d.wT):0;
 var wtxt="";
 var wsub="";
 document.getElementById("kbn").innerHTML=G.over?(G.bust?"현금이 바닥났다":"30일이 끝났다"):(d?('<span style="font-size:12px;color:var(--text-muted)">가장 의심되는 제약</span><br><span style="color:var(--text-warning)">'+BL[d.b].replace("어제 ","")+'</span><br><span style="font-size:12px;color:var(--text-secondary)">'+causeLine(dr,d)+'</span>'):"아직 관측이 없다");
 var lostIn=function(x){
  if(!x)return null;
  var tot=x.wI+x.wS;
  if(tot<0.05)return null;
  var byStore=x.wIstore+x.wS, parts=[];
  if(x.wIcap>0.05)parts.push("한도 "+f1(x.wIcap));
  if(byStore>0.05)parts.push("창고 부족 "+f1(byStore));
  if(x.wIneed>0.05)parts.push("필요 없음 "+f1(x.wIneed));
  return{amt:tot,txt:"미집하 "+f1(tot)+"t"+(parts.length?" · "+parts.join(" / "):"")};
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
  return '<div style="padding:9px 10px;border-left:3px solid '+(hot?"var(--border-warning)":"transparent")+
   ';background:'+(hot?"var(--bg-warning)":"transparent")+'">'+body+'</div>'+
   (noteTxt?'<div style="padding:0 10px 4px 44px;font-size:12px">'+noteTxt+'</div>':"")+
   (lossTxt?'<div style="padding:0 10px 6px 44px;font-size:12px;color:var(--text-danger)">└ '+lossTxt+'</div>':"")+
   '<div style="padding-left:22px;color:var(--text-muted);font-size:11px;line-height:1">│</div>';
 };
 var headLine=function(name,label,val,hot){
  return '<div style="display:flex;align-items:baseline;gap:10px">'+
   '<span style="width:34px;font-size:13px;color:'+(hot?"var(--text-warning)":"var(--text-secondary)")+'">'+name+'</span>'+
   '<span style="width:34px;font-size:11px;color:var(--text-muted)">'+label+'</span>'+
   '<span style="flex:1;text-align:right;font-size:19px;font-weight:500;color:'+(hot?"var(--text-warning)":"var(--text-primary)")+'">'+val+'</span></div>';
 };
 var splitBar=function(a,b,la,lb){
  var t=a+b; if(t<=0)t=1;
  var pa=Math.round(a/t*100);
  return '<div style="display:flex;height:16px;border-radius:3px;overflow:hidden;margin-top:6px;font-size:10px;line-height:16px">'+
   '<div style="width:'+pa+'%;background:var(--border-strong);color:var(--text-primary);text-align:center;white-space:nowrap;overflow:hidden">'+(pa>=22?la:"")+'</div>'+
   '<div style="width:'+(100-pa)+'%;background:var(--bg-danger,#3a1f1f);color:var(--text-danger);text-align:center;white-space:nowrap;overflow:hidden">'+(100-pa>=22?lb:"")+'</div></div>';
 };
 var capLine=function(v){return '<div style="padding-left:78px;font-size:12px;color:var(--text-muted);margin-top:2px">한도 '+v+'t</div>'};
 var fillBar=function(v,cap){
  var w=Math.max(1,Math.round(v/cap*100));
  return '<div style="height:8px;background:var(--surface-1);border-radius:4px;overflow:hidden;margin-top:6px">'+
   '<div style="height:8px;width:'+w+'%;background:var(--text-muted)"></div></div>';
 };
 var li=lostIn(d);
 var prod=d?d.prod:0, acc=d?d.acc:0, dem=d?d.dem:0, sold=d?d.sold:0, miss=d?d.missed:0;
 var html='<div style="border:0.5px solid var(--border);border-radius:var(--radius);overflow:hidden">';
 html+=row("농가",headLine("농가","생산",d?f1(prod)+"t":"—",d&&d.b==="supply")+
   (d?splitBar(acc,prod-acc,"집하 "+f1(acc),"미집하 "+f1(prod-acc)):""),
   d&&d.b==="supply",li?li.txt.replace(/^미집하 [\d.]+t · ?/,""):"","");
 html+=row("집하",headLine("집하","처리",d?f1(acc)+"t":"—",d&&d.b==="intake")+capLine(G.cap.i),
   d&&d.b==="intake","",recText("intake"));
 html+=row("창고",headLine("창고","재고",f1(iv)+"t",d&&(d.b==="store"||d.b==="stock"))+
   '<div style="padding-left:78px;font-size:12px;color:var(--text-muted);margin-top:2px">용량 '+G.cap.st+'t</div>'+fillBar(iv,G.cap.st),
   d&&(d.b==="store"||d.b==="stock"),(d&&d.wT>0.05)?("보관 중 상함 "+f1(d.wT)+"t"):"","");
 html+=row("출하",headLine("출하","판매",d?f1(sold)+"t":"—",d&&d.b==="ship")+capLine(G.cap.sh),
   d&&d.b==="ship","",recText("shipping"));
 html+='<div style="padding:9px 10px;border-left:3px solid '+(d&&d.b==="demand"?"var(--border-warning)":"transparent")+
   ';background:'+(d&&d.b==="demand"?"var(--bg-warning)":"transparent")+'">'+
   headLine("시장","수요",d?f1(dem)+"t":"—",d&&d.b==="demand")+
   (d?splitBar(sold,miss,"판매 "+f1(sold),"못 판 "+f1(miss)):"")+'</div>';
 document.getElementById("kchain").innerHTML=html+'</div>';
 var go=document.getElementById("kgo");
 go.textContent=G.over?"새 게임":(G.hist.length===0?"탐색 기간 시작":(G.event?"계속 운영":C.autoMax+"일 더 운영"));
 go.style.borderColor=G.over?"var(--border-accent)":"var(--border-strong)";
 document.getElementById("khint").textContent=(G.hist.length===0)?"":G.pend?("어제 산 설비가 내일 적용된다: "+(G.pend==="intake"?"집하":"출하")):"오늘 산 설비는 내일부터 작동한다.";
 var sv=pct(blur(hor(G.si,4,7))),dv=pct(blur(hor(G.di,4,7)));
 var sum=summarize(sv,dv);
 var kf=document.getElementById("kfsum");
 if(kf)kf.textContent=sum;
 var dirTxt=dr>0.25?"쌓이는 중":dr<-0.25?"줄어드는 중":"대체로 유지";
 if(G.over){
  document.getElementById("kbrief").style.display="";
  document.getElementById("kbrief").innerHTML=endCard();
  var fs=document.getElementById("kbrief").querySelectorAll("[data-fold]");
  for(var fi=0;fi<fs.length;fi++)fs[fi].onclick=(function(k){return function(){OPEN[k]=!OPEN[k];render()}})(fs[fi].getAttribute("data-fold"));
  document.getElementById("klabel").textContent="운영 종료";
  document.getElementById("kchoice").style.display="none";
  document.getElementById("kacts").style.display="none";
  document.getElementById("kpend").style.display="none";
  document.getElementById("khint").textContent="";
  var kdt=document.getElementById("kdetail");
  kdt.style.display=VIEW==="full"?"none":"";
  var kg=document.getElementById("kgo");
  kg.textContent="새 게임";
  kg.style.borderColor="var(--border-accent)";
  document.getElementById("kfcsec").style.display="none";
  document.getElementById("kfclabel").style.display="none";
  document.getElementById("kspark").innerHTML=sparkHtml();
 document.getElementById("kmods").innerHTML=modCardHtml();
  document.getElementById("ktimeline").innerHTML=timelineHtml();
  document.getElementById("ktimeline").style.display="";
  var rowsE=G.hist.slice(-6).reverse();
  renderLog(rowsE);
  var lg=document.getElementById("klog");
  lg.innerHTML=lg.innerHTML+buyLogHtml();
  var cb=document.getElementById("kcopy");if(cb)cb.onclick=copyLog;
  lg.style.display="";
  return;
 }
 document.getElementById("kbrief").style.display="none";
 var au=document.getElementById("kauto");
 var span=G.day-1-G.autoFrom;
 if(G.hist.length>0&&span>=1){
  au.style.display="";
  au.textContent=G.autoFrom+"~"+(G.day-1)+"일 자동 운영 · 현금 "+(G.autoCash>=0?"+":"")+mo(G.autoCash);
 }else au.style.display="none";
 var ev=G.event;
 var started0=G.hist.length>0;
 var EV={intake:"집하 한도 도달",store:"창고 여유 없음",ship:"판매 한도 도달",stock:"판매할 재고 소진"};
 var evTxt=!started0?"탐색 기간 · 아직 관측이 없다":ev?EV[ev.b]:"특이사항 없이 운영 중";
 document.getElementById("klabel").textContent=(VIEW==="full"?evTxt+" · ":"")+"남은 "+(C.days-G.day+1)+"일";
 var started=G.hist.length>0;
 var ex=document.getElementById("kexplore");
 if(!started){
  ex.style.display="";
  ex.innerHTML='<div style="font-size:13px;color:var(--text-primary);margin-bottom:6px">탐색 기간</div>'+
   '<div style="font-size:12px;color:var(--text-secondary);line-height:1.6">아직 운영 기록이 없다.<br>먼저 하루를 운영해 생산과 수요와 재고 흐름을 관측한다.<br>첫 운영 결과부터 설비를 관리할 수 있다.</div>';
 }else ex.style.display="none";
 var isEvent=!!G.event, openDec=started&&(isEvent||MANUAL||QUEUE.length>0);
 document.getElementById("kchoice").style.display=(openDec&&(VIEW==="full"||SHOWCMP))?"":"none";
 var cb=document.getElementById("kcmp");
 cb.style.display=(openDec&&VIEW!=="full")?"":"none";
 cb.textContent=SHOWCMP?"비교 근거 접기":"비교 근거 보기";
 cb.onclick=function(){SHOWCMP=!SHOWCMP;render()};
 document.getElementById("kacts").style.display=openDec?"grid":"none";
 document.getElementById("kpend").style.display=openDec?"":"none";
 var ko=document.getElementById("kopen");
 ko.style.display=(started&&!isEvent&&!openDec)?"":"none";
 ko.textContent="설비 관리";
 ko.style.border="0.5px solid var(--border-strong)";
 ko.style.background="transparent";
 ko.style.color="var(--text-secondary)";
 ko.style.fontSize="13px";
 ko.style.padding="10px 8px";
 ko.style.borderRadius="var(--radius)";
 ko.onclick=function(){MANUAL=true;render()};
 var vis=VIEW==="full"?"":"none";
 document.getElementById("kfcsec").style.display=vis;
 document.getElementById("kfclabel").style.display=vis;
 document.getElementById("kdetail").style.display="none";
 var kw=document.getElementById("kbw");
 kw.innerHTML='관망<br><span style="font-size:11px;color:var(--text-secondary)">0</span>';
 kw.style.borderColor=QUEUE.length?"var(--border-strong)":"var(--border-accent)";
 kw.style.background="transparent";
 kw.onclick=function(){if(G.over)return;QUEUE=[];render()};
 var acts=[["kbi","intake","집하 +"+C.step.intake],["kbs","shipping","판매 +"+C.step.shipping]];
 for(var ai=0;ai<acts.length;ai++){
  var b=document.getElementById(acts[ai][0]),kk=acts[ai][1],on=queued(kk);
  var o=ord(kk);
  b.innerHTML=on?('<b>'+o+'순위</b> '+acts[ai][2]+'<br><span style="font-size:11px;color:var(--text-secondary)">취소하려면 다시</span>')
   :(acts[ai][2]+'<br><span style="font-size:11px;color:var(--text-secondary)">'+mo(C.cost[kk])+'<br>'+hintOf(kk)+'</span>');
  b.style.opacity="1";
  b.style.borderColor=on?"var(--border-accent)":"var(--border-strong)";
  b.style.background="transparent";
  b.style.opacity=(G.cash>=C.cost[kk]||on)?"1":"0.4";
  b.onclick=(function(k){return function(){
   if(G.over)return;
   if(queued(k)){QUEUE=QUEUE.filter(function(q){return q.kind!==k});render();return}
   if(G.cash<C.cost[k])return;
   QUEUE.push({kind:k,path:G.event?"사건":"직접"});render();
  }})(kk);
 }
 var pd=document.getElementById("kpend");
 if(QUEUE.length===0)pd.textContent="증설하지 않고 계속 운영할 수 있다.";
 else if(QUEUE.length===1)pd.textContent="이번에 증설: "+lblOf(QUEUE[0].kind)+" · 다른 설비도 함께 고를 수 있다.";
 else pd.textContent="이번에 증설: "+QUEUE.map(function(q){return lblOf(q.kind)}).join(", ")+" · 하루에 하나씩 순서대로 증설된다.";
 var u3=useRate(3);
 var hI=capHits("intake",5),hS=capHits("shipping",5);
 renderChoice(u3,hI,hS);
 var supTxt="풍작 "+sv[2]+"% 대 부족 "+sv[0]+"%";
 var demTxt="호황 "+dv[2]+"% 대 침체 "+dv[0]+"%";
 var conTxt=G.over?(G.bust?"현금이 바닥났다":"30일이 끝났다"):BL[d?d.b:"none"];
 var evid="";
 if(d&&!G.over){
  if(d.b==="intake")evid="집하 "+f1(d.acc)+"/"+G.cap.i;
  else if(d.b==="storage")evid="재고 "+f1(d.end)+"/"+G.cap.st;
  else if(d.b==="supply")evid="놓친수요 "+f1(d.missed)+", 재고 "+f1(d.end);
  else evid="판매 "+f1(d.sold)+"/"+G.cap.sh;
 }
 document.getElementById("kbrief").innerHTML=
  line("재고 방향",(dr>=0?"+":"")+f1(dr)+" t/day, "+dirTxt,"재고 "+f1(iv)+"/"+G.cap.st+" t")+
  line("관측",causeLine(dr,d),evid)+
  '<div style="border-top:0.5px solid var(--border);margin:8px 0"></div>'+
  line("생산 전망",supTxt,"4일에서 7일")+
  line("수요 전망",demTxt,"4일에서 7일")+
  '<div style="border-top:0.5px solid var(--border);margin-top:8px;padding-top:8px;font-size:12px;color:var(--text-secondary)">'+sum+'</div>';
 document.getElementById("kspark").innerHTML=sparkHtml();
 document.getElementById("kmods").innerHTML=modCardHtml();
 document.getElementById("ktimeline").innerHTML=timelineHtml();
 var rows=G.hist.slice(-6).reverse();
 renderLog(rows);
}

function buyLogHtml(){
 if(!G.buylog.length)return '<div style="color:var(--text-muted);margin-top:12px">이번 판은 증설이 없었다.</div>';
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
 var lines=["seed "+G.seed+" 현금 "+Math.round(G.cash)+" 집하 "+G.buys.intake+"회 출하 "+G.buys.shipping+"회 표기 "+(LAYOUT==="rows"?"행분리":"압축")+(G.uiSwitched?" (판중 전환됨)":" (고정)"),
  "일차\t설비\t순번\t전망격차\t반복제약\t가동률\t사용가능\t경로\t표기"];
 for(var i=0;i<G.buylog.length;i++){var b=G.buylog[i];
  lines.push(b.day+"\t"+b.kind+"\t"+b.nth+"\t"+(b.gap>=0?"+":"")+b.gap+"%p\t"+b.hit+"\t"+b.util+"%\t"+b.left+"\t"+b.path+"\t"+b.ui)}
 var txt=lines.join("\n");
 var ta=document.getElementById("kdump");
 ta.style.height="120px";ta.style.opacity="1";ta.value=txt;
 try{ta.select();ta.setSelectionRange(0,txt.length);document.execCommand("copy")}catch(e){}
 if(navigator&&navigator.clipboard)navigator.clipboard.writeText(txt).catch(function(){});
 var b2=document.getElementById("kcopy");if(b2)b2.textContent="복사됨. 안 되면 아래 상자를 길게 눌러 선택한다";
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

var PREVPCT={},PENDPCT={},LASTDAY=0;
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

function modCardHtml(){
 if(!G.mods.length)return "";
 var CONTRIB=modContrib();
 var h='<div style="font-size:12px;color:var(--text-muted);margin:0 0 6px">내 증설 이후 · 기여는 그 증설만 뺀 경우와의 현금 차이다. 설비끼리 영향을 주므로 합이 전체 차이와 다를 수 있다.</div>';
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

function sparkHtml(){
 var h=G.hist.slice(-7);
 if(h.length<3)return "";
 var BARS=["▁","▂","▃","▄","▅","▆","▇","█"];
 var rows=[
  ["생산",h.map(function(d){return d.prod})],
  ["집하",h.map(function(d){return d.acc})],
  ["재고",h.map(function(d){return d.end})],
  ["판매",h.map(function(d){return d.sold})],
  ["수요",h.map(function(d){return d.dem})]
 ];
 var all=[];rows.forEach(function(r){all=all.concat(r[1])});
 var mx=Math.max.apply(null,all)||1;
 var out='<div style="font-size:11px;color:var(--text-muted);margin-bottom:3px">최근 '+h.length+'일 관측</div>';
 for(var i=0;i<rows.length;i++){
  var vals=rows[i][1];
  var bar=vals.map(function(v){return BARS[Math.min(7,Math.max(0,Math.round(v/mx*7)))]}).join("");
  var last=vals[vals.length-1];
  out+='<div style="display:flex;gap:8px;align-items:baseline;padding:1px 0">'+
   '<span style="width:28px;font-size:11px;color:var(--text-secondary)">'+rows[i][0]+'</span>'+
   '<span style="font-family:monospace;font-size:14px;letter-spacing:1px;color:var(--text-primary)">'+bar+'</span>'+
   '<span style="font-size:11px;color:var(--text-muted)">'+last.toFixed(1)+'</span></div>';
 }
 return out;
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
 return h;
}

function renderLog(rows){
 document.getElementById("klog").innerHTML=rows.length?
  '<div style="display:grid;grid-template-columns:repeat(8,minmax(0,1fr));gap:3px;padding:4px 0;border-bottom:0.5px solid var(--border)">'+
  ["일차","생산","수요","판매","미집하","상함","못판수요","손익"].map(function(h,i){return '<span style="text-align:'+(i?"right":"left")+'">'+h+'</span>'}).join("")+'</div>'+
  rows.map(function(r){return '<div style="display:grid;grid-template-columns:repeat(8,minmax(0,1fr));gap:3px;padding:3px 0;border-bottom:0.5px solid var(--border);color:var(--text-primary)">'+
   '<span>'+r.day+'</span><span style="text-align:right">'+f1(r.prod)+'</span><span style="text-align:right">'+f1(r.dem)+'</span>'+
   '<span style="text-align:right">'+f1(r.sold)+'</span>'+
   '<span style="text-align:right">'+f1(r.wI+r.wS)+'</span>'+
   '<span style="text-align:right">'+f1(r.wT)+'</span>'+
   '<span style="text-align:right">'+f1(r.missed)+'</span>'+
   '<span style="text-align:right;color:'+(r.profit>=0?"var(--text-success)":"var(--text-danger)")+'">'+mo(r.profit)+'</span></div>'}).join(""):
  '<div style="color:var(--text-muted)">하루를 진행하면 결과가 쌓인다.</div>';
}

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
window.ffViews=function(){return FULLOPENS.map(function(x){return x.day})};
window.ffAgree=function(){var h=G.hist.filter(function(r){return r.day>=3});
 if(!h.length)return 0;return +(h.filter(function(r){return r.b===r.b3}).length/h.length*100).toFixed(0)};
document.getElementById("kdetail").onclick=function(){setView("full")};
function startNew(){
 var el=document.getElementById("kseed");
 var v=el&&el.value?parseInt(el.value,10):0;
 reset(v>0?v:Math.floor(Math.random()*99999)+1);
 if(el)el.value="";
}
document.getElementById("knew").onclick=startNew;

document.getElementById("klayout").onclick=function(){
 LAYOUT=LAYOUT==="rows"?"compact":"rows";
 if(G&&G.hist.length>0)G.uiSwitched=true;
 render()};
document.getElementById("kv1").onclick=function(){setView("brief")};
document.getElementById("kv2").onclick=function(){setView("full")};
function lblOf(k){return k==="intake"?"집하 +"+C.step.intake:"판매 +"+C.step.shipping}

function hintOf(k){
 var h=capHits(k,5);
 var past=h.len<3?("관측 "+h.len+"일"):(h.n>0?("최근 "+h.n+"/"+h.len+"일 도달"):(h.last?"어제 도달":"최근 도달 없음"));
 var sv=pct(blur(hor(G.si,4,7))),dv=pct(blur(hor(G.di,4,7)));
 var g=k==="intake"?(sv[2]-sv[0]):(dv[2]-dv[0]);
 var word=k==="intake"?"물량":"수요";
 var fut=g>=10?(word+" 증가 쪽"):g<=-10?(word+" 감소 쪽"):(word+" 보합");
 var usable=Math.max(0,C.days-G.day);
 var col=usable<=2?"var(--text-warning)":"var(--text-secondary)";
 return past+'<br>'+fut+'<br><span style="color:'+col+'">사용 가능 '+usable+'일</span>';
}

function ord(k){for(var i=0;i<QUEUE.length;i++)if(QUEUE[i].kind===k)return i+1;return 0}

function queued(k){
 for(var i=0;i<QUEUE.length;i++)if(QUEUE[i].kind===k)return true;
 return false;
}

function applyPick(){
 if(G.over||pick==="none")return;
 if(queued(pick)){
  QUEUE=QUEUE.filter(function(q){return q.kind!==pick});
  pick="none";render();return;
 }
 if(G.cash<C.cost[pick])return;
 QUEUE.push({kind:pick,path:G.event?"사건":"직접"});
 pick="none";render();
}

function advance(){
 if(G.over)return;
 var cash0=G.cash;
 var q=QUEUE.slice(); QUEUE=[];
 for(var i=0;i<q.length;i++){
  var kd=q[i].kind;
  var newCap=kd==="intake"?(G.cap.i+C.step.intake):(G.cap.sh+C.step.shipping);
  G.timeline.push({day:G.day,type:"act",text:(kd==="intake"?"집하 +"+C.step.intake:"판매 +"+C.step.shipping)+" 증설, 다음날 "+(kd==="intake"?"집하 ":"판매 ")+newCap+" 적용"});
  PENDPATH=q[i].path||"직접";stepDay(kd);
 }
 var from=G.day;
 if(q.length===0)stepDay("none");
 var run=0;
 while(!G.over&&!G.event&&run<C.autoMax-(q.length?0:1)){stepDay("none");run++}
 var to=G.day-1;
 if(to>=from)G.timeline.push({day:from,to:to,type:"auto",
  text:(from===to?from+"일":from+"~"+to+"일")+(from===1?" 탐색 기간 운영":" 자동 운영")});
 if(G.event)G.timeline.push({day:to,type:"event",
  text:({intake:"집하 한도 도달",store:"창고 여유 없음",ship:"판매 한도 도달",stock:"판매할 재고 소진"})[G.event.b]});
 for(var pk in PENDPCT)PREVPCT[pk]=PENDPCT[pk];
 PENDPCT={};
 G.autoFrom=from; G.autoCash=G.cash-cash0; MANUAL=false;
 render();
}

document.getElementById("kgo").onclick=function(){
 if(G.over){startNew();return}
 advance()};
var h=(location.hash||"").match(/seed=(\d+)/);
reset(h?parseInt(h[1],10):Math.floor(Math.random()*99999)+1);
setView("brief");
})();
