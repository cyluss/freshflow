
FF.Rng=function(s){this.s=s>>>0||1}
FF.Rng.prototype.next=function(){this.s=(this.s+0x6d2b79f5)>>>0;var t=this.s;t=Math.imul(t^(t>>>15),t|1);t^=t+Math.imul(t^(t>>>7),t|61);return((t^(t>>>14))>>>0)/4294967296};
FF.Rng.prototype.norm=function(m,sd){var u=Math.max(this.next(),1e-12),v=this.next();return m+sd*Math.sqrt(-2*Math.log(u))*Math.cos(2*Math.PI*v)};

// 월간 성향별 전이행렬. tilt 는 0 침체, 1 평년, 2 호황이다.
// 성향 쪽에 더 머물고 평년에서도 그쪽으로 더 자주 간다.
// 두 성향은 서로 거울상이라 방향에 따른 유불리가 없다.
FF.M=function(rules,tilt){
 var R=rules||FF.C, s=R.stay, m=(1-s)/2;
 var T=[[s,1-s,0],[m,s,m],[0,1-s,s]];
 if(tilt===undefined||tilt===1)return T;
 var b=(R.tilt===undefined?0.5:R.tilt);
 var keep=s+(1-s)*b;                 // 성향 국면에 머무는 확률
 var toward=m*(1+b), away=m*(1-b);   // 평년에서 갈라지는 확률
 var T0=[[keep,1-keep,0],[toward,s,away],[0,1-s,s]];
 if(tilt===0)return T0;
 // 호황은 침체의 거울상이다. 행과 열을 함께 뒤집는다.
 var T2=[[0,0,0],[0,0,0],[0,0,0]];
 for(var i=0;i<3;i++)for(var j=0;j<3;j++)T2[2-i][2-j]=T0[i][j];
 return T2;
}

FF.hor=function(idx,a,b,rules,tilt){var T=FF.M(rules,tilt),v=[0,0,0];v[idx]=1;var acc=[0,0,0];
for(var d=1;d<=b;d++){var o=[0,0,0];for(var i=0;i<3;i++)for(var j=0;j<3;j++)o[j]+=v[i]*T[i][j];v=o;
if(d>=a)for(var k=0;k<3;k++)acc[k]+=v[k]}var n=b-a+1;return[acc[0]/n,acc[1]/n,acc[2]/n]}
FF.blur=function(v,rules){var R=rules||FF.C;
 var o=v.map(function(x){return x*(1-R.noise)+R.noise/3});
 var s=o[0]+o[1]+o[2];return o.map(function(x){return x/s})}
FF.pct=function(v){var a=v.map(function(x){return Math.round(x*100)});a[1]+=100-(a[0]+a[1]+a[2]);return a}
FF.expD=function(idx,a,b,rules){var R=rules||FF.C,v=FF.hor(idx,a,b,R);
 return v[0]*R.dm[0]+v[1]*R.dm[1]+v[2]*R.dm[2]}



FF.dirOf=function(g){return g>=10?1:g<=-10?-1:0}

// 다음 국면. 성향이 있으면 그 전이행렬을 따른다.
FF.mvSeq=function(rng,x,rules,tilt){
 var T=FF.M(rules,tilt), r=rng.next(), acc=0;
 for(var j=0;j<3;j++){acc+=T[x][j];if(r<acc)return j}
 return 2;
}

