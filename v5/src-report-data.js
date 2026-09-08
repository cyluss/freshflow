
FF.cnt=function(axis,val){
 var k=axis===0?"si":"di",n=0;
 for(var i=0;i<FF.histOf().length;i++)if(FF.histOf()[i][k]===val)n++;
 return n;
}

FF.dwellMedian=function(win){
 var h=FF.histOf().slice(-(win||7));
 var arr=[],tot=0;
 for(var i=0;i<h.length;i++){var m=h[i].ageMix||[];
  for(var j=0;j<m.length;j++){arr.push(m[j]);tot+=m[j].q}}
 if(tot<FF.C.ui.eps)return null;
 arr.sort(function(a,b){return a.a-b.a});
 var acc=0,med=null,p90=null;
 for(i=0;i<arr.length;i++){acc+=arr[i].q;
  if(med===null&&acc>=tot*0.5)med=arr[i].a;
  if(p90===null&&acc>=tot*0.9){p90=arr[i].a;break}}
 return{med:med,p90:p90,days:h.length};
}

FF.invPerf=function(win){
 var h=FF.histOf().slice(-(win||5));
 if(h.length<2)return null;
 var sold=0,invSum=0,acc=0,loss=0;
 for(var i=0;i<h.length;i++){sold+=h[i].sold;invSum+=h[i].end;acc+=h[i].acc;loss+=h[i].wT;}
 var avgInv=invSum/h.length, avgSold=sold/h.length;
 return{cover:avgSold>0.05?(avgInv/avgSold):null,loss:acc>0.05?(loss/acc):0,days:h.length};
}

FF.causeFacts=function(d){
 if(!d)return null;
 return {b:d.b,capI:d.capI,capS:d.capS,wIcap:d.wIcap,wIstore:d.wIstore,wS:d.wS,
   prod:d.prod,dem:d.dem,missed:d.missed,wIneed:d.wIneed};
}

FF.invStats=function(){
 var p=FF.invPerf(FF.C.ui.recentWin);
 if(!p)return null;
 var dm=FF.dwellMedian(FF.C.ui.dwellWin);
 return {lossPct:Math.round(p.loss*100),med:dm?dm.med:null,p90:dm?dm.p90:null,win:FF.C.ui.dwellWin};
}

FF.maintOf=function(k){return FF.C.step[k]*(k==="intake"?FF.C.maint.intake:FF.C.maint.sales)};
FF.lostInflow=function(d){
 if(!d)return null;
 var tot=d.wI+d.wS;
 if(tot<FF.C.ui.eps)return null;
 var byStore=d.wIstore+d.wS, parts=[];
 if(d.wIcap>FF.C.ui.eps)parts.push({cause:"cap",amt:d.wIcap});
 if(byStore>FF.C.ui.eps)parts.push({cause:"store",amt:byStore});
 if(d.wIneed>FF.C.ui.eps)parts.push({cause:"need",amt:d.wIneed});
 return {total:tot,parts:parts};
}

FF.trend3=function(day){
 var h=FF.histOf(), upto=[];
 for(var i=0;i<h.length;i++)if(!day||h[i].day<=day)upto.push(h[i]);
 var last3=upto.slice(-3), cnt={}, best="none", n=0;
 for(var j=0;j<last3.length;j++){
  var k=last3[j].b; cnt[k]=(cnt[k]||0)+1;
  if(cnt[k]>n){n=cnt[k];best=k}
 }
 return best;
}



// 앞으로 며칠의 생산·수요 국면 전망. 오늘 확정 상태와 어제 결과는 이미 다른 곳에서 보여주므로
// 지난 며칠의 입고/창고/판매/사건/투자를 표로 되풀이하지 않는다. 지금 판단에 쓸 정보만 남긴다.
FF._forecastOnly=function(){
 var h=FF.histOf();
 if(h.length<2)return null;
 var FC=(!FF.isOver()&&FF.run().day<=FF.C.days)?FF.C.ui.fcDays:0;
 if(!FC)return null;
 var SUP=["low","mid","high"], DEM=["weak","mid","strong"];
 var futPhase=function(idx,W,tl){
  var a=[];
  for(var dd=1;dd<=FC;dd++){
   var v=FF.blurredPhase(idx,dd,dd,FF.C,tl), b=0;
   for(var t=1;t<3;t++)if(v[t]>v[b])b=t;
   a.push(W[b]);
  }
  return a;
 };
 return {FC:FC,
  supply:futPhase(FF.marketOf().si,SUP,FF.tiltOf().supply),
  demand:futPhase(FF.marketOf().di,DEM,FF.tiltOf().demand)};
}

FF.forecastOnly=FF.memo(FF._forecastOnly);