// World: 불확실성 생성. 게임 물리는 여기 없다.
// 하루치 입력을 만들고 다음 국면을 함께 돌려준다.
FF.World=function(seed,rules){
 var R=rules||FF.C;
 // 생산과 수요는 서로 다른 확률 스트림에서 뽑는다. 하나의 스트림을 같이 쓰면, 둘 중 한쪽의
 // 소비 시점이나 횟수가 나중에 바뀔 때 다른 쪽 수열까지 밀려버린다(재현성이 우연에 기댄다).
 // 두 스트림을 처음부터 물리적으로 분리해 두면 그 위험이 아예 없다.
 var rngS=new FF.Rng(seed);
 var rngD=new FF.Rng(seed^0x9e3779b9);
 // 이번 달 성향. 판마다 다르고 30일 내내 유지된다. 공급 성향은 공급 스트림에서, 수요 성향은 수요 스트림에서 뽑는다.
 var pick=function(rng){var r=rng.next(),p=R.tiltP||[0.25,0.5,0.25];
  return r<p[0]?0:(r<p[0]+p[1]?1:2)};
 var ts=pick(rngS), td=pick(rngD);
 var si=FF.mvSeq(rngS,1,R,ts), di=FF.mvSeq(rngD,1,R,td);
 return {
  tilt:function(){return {supply:ts,demand:td}},
  phase:function(){return {supply:si,demand:di}},
  // 생산은 턴이 시작될 때(정책을 정하기 전) 미리 확정한다. 수요는 하루를 실행할 때만 실현된다.
  // 그래서 둘을 분리해 서로 다른 시점에 뽑는다. 참조 재생(러너)은 여전히 next()로 같이 뽑는다.
  nextProduction:function(){
   // sm/sd는 실 단위 분포다. 여기서 확정 수량(2배 내부단위)으로 양자화한다. 확률 세계에서
   // 확정 세계로 넘어오는 경계는 이 한 곳뿐이다.
   var raw=Math.max(0,rngS.norm(R.sm[si],R.sd));
   var out={production:Math.round(raw*2),supplyPhase:si};
   si=FF.mvSeq(rngS,si,R,ts);
   out.nextSupplyPhase=si;
   return out;
  },
  nextDemand:function(){
   var rawDem=Math.max(0,rngD.norm(R.dm[di],R.dd));
   var dem=Math.round(rawDem*2);
   // 판로별 수요. 전체 수요를 상한 비율로 나누고 판로마다 다른 변동을 준다.
   // c.cap은 이미 확정 수량 척도라 비율(c.cap/totCap)은 그대로 쓴다.
   var totCap=0, ci;
   for(ci=0;ci<R.channels.length;ci++)totCap+=R.channels[ci].cap;
   var chDem=[];
   for(ci=0;ci<R.channels.length;ci++){
    var c=R.channels[ci];
    var vol=(c.key==="whole")?0.2:0.4;
    chDem.push(Math.round(Math.max(0,rawDem*(c.cap/totCap)*(1-vol+rngD.next()*vol*2))*2));
   }
   var out={demand:dem,chDemand:chDem,demandPhase:di};
   di=FF.mvSeq(rngD,di,R,td);
   out.nextDemandPhase=di;
   return out;
  },
  // 참조 재생 전용. 생산 다음 수요 순서로 그대로 이어 뽑아 둘을 합친 옛 모양을 낸다.
  next:function(){
   var p=this.nextProduction(), d=this.nextDemand();
   return {production:p.production,demand:d.demand,chDemand:d.chDemand,
     supplyPhase:p.supplyPhase,demandPhase:d.demandPhase,
     nextSupplyPhase:p.nextSupplyPhase,nextDemandPhase:d.nextDemandPhase};
  }
 };
}



// 오늘 더 받고 싶은 목표 입고량. 판매 목표 재고(cover*근일 예상판매 + 원일 증가분 일부)에서
// 지금 들고 있는 재고를 뺀 나머지다. 실제 입고(acc)는 이 값과 생산·입고한도 중 가장 작은 쪽이다.
// 커널과 미리보기가 이 함수 하나를 같이 쓴다. 따로 두면(예: 미리보기가 국면 평균을 따로 계산하면)
// 둘이 갈라져도 알아채기 어렵다.
// capSales/totalInv는 확정 수량(2배 내부단위)이고, FF.expD는 실 단위 전망이라 그대로 섞으면
// 척도가 안 맞는다. expD 쪽에 2를 곱해 확정 수량과 같은 척도로 맞춘 뒤, 결과를 확정 도메인
// 진입점에서 한 번만 반올림한다(그 뒤로는 min()에 그대로 쓰이므로 여기서 정수가 확정돼야 한다).
FF.intakeNeed=function(di,capSales,cover,totalInv,rules){
 var R=rules||FF.C;
 var on=Math.min(capSales,FF.expD(di,1,3,R)*2), om=Math.min(capSales,FF.expD(di,4,7,R)*2);
 var cv=(cover===undefined)?R.cover:cover;
 return Math.round(Math.max(0,cv*on+R.alpha*Math.max(0,om-on)*R.mid-totalInv));
}

FF.stepState=function(s,prod,dem,rules){
 var R=rules||FF.C;
 // 오늘 회수되는 매출채권을 먼저 현금으로 바꾼다.
 // 오늘 갚아야 할 매입채무를 먼저 낸다.
 if(s.ap&&s.ap.length){
  var keepA=[];
  for(var pi=0;pi<s.ap.length;pi++){
   if(s.ap[pi].at<=s.day)s.cash-=s.ap[pi].amt; else keepA.push(s.ap[pi]);
  }
  s.ap=keepA;
 }
 if(s.ar&&s.ar.length){
  var keep=[];
  for(var ai=0;ai<s.ar.length;ai++){
   if(s.ar[ai].at<=s.day)s.cash+=s.ar[ai].amt; else keep.push(s.ar[ai]);
  }
  s.ar=keep;
 }
 var tot=function(){var t=0;for(var i=0;i<s.lots.length;i++)t+=s.lots[i].q;return t};
 var need=FF.intakeNeed(s.di,s.cap.sales,s.cover,tot(),R);
 var baseAcc=Math.min(prod,s.cap.intake,need);
 // 초과분 매입 계약: 한도를 넘은 물량 중 최대 X t 를 더 받는다.
 // 한도 자체는 늘리지 않고 목표재고와 창고 제약은 그대로다.
 var over=Math.max(0,prod-s.cap.intake);
 var extra=s.contract>0?Math.min(over,s.contract,Math.max(0,need-baseAcc)):0;
 var acc=baseAcc+extra;
 var reach=Math.min(prod,s.cap.intake)+extra;
 var refused=reach-acc, wI=prod-acc;
 var freeNow=Math.max(0,s.cap.storage-tot());
 var byCap=Math.max(0,over-extra);
 var rest=wI-byCap;
 var byStore=Math.min(rest,Math.max(0,reach-freeNow));
 var byNeed=Math.max(0,rest-byStore);
 var stored=Math.min(acc,freeNow), wS=acc-stored;
 // 매입은 지금 손에 있는 현금으로만 한다. 모자라면 그만큼 덜 받는다.
 // budget/farm을 그대로 쓰면 소수가 나온다. 현금으로 못 사는 몫이라 올림이 아니라 내림이어야
 // 한도를 넘지 않는다(정수 확정 도메인 경계).
 var budget=Math.max(0,s.cash-R.fixed);
 var payable=(R.farm>0)?Math.min(stored,Math.floor(budget/R.farm)):stored;
 var short=stored-payable;
 if(short>R.ui.zero){ stored=payable; wS+=short; }
 if(stored>0)s.lots.push({q:stored,a:0});
 var sellable=tot();
 // 판로 배분. s.alloc 은 판로별 비중, s.stance 는 판로별 태도(양보/보통/우선/보장)다. 없으면 비싼 곳부터 채운다.
 // s.cap.sales 는 판로 상한과 별개로 하루 전체 판매량의 총상한이다. sold 가 거기 닿으면 더 못 판다.
 var CHS=R.channels, nch=CHS.length;
 var relv=s.rel||[], sold=0, rev=0, ageMix=[], toCh=[], revCh=[];
 var chDem=[];
 for(var ci=0;ci<nch;ci++){chDem.push(0);toCh.push(0);revCh.push(0)}
 // 오늘 판로 수요는 world 가 준다. 없으면 전체 수요를 상한 비율로 나눈다.
 // 판로마다 독립된 상한(비율·보장 기준 조합)이라 총합을 보존할 필요는 없지만, 이 값이
 // 태도/명시배분 없이도 판매 상한으로 그대로 쓰이므로(quotaLeft) 정수여야 판매량이 안 샌다.
 var src=s._chDemand||null;
 for(ci=0;ci<nch;ci++){
  var rl2=relv[ci]===undefined?R.rel.start:relv[ci];
  var cap2=CHS[ci].cap*R.rel.cap[rl2];
  var d0=src?src[ci]:(dem*CHS[ci].cap/ (function(){var t=0;for(var z=0;z<nch;z++)t+=CHS[z].cap;return t})());
  var fl=CHS[ci].quota*R.rel.floor[rl2];
  chDem[ci]=Math.round(Math.min(cap2,Math.max(d0,(CHS[ci].key==="fran")?fl:0)));
 }
 // 나이가 오래된 lot 부터 본다. 한 판로에 팔고 대금을 잡는 공통 처리다.
 s.lots.sort(function(a,b){return b.a-a.a});
 var sellUnit=function(c2,age){
  var rl3=relv[c2]===undefined?R.rel.start:relv[c2];
  return CHS[c2].price[age]*R.rel.price[rl3]*R.q[Math.min(age,R.ttl-1)];
 };
 var settleSale=function(c2,amt){
  rev+=amt; revCh[c2]+=amt;        // 손익은 발생 시점에 잡는다
  var lag=CHS[c2].settle;
  if(lag>0){ s.ar=s.ar||[]; s.ar.push({at:s.day+lag,amt:amt}); }
  else s.cash+=amt;                // 당일 정산은 즉시 현금
 };
 var hasStance=s.stance&&s.stance.length===nch;
 // 보장 예약 + 가중치 water-filling. 미리보기(stancePlan)와 같은 FF.allocatePool을 쓴다.
 // pool은 물리 재고와 하루 판매 총상한 중 작은 쪽이다. 그래야 목표가 처음부터 상한을 넘지 않는다.
 var pool=Math.min(sellable,Math.max(0,s.cap.sales-sold));
 // allocatePool은 소수를 낸다. lot.q가 정수인 만큼 실제 판매도 끝까지 정수로 남으려면
 // 이 target도 미리보기와 같은 방식(FF.roundAllocation)으로 한 번 정수화해야 한다.
 var target=hasStance?FF.roundAllocation(FF.allocatePool(pool,chDem.slice(),
   s.stance,CHS.map(function(c){return c.quota}),R),pool):null;
 // 명시 배분(s.alloc)이 있으면 그것으로, 태도도 배분도 없으면 null(단가 순)로 정렬 순서를 정한다.
 var effAlloc=(s.alloc&&s.alloc.length===nch)?s.alloc
   :(hasStance?s.stance.map(function(lv){return R.stance.weight[lv]}):null);
 var order=[];
 for(ci=0;ci<nch;ci++)order.push(ci);
 for(var li=0;li<s.lots.length;li++){
  var lot=s.lots[li];
  if(lot.q<=R.ui.zero)continue;
  var age=Math.min(lot.a,R.ttl-1);
  // 이 lot 를 어느 판로에 넣을지: 목표가 있으면 남은 목표가 큰 순, 비중만 있으면 그 순서, 없으면 단가 순
  var seq=order.slice();
  if(target){
   seq.sort(function(a,b){return (target[b]-toCh[b])-(target[a]-toCh[a])});
  } else if(effAlloc){
   seq.sort(function(a,b){return effAlloc[b]-effAlloc[a]});
  } else {
   seq.sort(function(a,b){
    var ra=relv[a]===undefined?R.rel.start:relv[a], rb=relv[b]===undefined?R.rel.start:relv[b];
    return CHS[b].price[age]*R.rel.price[rb]-CHS[a].price[age]*R.rel.price[ra];
   });
  }
  for(var si2=0;si2<seq.length&&lot.q>R.ui.zero;si2++){
   var c2=seq[si2];
   // 목표나 비중이 있으면 그 판로에 배정된 몫을 넘지 않는다.
   var quotaLeft=chDem[c2];
   if(target){
    quotaLeft=Math.min(quotaLeft,Math.max(0,target[c2]-toCh[c2]));
   } else if(effAlloc){
    var wsum=0; for(var wi=0;wi<nch;wi++)wsum+=effAlloc[wi];
    if(wsum>0){
     var share=sellable*effAlloc[c2]/wsum;
     quotaLeft=Math.min(quotaLeft,Math.max(0,share-toCh[c2]));
    }
   }
   var take=Math.min(lot.q,quotaLeft,Math.max(0,s.cap.sales-sold));
   if(take<=R.ui.zero)continue;
   lot.q-=take; chDem[c2]-=take; sold+=take; toCh[c2]+=take;
   ageMix.push({a:lot.a,q:take});
   var amt=FF.tradeAmount(sellUnit(c2,age),take);
   settleSale(c2,amt);
  }
 }
 // 관계 갱신. 쿼터를 채우면 오르고 절반도 못 넣으면 내린다.
 s.rel=s.rel||[];
 for(ci=0;ci<nch;ci++){
  var cur=s.rel[ci]===undefined?R.rel.start:s.rel[ci];
  if(toCh[ci]>=CHS[ci].quota-R.ui.zero){ if(s.day%R.rel.up===0)cur=Math.min(3,cur+1) }
  else if(toCh[ci]<CHS[ci].quota*0.5)cur=Math.max(0,cur-1);
  s.rel[ci]=cur;
 }
 var demTotal=0;
 for(ci=0;ci<nch;ci++)demTotal+=chDem[ci]+toCh[ci];
 var w=0, wT=0;
 for(i=0;i<s.lots.length;i++){
  var l=s.lots[i];
  if(l.q<=R.ui.zero)continue;
  l.a++;
  if(l.a>=R.ttl){wT+=l.q;continue}
  s.lots[w++]=l;
 }
 s.lots.length=w;
 var end=tot();
 var cost=end*R.hold+s.cap.intake*R.maint.intake+s.cap.storage*R.maint.storage+s.cap.sales*R.maint.sales
  +(wI+wS+wT)*R.waste+R.fixed+stored*R.farm;
 var profit=rev-cost;
 // 매출은 판로별 정산으로 이미 처리했다. 지출만 오늘 나간다.
 s.cash-=cost;
 return {prod:prod,dem:demTotal,acc:stored,refused:refused,sold:sold,missed:Math.max(0,demTotal-sold),
  ageMix:ageMix,wI:wI,wIcap:byCap,wIstore:byStore,wIneed:byNeed,wS:wS,wT:wT,
  end:end,profit:profit,sellable:sellable,toCh:toCh,revCh:revCh};
}