FF.monthOutlook=function(){
 var M=FF.marketOf();
 if(!M)return null;
 var n=FF.C.days, today=FF.run()?Math.min(FF.run().day,n):1;
 var left=FF.daysLeft();
 if(left<3)return null;
 var w=Math.round(left/3), w2=Math.round(left*2/3);
 var spans=[{key:"early",from:today,to:today+w-1},
            {key:"mid",from:today+w,to:today+w2-1},
            {key:"late",from:today+w2,to:n}];
 var row=function(idx,tl){
  return spans.map(function(s){
   // 오늘 국면에서 몇 일 뒤인지로 전이를 돌린다
   return {key:s.key,from:s.from,to:s.to,
     pct:FF.pct(FF.blurredPhase(idx,s.from-today+1,s.to-today+1,FF.C,tl))};
  });
 };
 var T=FF.tiltOf();
 return {days:n, today:today, left:left, supply:row(M.si,T.supply), demand:row(M.di,T.demand)};
}

// 확률 분포를 한 줄 판정으로 바꾼다. 기상청 1개월전망 해석표와 같은 규칙이다.
//   pct = [낮음, 비슷, 높음]
FF.outlookVerdict=function(pct){
 var low=pct[0], mid=pct[1], high=pct[2];
 if(high>=50)return "high";
 if(low>=50)return "low";
 if(mid>=50)return "similar";
 if(high>low)return "mostlyHigh";
 if(low>high)return "mostlyLow";
 return "similar";
}

// 표시용 양자화. 5% 단위로 낮추되 합계 100을 보존한다.
// 최대 나머지 방식이고 동률은 배열 순서로 고정한다.
FF.quantizePct=function(p,step){
 var st=step||5;
 var base=p.map(function(x){return Math.floor(x/st)*st});
 var sum=base.reduce(function(a,b){return a+b},0);
 var order=p.map(function(x,i){return {i:i,rem:x-base[i]}})
   .sort(function(a,b){return (b.rem-a.rem)||(a.i-b.i)});
 for(var k=0;k<(100-sum)/st;k++)base[order[k].i]+=st;
 return base;
}


// 최근 사흘의 최빈 병목. 기록하지 않고 필요할 때 센다.

FF.missedTop=function(){
 var m=FF.missedOps(), pos=m.filter(function(x){return x.gain>0});
 if(!pos.length)return null;
 var top=pos[0];
 var near=pos.filter(function(x){return x.kind===top.kind&&x.gain>=top.gain*FF.C.ui.nearTop});
 var days=near.map(function(x){return x.day}).sort(function(a,b){return a-b});
 return {day:top.day,kind:top.kind,gain:top.gain,spanFrom:days[0],spanTo:days[days.length-1],spread:days.length>1};
}

FF.finAfterTop=function(){
 if(!FF.run().finDay)return null;
 var all=FF.missedOps().filter(function(x){return x.gain>0});
 all.sort(function(a,b){return b.gain-a.gain});
 var aft=all.filter(function(x){return x.day>=FF.run().finDay});
 if(!aft.length)return {kind:null,state:"none"};
 var t=aft[0];
 if(all.length&&all[0].day===t.day&&all[0].kind===t.kind)
  return {state:"same",day:t.day,kind:t.kind,gain:t.gain};
 return {state:"other",day:t.day,kind:t.kind,gain:t.gain};
}

// 계약은 ContractStatsView가 따로 자세히 보여주므로 여기서는 되풀이하지 않는다.
FF.contribRows=function(){
 var c=FF.modContrib()||[];
 return FF.logOf().mods.map(function(m,i){return {day:m.day,kind:m.kind,contrib:c[i]||0}})
  .filter(function(r){return r.kind!=="contract"});
}

FF.recoverStats=function(k){
 var r=FF.recoverPct(k);
 if(!r)return null;
 return {val:r.val,prev:r.prev,delta:(r.prev!==null&&r.prev!==r.val)?(r.val-r.prev):null};
}
FF.modRows=function(){
 var C=FF.modContrib();
 return FF.logOf().mods.map(function(m,i){
  var days=m.use.length, ex=(m.extra||0);
  var isC=(m.kind==="contract");
  var step=isC?(m.size||FF.contractOf()):FF.C.step[m.kind];
  var opt=isC?FF.contractOption(step):null;
  var cost=isC?(opt?opt.price:0)
    :(FF.C.cost[m.kind]+days*step*FF.C.maint.sales);
  return {day:m.day,kind:m.kind,size:m.size,days:days,extra:ex,
   fill:days?ex/(days*step):0,
   cost:cost,
   contrib:C?C[i]:0,
   idle:(days>0&&ex<FF.C.ui.eps)};
 });
}