// 병목 판정. 그날의 사실이므로 커널의 일부다.
// lossOut은 r.missed를 그대로 쓴다. dem-r.sold로 다시 계산하면, 판로별 수요(chDem)가
// 독립적으로 반올림되면서 총합이 dem과 살짝 어긋나는 경우 판정(ship/stock)과 손실량이 갈릴 수 있다.
FF.bottleneck=function(s,r,dem,rules){
 var eps=(rules||FF.C).ui.eps, lossOut=r.missed;
 var cand=[
  ["ship",  (r.sold>=s.cap.sales-eps&&dem>r.sold+eps)?lossOut:0],
  ["stock", (r.sold<dem-eps&&r.sellable<=r.sold+eps)?lossOut:0],
  ["demand",(r.sold<s.cap.sales-eps&&r.sellable>r.sold+eps)?Math.max(0,s.cap.sales-dem):0],
  ["intake",r.wIcap],
  ["store", r.wIstore+r.wS+r.wT],
  ["supply",(r.wIneed<=eps&&r.wIcap<=eps&&r.wIstore<=eps&&r.prod<s.cap.intake-eps)?(s.cap.intake-r.prod):0],
  ["policy",r.wIneed]
 ];
 var b="none",bv=eps;
 for(var i=0;i<cand.length;i++)if(cand[i][1]>bv){bv=cand[i][1];b=cand[i][0]}
 return b;
}



// 하루 상태 전이. 게임 규칙은 이 함수에만 있다.
// 신호도 로그도 화면도 모른다. 상태와 사실만 다룬다.
//   state   {day,si,di,cash,lots,cap:{intake,storage,sales},pend,spent,buys}
//   command FF.Cmd 의 결과
//   world   FF.World 의 next() 출력
// 반환 {state, result, events}. state 는 제자리에서 전진한다.

FF.transition=function(state,command,world,rules){
 var R=rules||FF.C;
 var s=state, ev=[];
 if(s.pend){s.cap[s.pend]+=R.step[s.pend];ev.push({type:"capacity-applied",capacity:s.pend});s.pend=null}
 // 계약도 증설과 같다: 산 날은 확정만 하고, 다음 날 거래부터 실제로 효력이 생긴다.
 if(s.pendContract){s.contract=s.pendContract; s.pendContract=null; ev.push({type:"contract-applied"})}
 var C=command;
 var bought=null, cost=0;
 if(C.type==="sell"&&C.alloc&&C.alloc.length===R.channels.length){
  s.alloc=C.alloc.slice();
 }
 // 판로 태도: 판로마다 0~3 단계다. 보장 단계는 확보를, 나머지는 남는 물량의 비중을 정한다.
 if(C.type==="sell"&&C.stance&&C.stance.length===R.channels.length){
  s.stance=C.stance.slice();
 }
 if(C.type==="policy"){
  var ok=false;
  for(var pi=0;pi<R.policy.length;pi++)if(R.policy[pi].v===C.cover)ok=true;
  if(ok&&s.cover!==C.cover){
   s.cover=C.cover;
   ev.push({type:"policy",cover:C.cover,day:s.day});
  }
 }
 if(C.type==="contract"){
  var opt=FF.contractOption(C.size,R);
  if(opt&&opt.x>0
     &&(s.buys?s.buys.contract:0)<R.contract.max
     &&s.day<=(R.contract.until||R.days)
     &&s.cash>=opt.price){
   cost=opt.price;
   s.cash-=cost; s.spent+=cost; s.pendContract=opt.x;
   if(s.buys)s.buys.contract++;
   bought="contract";
   ev.push({type:"purchase",capacity:"contract",cost:cost,day:s.day});
  }
 }
 if(C.type==="buy"&&R.cost[C.capacity]!==undefined&&s.cash>=R.cost[C.capacity]){
  bought=C.capacity; cost=R.cost[bought];
  s.cash-=cost; s.spent+=cost; s.pend=bought;
  if(s.buys)s.buys[bought]++;
  ev.push({type:"purchase",capacity:bought,cost:cost,day:s.day});
 }
 // 생산이 이미 확정되어 있으면(턴 시작에 미리 뽑아 둔 값) 그것을 쓴다. 없으면(참조 재생 등) world가 그 자리에서 준다.
 var revealed=s.todayProd!==undefined&&s.todayProd!==null;
 if(!revealed&&world.supplyPhase!==undefined)s.si=world.supplyPhase;
 s.di=world.demandPhase;
 var prod=revealed?s.todayProd:world.production;
 var r=FF.stepState(s,prod,world.demand,R);
 r.bought=bought; r.cost=cost;
 r.b=FF.bottleneck(s,r,world.demand,R);
 if(r.wIcap>R.ui.eps)ev.push({type:"capacity-hit",capacity:"intake",amount:r.wIcap});
 if(r.wIstore+r.wS>R.ui.eps)ev.push({type:"capacity-hit",capacity:"storage",amount:r.wIstore+r.wS});
 if(r.missed>R.ui.eps)ev.push({type:"demand-missed",amount:r.missed});
 ev.push({type:"day-ended",day:s.day,profit:r.profit-cost});
 // 최근 사흘의 관측을 남긴다. 화면의 못 판 주문과 같은 값이다.
 if(s.recent){
  s.recent=s.recent.concat([{missed:r.missed,dem:r.dem}]).slice(-3);
 }
 // 생산이 확정되어 있던 턴이면 다음 국면 관리는 턴 시작 때 생산을 미리 확정하는 쪽이 이미 넘겨받는다.
 s.day++; s.di=world.nextDemandPhase;
 if(!revealed&&world.nextSupplyPhase!==undefined)s.si=world.nextSupplyPhase;
 if(s.cash<=0)ev.push({type:"bankrupt",day:s.day-1});
 return {state:s,result:r,events:ev};
}