FF.missedGroups=function(){
 var m=FF.missedOps();
 if(!m.length)return null;
 var by={sales:[]};
 m.forEach(function(x){if(by[x.kind])by[x.kind].push(x)});
 var out=[];
 ["sales"].forEach(function(k){
  var arr=by[k].slice().sort(function(a,b){return a.day-b.day});
  if(!arr.length)return;
  var maint=FF.maintOf(k);
  out.push({kind:k,maint:maint,rows:arr.map(function(t,i){
   var d=(i>0)?(t.gain-arr[i-1].gain):null;
   return {day:t.day,gain:t.gain,delta:d,flat:(d!==null&&Math.abs(d-maint)<=2)};
  })});
 });
 return out;
}


FF._chartData=function(){
 var h=FF.histOf();
 if(h.length<3)return null;
 var FC=(!FF.isOver()&&FF.run().day<=FF.C.days)?FF.C.ui.fcDays:0;
 var n=FF.C.days, lastDay=h[h.length-1].day;
 var domain=Math.max(8,Math.min(n,lastDay+FC));
 var mx=1, mxInv=1;
 h.forEach(function(r){mx=Math.max(mx,r.prod,r.sold);mxInv=Math.max(mxInv,r.end)});
 var band=function(idx,means,noiseSd,tl){
  var out=[];
  for(var dd=1;dd<=FC;dd++){
   var v=FF.blur(FF.hor(idx,dd,dd,FF.C,tl));
   var m=v[0]*means[0]+v[1]*means[1]+v[2]*means[2];
   var sd=Math.sqrt(v[0]*Math.pow(means[0]-m,2)+v[1]*Math.pow(means[1]-m,2)+v[2]*Math.pow(means[2]-m,2))+noiseSd;
   out.push({day:Math.min(n,FF.run().day-1+dd),hi:m+sd,lo:Math.max(0,m-sd)});
  }
  return out;
 };
 var TT=FF.tiltOf();
 var supply=FC?band(FF.marketOf().si,FF.C.sm,FF.C.sd,TT.supply):[];
 var demand=FC?band(FF.marketOf().di,FF.C.dm,FF.C.dd,TT.demand):[];
 supply.concat(demand).forEach(function(b){mx=Math.max(mx,b.hi)});
 var dirWord=function(idx,tl){
  var v=FF.blur(FF.hor(idx,1,3,FF.C,tl)), g=Math.round((v[2]-v[0])*100);
  return g>=10?"up":g<=-10?"down":"flat";
 };
 var ctb=FF.isOver()?(FF.modContrib()||[]):null;
 return {
  rows:h, FC:FC, domain:domain, max:mx, maxInv:mxInv,
  nowDay:Math.min(FF.run().day-1,n), labelDay:Math.min(n,FF.run().day),
  supplyBand:supply, demandBand:demand,
  supplyDir:FC?dirWord(FF.marketOf().si,TT.supply):null, demandDir:FC?dirWord(FF.marketOf().di,TT.demand):null,
  events:FF.logOf().evlog.map(function(e){return {day:e.day,b:e.b}}),
  mods:FF.logOf().mods.map(function(m,i){return {day:m.day,kind:m.kind,contrib:ctb?ctb[i]:null}}),
  scored:!!ctb
 };
}

FF._endCardData=function(){
 var h=FF.hindsight(), u=FF.useRate(FF.C.days);
 var mine=Math.round(FF.ledger().cash-h.base), opt=Math.round(h.best.v-h.base);
 var dw=FF.dwellMedian(FF.C.days), lp=FF.invPerf(FF.C.days);
 return {
  bust:FF.isBust(),
  cash:FF.ledger().cash, seed:FF.run().seed,
  vsIdle:mine, vsHindsight:mine-opt,
  baseContract:h.best.i, baseSales:h.best.s,
  buysContract:FF.plant().buys.contract||0, contractSize:FF.myContractSize(), buysSales:FF.plant().buys.sales,
  spent:FF.ledger().spent, salvaged:FF.ledger().salvaged||0,
  inv:FF.inventory(), capIntake:FF.plant().cap.intake, capShipping:FF.plant().cap.sales,
  dwellMed:dw?dw.med:null, dwellP90:dw?dw.p90:null,
  lossPct:lp?Math.round(lp.loss*100):null,
  useIntake:u.intake, useShipping:u.sales,
  demandPhase:[FF.cnt(1,0),FF.cnt(1,1),FF.cnt(1,2)],
  supplyPhase:[FF.cnt(0,0),FF.cnt(0,1),FF.cnt(0,2)]
 };
}

FF.endCardData=FF.memo(FF._endCardData);
FF.chartData=FF.memo(FF._chartData);
FF.missedMatrix=function(){
 var gs=FF.missedGroups();
 if(!gs)return null;
 var kinds=gs.map(function(g){return g.kind});
 var maint={};
 gs.forEach(function(g){maint[g.kind]=g.maint});
 var byDay={};
 gs.forEach(function(g){
  g.rows.forEach(function(r){
   if(!byDay[r.day])byDay[r.day]={day:r.day,cells:{}};
   byDay[r.day].cells[g.kind]={gain:r.gain,delta:r.delta,flat:r.flat};
  });
 });
 var days=Object.keys(byDay).map(Number).sort(function(x,y){return x-y});
 var best={};
 kinds.forEach(function(k){
  var top=null;
  days.forEach(function(d){var c=byDay[d].cells[k];if(c&&(top===null||c.gain>top))top=c.gain});
  best[k]=top;
 });
 return {kinds:kinds,maint:maint,best:best,rows:days.map(function(d){return byDay[d]})};
}

// 전략 비교. 같은 난수열로 여러 전략을 돌려 평균을 낸다.
// 전략은 계획표, 함수, 규칙 배열 무엇이든 된다.

// 계약은 첫날에 크기를 고르는 결정이다. 사후에 어느 크기가 최선이었는지 남긴다.
FF.contractChance=function(){
 if(!FF.isOver())return null;
 var mine=FF.myContractSize();
 var full=FF.currentPlan();
 var XS=FF.C.contract.options.map(function(o){return o.x})
   .filter(function(x){return x!==mine});
 if(!XS.length)return null;
 var vs=XS.map(function(x){
  var p={};for(var d in full)p[d]=full[d];
  if(x>0)p[1]="contract:"+x; else delete p[1];
  return {at:1,plan:p};
 });
 var r=FF.simulate(FF.run().seed,full,vs);
 var best={x:mine,gain:0};
 for(var i=0;i<XS.length;i++){
  var g=Math.round(r.variants[i]-r.base);
  if(g>best.gain)best={x:XS[i],gain:g};
 }
 return {mine:mine,x:best.x,gain:best.gain};
}

// 최근 며칠의 추세. 실시간 화면에서 변화를 읽는 데 쓴다.
FF.recentSeries=function(n){
 var H=FF.histOf().slice(-(n||8));
 return {
  stock:H.map(function(r){return r.end}),
  missed:H.map(function(r){return r.missed}),
  days:H.map(function(r){return r.day})
 };
}

// 판로 현황. 관계와 오늘 배분을 화면이 읽는 형태로 만든다.
FF.channelRows=function(){
 var rel=FF.relOf(), al=FF.allocOf();
 var sum=0;
 if(al)for(var i=0;i<al.length;i++)sum+=al[i];
 return FF.C.channels.map(function(c,i){
  return {key:c.key, rel:rel[i], quota:c.quota, settle:c.settle,
    share:(al&&sum>0)?(al[i]/sum):null,
    price:Math.round(c.price[0]*FF.C.rel.price[rel[i]]),
    cap:Math.round(c.cap*FF.C.rel.cap[rel[i]]),
    floor:(c.key==="fran")?Math.round(c.quota*FF.C.rel.floor[rel[i]]):0};
 });
}