// 관측 기록. 게임 규칙이 아니라 기록 담당이다.
// 커널이 낸 결과와 사건을 소비해 로그를 쌓는다.
FF.initialState=function(world,rules){
 var R=rules||FF.C;
 return {day:1,si:world.phase().supply,di:world.phase().demand,
  cash:R.cash,lots:[],
  cap:{intake:R.cap.intake,storage:R.cap.storage,sales:R.cap.sales},
  pend:null,spent:0,contract:0,pendContract:null,todayProd:null,cover:R.cover,ar:[],
  rel:R.channels.map(function(){return R.rel.start}),alloc:null,stance:null,
  buys:{sales:0,contract:0},
  recent:[]};
}

// 전략이 상태를 읽을 때 쓰는 조회. 커널 상태의 파생값이다.
FF.step=function(state,command,world,rules){
 var next=FF.forkState(state);
 var out=FF.transition(next,command,world,rules);
 return {state:next,result:out.result,events:out.events};
}

// 분기. 상태를 복사해 갈라진다. 바뀌는 것만 새로 만든다.
FF.forkState=function(s){
 return {day:s.day,si:s.si,di:s.di,cash:s.cash,
  lots:s.lots.map(function(l){return {q:l.q,a:l.a}}),
  cap:{intake:s.cap.intake,storage:s.cap.storage,sales:s.cap.sales},
  pend:s.pend,spent:s.spent,contract:s.contract||0,pendContract:s.pendContract||null,
  todayProd:(s.todayProd===undefined)?null:s.todayProd,cover:s.cover,
  ar:(s.ar||[]).map(function(x){return {at:x.at,amt:x.amt}}),
  rel:(s.rel||[]).slice(),alloc:s.alloc?s.alloc.slice():null,
  stance:s.stance?s.stance.slice():null,dead:false,
  recent:s.recent?s.recent.slice():[],
  buys:s.buys?{sales:s.buys.sales,contract:s.buys.contract||0}:undefined};
}

// 최종 가치. 살아남았고 끝까지 갔으면 처분가치를 더한다.
// 순자산. 현금에 미회수 매출채권을 더한다.
FF.netWorth=function(s){
 var t=s.cash;
 if(s.ar)for(var i=0;i<s.ar.length;i++)t+=s.ar[i].amt;
 if(s.ap)for(var j=0;j<s.ap.length;j++)t-=s.ap[j].amt;
 return t;
}
FF.finalValue=function(s,fin,rules){
 var R=rules||FF.C;
 var nw=FF.netWorth(s);
 return (s.cash<=0||!fin)?nw:(nw+Math.round(s.spent*R.salvage));
}


FF.view={
 stock:function(s){var t=0;for(var i=0;i<s.lots.length;i++)t+=s.lots[i].q;return t},
 room:function(s){return Math.max(0,s.cap.storage-FF.view.stock(s))},
 canAfford:function(s,k){return s.cash>=FF.C.cost[k]},
 pending:function(s){return s.pend},
 // 최근 사흘 못 판 주문 비율. 플레이어가 화면에서 읽는 값이다.
 missRate:function(s){
  var H=s.recent||[], m=0, d=0;
  for(var i=0;i<H.length;i++){m+=H[i].missed;d+=H[i].dem}
  return d>0?m/d:0;
 }
};


// 데이터 전략. 규칙 목록을 자료구조로 표현하고 해석기가 명령으로 바꾼다.
// 규칙은 위에서 아래로 검사하고 처음 맞는 것을 쓴다.
//   {when:[{read:"stock", op:">", value:15}], then:{buy:"sales"}}
//   {then:{wait:true}}
FF.READ={
 stock:function(s){return FF.view.stock(s)},
 room:function(s){return FF.view.room(s)},
 cash:function(s){return s.cash},
 day:function(s){return s.day},
 capIntake:function(s){return s.cap.intake},
 capSales:function(s){return s.cap.sales},
 buysContract:function(s){return s.buys?(s.buys.contract||0):0},
 buysSales:function(s){return s.buys?s.buys.sales:0},
 pending:function(s){return s.pend?1:0}
};
FF.OP={
 ">":function(a,b){return a>b},
 "<":function(a,b){return a<b},
 ">=":function(a,b){return a>=b},
 "<=":function(a,b){return a<=b},
 "==":function(a,b){return a===b}
};
FF.evalCond=function(c,s){
 var read=FF.READ[c.read], op=FF.OP[c.op];
 if(!read||!op)return false;
 return op(read(s),c.value);
};
FF.compileStrategy=function(rules){
 return function(s){
  for(var i=0;i<rules.length;i++){
   var r=rules[i], ok=true;
   var when=r.when||[];
   for(var j=0;j<when.length&&ok;j++)ok=FF.evalCond(when[j],s);
   if(!ok)continue;
   if(r.then&&r.then.buy){
    if(!FF.view.canAfford(s,r.then.buy)||s.pend)return FF.Cmd.wait();
    return FF.Cmd.buy(r.then.buy);
   }
   return FF.Cmd.wait();
  }
  return FF.Cmd.wait();
 };
}

// 계획을 전략으로 올린다. 표는 날짜만 보는 전략이다.
//   plan {일차: 설비}  또는  function(state) -> Command
FF.asStrategy=function(plan){
 if(typeof plan==="function")return plan;
 if(Array.isArray(plan))return FF.compileStrategy(plan);
 return function(s){
  return FF.planCmd(plan[s.day]);
 };
}

// 시나리오 러너. 날짜 전진 구현은 이 함수 하나뿐이다.
//   base     계획표 또는 전략 함수
//   forks    [{at, plan}] at 일차의 기준선 상태에서 갈라진다
//   untilDay 지정하면 그날까지만
// 반환 {state, days:[{day,result,events}], forks:[최종상태]}