FF.rInt=function(n){return Math.round(n)}
// 오늘 판로가 받을 수 있는 양은 이월 재고뿐 아니라 오늘 입고분도 포함한다.
// 오늘 생산은 정책을 정하기 전에 이미 확정되어 있다(FF.revealToday). 더 이상 국면 평균으로
// 추정하지 않는다. 실제 입고(커널의 stored)는 생산·입고한도·목표재고(need)뿐 아니라
// 창고 여유(storage)와 현금(cash) 두 곳에서 더 막힐 수 있다. 그래서 이 함수는 커널과 같은
// FF.intakePhysical로 창고 단계까지 낸 뒤, 같은 현금 예산식을 한 번 더 건다. 하나만 계산해서
// 둘 다 쓰면, 여기와 커널이 서로 다른 값을 낼 위험이 없다. stepState는 오늘 만기인 매출채권을
// 현금으로 먼저 바꾸고 매입채무(AP)를 먼저 갚은 뒤 입고 예산을 보므로, 여기서도 같은 순서로
// 오늘 만기 AR은 더하고 오늘 만기 AP는 뺀다.
// 이슈 #10으로 초기자본이 낮아져서 현금이 실제로 입고를 막는 날이 생기자, 이 단계들이
// 빠진 미리보기가 실제 입고와 어긋나는 게 invariant sweep에서 드러났다. 이슈 #11로 AP가
// 추가되면서 같은 이유로 AP 만기도 빠뜨리면 다시 어긋난다.
FF.todayIntake=function(){
 var M=FF.marketOf(), caps=FF.capsOf();
 if(!M||!caps)return 0;
 var prod=FF.prodOf()||0;
 var need=FF.intakeNeed(M.di,caps.sales,FF.coverOf(),FF.inventory());
 var contract=FF.effectiveContract();
 var IP=FF.intakePhysical(prod,caps.intake,caps.storage,contract,need,FF.inventory());
 var stored=IP.stored;
 var day=FF.dayOf();
 var arDueToday=(FF.arOf()||[]).filter(function(x){return x.at<=day})
   .reduce(function(a,x){return a+x.amt},0);
 var apDueToday=(FF.apOf()||[]).filter(function(x){return x.at<=day})
   .reduce(function(a,x){return a+x.amt},0);
 var budget=Math.max(0,FF.ledger().cash+arDueToday-apDueToday-FF.C.fixed);
 var payable=FF.C.farm>0?Math.min(stored,Math.floor(budget/FF.C.farm)):stored;
 return FF.rInt(payable);
}
// AP(매입채무) 상태 미리보기. 자동 완충장치라 플레이어가 조작하진 않지만, 현금이 "왜"
// 이렇게 남았는지 화면이 설명하려면 필요하다. stepState가 오늘 실제로 매기는 것과 같은
// FF.apAvgSpend/FF.apCreditLimit/FF.apAvailableCredit을 그대로 쓴다.
FF.apStatus=function(){
 FF.VERSION.value;
 var avgSpend=FF.apAvgSpend(FF.apHistOf());
 var creditLimit=FF.apCreditLimit(avgSpend);
 var outstanding=FF.sumAmt(FF.apOf());
 var available=FF.apAvailableCredit(creditLimit,outstanding);
 return {outstanding:FF.rInt(outstanding),available:FF.rInt(available),creditLimit:FF.rInt(creditLimit)};
}
// Factoring 노출 여부와 제안 금액. runway5가 문턱(FF.C.ui.factorThreshold, 노출 전용) 밑이고
// 조기현금화할 AR이 있을 때만 eligible이다. suggested는 runway5를 정확히 0으로 되돌리는
// 최소 금액이다(= max(0,-runway5)) - 노출 문턱값을 경제 목표치로 다시 쓰지 않기 위해서다.
// 커널이 실제로 적용할 때 쓰는 것과 같은 FF.factorRunway/FF.applyFactoring을 그대로 쓴다.
FF.factorPlan=function(){
 FF.VERSION.value;
 var ar=FF.arOf(), outstanding=FF.sumAmt(ar);
 if(outstanding<=FF.C.ui.zero)return {eligible:false,outstanding:0};
 var day=FF.dayOf(), M=FF.marketOf(), caps=FF.capsOf();
 var need=FF.intakeNeed(M.di,caps.sales,FF.coverOf(),FF.inventory());
 var IP=FF.intakePhysical(FF.prodOf()||0,caps.intake,caps.storage,FF.effectiveContract(),need,FF.inventory());
 var runway=FF.factorRunway(FF.ledger().cash,ar,day,IP.stored);
 var needed=Math.max(0,-runway);
 var suggested=Math.min(needed,outstanding);
 var preview=FF.applyFactoring(ar,suggested,day);
 return {eligible:runway<FF.C.ui.factorThreshold,runway:FF.rInt(runway),
  outstanding:FF.rInt(outstanding),suggested:FF.rInt(suggested),
  previewCashIn:FF.rInt(preview.cashIn),previewCost:FF.rInt(preview.cost)};
}
// 오늘 판로별 예상 수요 한도. 커널이 world 로 뽑는 값과 같은 공식을 국면 평균으로 대신 쓴다.
// 실제 값은 이것과 다를 수 있다. 화면은 이것으로 미리보기만 만든다.
// FF.C.dm은 실 단위 전망이고 cap2/fl(채널 cap·quota 기반)은 확정 수량 척도라 d0에만 2를 곱해 맞춘다.
FF.estChannelDemand=function(i){
 var M=FF.marketOf(); if(!M)return 0;
 var CH=FF.C.channels, R=FF.C.rel, rel=FF.relOf()[i]===undefined?R.start:FF.relOf()[i];
 var totCap=0; for(var k=0;k<CH.length;k++)totCap+=CH[k].cap;
 var cap2=CH[i].cap*R.cap[rel];
 var d0=FF.C.dm[M.di]*2*CH[i].cap/totCap;
 var fl=CH[i].key==="fran"?CH[i].quota*R.floor[rel]:0;
 return Math.min(cap2,Math.max(d0,fl));
}
// 판로 태도. 정하지 않았으면 기본값이다.
FF.stanceLevel=function(i){
 var s2=FF.stanceOf();
 return (s2&&s2.length===FF.C.channels.length)?s2[i]:FF.C.stance.start;
}
// 한 판로의 태도를 한 단계 돌린다. 다른 판로는 지금 값을 그대로 지킨다.
// 판로 하나의 태도를 직접 정한다. 순환이 아니라 원하는 단계로 바로 간다.
FF.setChannelStance=function(i,level){
 var n=FF.C.channels.length, cur=[];
 for(var k=0;k<n;k++)cur.push(FF.stanceLevel(k));
 cur[i]=level;
 FF.setStance(cur); FF.repaint();
}
FF.clearStance=function(){FF.setStance(null);FF.repaint()}
// 오래된 재고. ttl(부패까지 날수)의 절반을 넘긴 lot 을 오래된 것으로 본다.
FF.oldStock=function(){
 FF.VERSION.value;
 var lots=FF.lotsOf(), th=Math.floor(FF.C.ttl/2), t=0;
 for(var i=0;i<lots.length;i++)if(lots[i].a>=th)t+=lots[i].q;
 return FF.rInt(t);
}
// 오늘 배분 미리보기. 커널과 같은 FF.allocatePool을 평균 수요로 부른다.
// 실제 실행은 같은 함수를 실제 난수 수요로 부르므로 규칙은 같고 입력만 다르다.
FF.stancePlan=function(){
 FF.observe();
 var rows=FF.channelRows(), n=rows.length;
 var levels=rows.map(function(r,i){return FF.stanceLevel(i)});
 var est=rows.map(function(r,i){return FF.rInt(FF.estChannelDemand(i))});
 // 재고를 먼저 정수로 반올림한 뒤 이 정수로만 pool을 계산한다. 원값(inv)과 반올림값(invR)이
 // 하필 .5 근처면 반올림 방향이 서로 달라질 수 있어서, 화면에 보이는 재고+입고 합과 pool이
 // 어긋나 보일 수 있었다(예: inv=0.4999...→표시 0t, inv+exp=17.5→반올림 18t).
 var inv=FF.inventory(), invR=FF.rInt(inv), exp=FF.todayIntake(), caps=FF.capsOf();
 var totCap=0, i; for(i=0;i<n;i++)totCap+=rows[i].cap;
 var pool=Math.min(invR+exp,totCap,caps?caps.sales:totCap);
 // allocatePool은 소수를 낸다. 커널 실행과 같은 FF.roundAllocation으로 한 번만 정수화한다.
 var preview=FF.roundAllocation(FF.allocatePool(pool,est.slice(),levels,
   rows.map(function(r){return r.quota})),pool);
 var sum=0; for(i=0;i<n;i++)sum+=preview[i];
 // 기회비용: 주문은 있는데 다른 판로 우선 때문에 못 받는 양이다.
 var missed=est.map(function(e,idx){return FF.rInt(Math.max(0,e-preview[idx]))});
 // 화면이 재고+입고를 다시 더하거나 pool-sum을 다시 빼지 않도록 여기서 낸다.
 return {rows:rows,levels:levels,est:est,preview:preview,missed:missed,inv:invR,exp:exp,
  pool:pool,sum:FF.rInt(sum),sellable:invR+exp,unassigned:Math.max(0,pool-FF.rInt(sum))};
}

// 오늘(curr) 확정 상태. 정책을 정하기 전에도 이미 정해져 있는 값들이다.
FF._factsCurrState=function(out){
 var caps=FF.capsOf();
 if(caps){
  out.push(FF.fact("curr","state","capacity",null,"intake",caps.intake));
  out.push(FF.fact("curr","state","capacity",null,"storage",caps.storage));
  out.push(FF.fact("curr","state","capacity",null,"sales",caps.sales));
 }
 out.push(FF.fact("curr","state","inventory",null,"stock",FF.rInt(FF.inventory())));
 out.push(FF.fact("curr","state","finance",null,"cash",FF.ledger().cash));
 out.push(FF.fact("curr","state","contract",null,"active",FF.contractOf()));
 out.push(FF.fact("curr","state","contract",null,"pending",FF.pendContractOf()));
 FF.channelRows().forEach(function(r){
  out.push(FF.fact("curr","state","relation",r.key,"level",r.rel));
  out.push(FF.fact("curr","state","allocation",r.key,"quota",r.quota));
  out.push(FF.fact("curr","state","allocation",r.key,"cap",r.cap));
  out.push(FF.fact("curr","state","allocation",r.key,"floor",r.floor));
  out.push(FF.fact("curr","state","finance",r.key,"price",r.price));
 });
}

// 오늘(curr) 계획/전망. 하루를 넘기기 전 미리보기다. 실제 값과 다를 수 있다.
FF._factsCurrPlan=function(out){
 var P=FF.stancePlan();
 out.push(FF.fact("curr","plan","inventory",null,"pool",P.pool));
 out.push(FF.fact("curr","plan","inventory",null,"assigned",P.sum));
 out.push(FF.fact("curr","plan","inventory",null,"sellable",P.sellable));
 out.push(FF.fact("curr","plan","inventory",null,"unassigned",P.unassigned));
 // 오늘 입고는 확정 생산 기반이라 더 이상 전망이 아니다. curr.state로 분류한다.
 out.push(FF.fact("curr","state","supply",null,"intake",P.exp));
 P.rows.forEach(function(r,i){
  out.push(FF.fact("curr","plan","allocation",r.key,"stance",P.levels[i]));
  out.push(FF.fact("curr","plan","allocation",r.key,"assigned",P.preview[i]));
  out.push(FF.fact("curr","forecast","demand",r.key,"order",P.est[i]));
  out.push(FF.fact("curr","plan","allocation",r.key,"missed",P.missed[i]));
 });
}

// 어제(prev) 결과. 하루를 넘긴 뒤에만 있다. 아직 없으면 아무 사실도 안 낸다.
FF._factsPrevResult=function(out){
 var d=FF.today();
 if(!d)return;
 out.push(FF.fact("prev","result","bottleneck",null,"cause",d.b));
 var li=FF.lostInflow(d);
 out.push(FF.fact("prev","result","inventory",null,"lostInflow",li?li.total:0));
 var boost=FF.contractBoostToday();
 if(boost>0)out.push(FF.fact("prev","result","contract",null,"boost",boost));
 FF.C.channels.forEach(function(c,i){
  out.push(FF.fact("prev","result","allocation",c.key,"sold",FF.rInt(d.toCh?d.toCh[i]:0)));
  out.push(FF.fact("prev","result","finance",c.key,"revenue",Math.round(d.revCh?d.revCh[i]:0)));
  out.push(FF.fact("prev","result","relation",c.key,"level",d.rel?d.rel[i]:FF.C.rel.start));
 });
}

// 지금 낼 수 있는 사실을 전부 모은다. 배열 순서는 뜻이 없다. 소비자가 원하는 축으로 다시 묶는다.
FF.facts=function(){
 FF.observe();
 var out=[];
 FF._factsCurrState(out);
 FF._factsCurrPlan(out);
 FF._factsPrevResult(out);
 return out;
}

// 판로 중심 투영. 화면(판로 카드)이 쓰기 좋은 모양이다. 사실을 판로별로 다시 묶는다.
FF.factsByChannel=function(){
 var facts=FF.facts(), by={};
 FF.C.channels.forEach(function(c){by[c.key]={key:c.key}});
 facts.forEach(function(f){
  if(!f.channel||!by[f.channel])return;
  by[f.channel][FF._factKey(f)]=f.value;
 });
 return FF.C.channels.map(function(c){return by[c.key]});
}

// 판로에 묶이지 않은 사실만 키로 묶는다. 화면 상단(판매 가능/미배정 등)이 쓴다.
FF.factsGlobal=function(){
 var facts=FF.facts(), out={};
 facts.forEach(function(f){if(!f.channel)out[FF._factKey(f)]=f.value});
 return out;
}

// 회복 가능성. "가능"은 오늘 보장으로 두면 쿼터를 채울 수 있다는 뜻이다. 확정이 아니라 오늘 조건 판정이다.
FF.issueFeasible=function(i){
 var left=FF.C.days-FF.dayOf();
 if(left<FF.C.rel.up)return "low";
 return FF.estChannelDemand(i)>=FF.C.channels[i].quota-FF.C.ui.zero?"ok":"hard";
}
// 오늘 계약으로 기본 입고 한도를 넘겨 추가로 받은 양. 계약이 없거나 안 걸렸으면 0이다.
// acc/capI가 이제 확정 정수라 소수가 남을 일이 없다.
FF.contractBoostToday=function(){
 var d=FF.today();
 if(!d||d.capI===undefined)return 0;
 return Math.max(0,d.acc-d.capI);
}
// 초과분 계약 누적 효과. 발동일수와 추가 입고는 기록에서 바로 센다.
// 순이익 기여는 계약 없이 다시 돌린 결과와의 차이(반사실)를 modRows에서 그대로 가져온다.
FF.contractStats=function(){
 FF.observe();
 var mods=FF.logOf().mods, m=null, i;
 for(i=0;i<mods.length;i++)if(mods[i].kind==="contract")m=mods[i];
 if(!m)return null;
 var h=FF.histOf(), hitDays=0, extra=0;
 for(i=0;i<h.length;i++){
  if(h[i].day<=m.day||h[i].capI===undefined)continue;
  var over=Math.max(0,h[i].acc-h[i].capI);
  if(over>=FF.C.ui.zero){hitDays++; extra+=over;}
 }
 var rows=FF.modRows(), contrib=0;
 for(i=0;i<rows.length;i++)if(rows[i].kind==="contract")contrib=rows[i].contrib;
 var opt=FF.contractOption(m.size||0);
 return {size:m.size||0,cost:opt?opt.price:0,hitDays:hitDays,extra:FF.rInt(extra),contrib:contrib};
}
// 화면이 그릴 신호와 이슈. 도메인 규칙은 여기 없다. 코드값만 옮긴다.
// 당일 결과. 판로별 판매량과 매출과 관계 변화를 하루 실행 직후 보여준다.
FF.dayChannelResult=function(){
 FF.observe();
 var days=FF.factsByDay();
 if(!days.length)return null;
 var today=days[days.length-1];
 return FF.C.channels.map(function(c){
  var row=today.channels[c.key]||{};
  return {key:c.key,sold:FF.rInt(row["allocation.sold"]||0),revenue:Math.round(row["finance.revenue"]||0),
   relFrom:row["relation.levelBefore"],relTo:row["relation.level"],changed:!!row["relation.changed"]};
 });
}
// 사건 이력. 지금까지 발생한 관계 신호를 그대로 돌려준다. 화면 문구는 여기 없다.
FF.relLogOf=function(){FF.VERSION.value;return FF.RUN.value?FF.logOf().relLog:[]}
// 관계 포트폴리오 복기. 판로마다 이번 판 전체의 관계 경로를 낸다.
FF.relPortfolio=function(){
 FF.observe();
 var h=FF.histOf();
 return FF.C.channels.map(function(c,i){
  var series=h.map(function(row){return row.rel?row.rel[i]:FF.C.rel.start});
  return {key:c.key,series:series,final:series.length?series[series.length-1]:FF.C.rel.start};
 });
}
// 판로별 누적 판매와 매출. 하루치가 아니라 이번 판 전체 합이다.
FF.channelTotals=function(){
 FF.observe();
 var facts=FF.historyFacts(), sold={}, rev={};
 FF.C.channels.forEach(function(c){sold[c.key]=0;rev[c.key]=0});
 facts.forEach(function(f){
  if(!f.channel||sold[f.channel]===undefined)return;
  if(f.domain==="allocation"&&f.metric==="sold")sold[f.channel]+=f.value;
  if(f.domain==="finance"&&f.metric==="revenue")rev[f.channel]+=f.value;
 });
 return FF.C.channels.map(function(c){return {key:c.key,sold:FF.rInt(sold[c.key]),revenue:Math.round(rev[c.key])}});
}
// 관계 전환점. 언제 무엇이 바뀌었고 그날 어떤 태도를 두고 있었는지 남긴다.
FF.relTimeline=function(){
 FF.observe();
 var log=FF.relLogOf(), h=FF.histOf();
 return log.map(function(s){
  var row=null;
  for(var d=0;d<h.length;d++)if(h[d].day===s.day){row=h[d];break}
  var level=(row&&row.stance)?row.stance[s.i]:FF.C.stance.start;
  return {type:s.type,i:s.i,day:s.day,from:s.from,to:s.to,level:level};
 });
}
// 주요 결정 복기. 판로 태도가 바뀐 날마다 전후와 그날 관계를 남긴다.
FF.policyChanges=function(){
 FF.observe();
 var days=FF.factsByDay(), out=[], prevSt=null;
 days.forEach(function(row){
  var st=FF.C.channels.map(function(c){return row.channels[c.key]["allocation.stance"]});
  if(prevSt){
   FF.C.channels.forEach(function(c,i){
    if(st[i]!==prevSt[i])out.push({day:row.day,i:i,from:prevSt[i],to:st[i],relAfter:row.channels[c.key]["relation.level"]});
   });
  }
  prevSt=st;
 });
 return out;
}
FF.issuePlan=function(){
 FF.observe();
 var issues=FF.issueOf(), rel=FF.relOf();
 var P=FF.stancePlan();
 var openList=[];
 for(var i=0;i<issues.length;i++){
  if(!issues[i])continue;
  openList.push({i:i,since:issues[i].since,resolution:issues[i].resolution,
   days:FF.dayOf()-issues[i].since,rel:rel[i],feasible:FF.issueFeasible(i),
   level:P.levels[i],preview:P.preview[i],quota:P.rows[i].quota});
 }
 return {signals:FF.signalOf(),issues:openList};
}
// 이슈를 의도적 포기로 표시한다. 게임 규칙은 바뀌지 않는다. 화면 상태만 바뀐다.
FF.acceptIssue=function(i){
 var issues=FF.issueOf().slice();
 if(issues[i])issues[i]={since:issues[i].since,resolution:"accepted"};
 FF.setIssue(issues); FF.repaint();
}
