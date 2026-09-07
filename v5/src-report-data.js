
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
FF.capWord=function(v,cap){return v>=cap-FF.C.ui.eps?"at":(v>=cap*FF.C.ui.nearCap?"near":"free")};
FF.storeWord=function(v){var r=v/FF.C.cap.storage;return r>=FF.C.ui.storeFull?"full":(r>=FF.C.ui.storeMid?"mid":"free")};

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



FF._matrixData=function(){
 var h=FF.histOf();
 if(h.length<2)return null;
 var days=h.slice(-FF.C.ui.matrixDays);
 var FC=(!FF.isOver()&&FF.run().day<=FF.C.days)?FF.C.ui.fcDays:0;
 var SUP=["low","mid","high"], DEM=["weak","mid","strong"];
 var modOn={}, evOn={};
 FF.logOf().mods.forEach(function(m){modOn[m.day]=m.kind});
 FF.logOf().evlog.forEach(function(e){evOn[e.day]=e.b});
 var futPhase=function(idx,W,tl){
  var a=[];
  for(var dd=1;dd<=FC;dd++){
   var v=FF.blur(FF.hor(idx,dd,dd,FF.C,tl)), b=0;
   for(var t=1;t<3;t++)if(v[t]>v[b])b=t;
   a.push(W[b]);
  }
  return a;
 };
 var mk=function(name,group,vals,fut,warn){
  return {name:name,group:group,cells:vals.map(function(v){
   return {code:v, warn:warn?warn(v):false, muted:(v===null)};
  }), future:(fut||[])};
 };
 return {
  days:days.map(function(r){return r.day}), FC:FC,
  left:Math.max(0,FF.C.days-FF.run().day+1), over:FF.isOver(),
  rows:[
   mk("supply","supply",days.map(function(r){return SUP[r.si]}),FC?futPhase(FF.marketOf().si,SUP,FF.tiltOf().supply):null,function(v){return v==="low"}),
   mk("intake","cap",days.map(function(r){return FF.capWord(r.acc,r.capI)}),null,function(v){return v==="at"}),
   mk("storage","store",days.map(function(r){return FF.storeWord(r.end)}),null,function(v){return v==="full"}),
   mk("sales","cap",days.map(function(r){return FF.capWord(r.sold,r.capS)}),null,function(v){return v==="at"}),
   mk("demand","demand",days.map(function(r){return DEM[r.di]}),FC?futPhase(FF.marketOf().di,DEM,FF.tiltOf().demand):null,function(v){return v==="weak"}),
   mk("event","event",days.map(function(r){return evOn[r.day]||null}),null,function(v){return v!==null}),
   mk("mod","kind",days.map(function(r){return modOn[r.day]||null}),null,null)
  ]
 };
}


FF.matrixData=FF.memo(FF._matrixData);

FF.monthOutlook=function(){
 var M=FF.marketOf();
 if(!M)return null;
 var n=FF.C.days, today=FF.run()?Math.min(FF.run().day,n):1;
 var left=n-today+1;
 if(left<3)return null;
 var w=Math.round(left/3), w2=Math.round(left*2/3);
 var spans=[{key:"early",from:today,to:today+w-1},
            {key:"mid",from:today+w,to:today+w2-1},
            {key:"late",from:today+w2,to:n}];
 var row=function(idx,tl){
  return spans.map(function(s){
   // 오늘 국면에서 몇 일 뒤인지로 전이를 돌린다
   return {key:s.key,from:s.from,to:s.to,
     pct:FF.pct(FF.blur(FF.hor(idx,s.from-today+1,s.to-today+1,FF.C,tl)))};
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

FF.contribRows=function(){
 var c=FF.modContrib()||[];
 return FF.logOf().mods.map(function(m,i){return {day:m.day,kind:m.kind,contrib:c[i]||0}});
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
    cap:Math.round(c.cap*FF.C.rel.cap[rel[i]]*10)/10,
    floor:(c.key==="fran")?Math.round(c.quota*FF.C.rel.floor[rel[i]]*10)/10:0};
 });
}

// 판로 배분. 화면은 톤으로 다루고 커널은 비중으로 읽는다.
// 합이 목표 총합과 같으면 톤과 비중이 같은 값을 가리킨다.
FF.ALLOC_STEP=0.5;
FF.r1=function(n){return Math.round(n*10)/10}
// 배분을 두지 않았을 때 커널이 하는 일이다. 단가 높은 판로부터 상한까지 채운다.
FF.autoAlloc=function(rows,target){
 var out=rows.map(function(){return 0}), left=target;
 var idx=rows.map(function(r,i){return i});
 idx.sort(function(a,b){return rows[b].price-rows[a].price});
 for(var k=0;k<idx.length;k++){
  var i=idx[k], t=Math.min(left,rows[i].cap);
  out[i]=FF.r1(t); left-=t;
 }
 return out;
}
// 오늘 배분 화면 모형. 판로 상한 합이 실제 천장이라 판매 한도는 여기 없다.
FF.allocPlan=function(){
 FF.observe();
 var rows=FF.channelRows(), inv=FF.inventory();
 var caps=rows.map(function(r){return r.cap});
 var totCap=0, i;
 for(i=0;i<caps.length;i++)totCap+=caps[i];
 var target=FF.r1(Math.min(inv,totCap));
 var raw=FF.allocOf(), auto=!raw||raw.length!==rows.length;
 var tons=auto?FF.autoAlloc(rows,target):raw.slice();
 var sum=0;
 for(i=0;i<tons.length;i++)sum+=tons[i];
 return {rows:rows,caps:caps,tons:tons,inv:FF.r1(inv),target:target,
  sum:FF.r1(sum),rest:FF.r1(target-sum),auto:auto};
}
// 한 판로의 톤을 정한다. 잔여와 판로 상한 안으로 즉시 당긴다.
FF.setChannelTons=function(i,v){
 if(typeof v!=="number"||isNaN(v))return;
 var P=FF.allocPlan(), tons=P.tons.slice();
 var ceil=Math.min(P.caps[i],tons[i]+Math.max(0,P.rest));
 tons[i]=FF.r1(Math.max(0,Math.min(ceil,v)));
 FF.setAlloc(tons); FF.repaint();
}
FF.bumpChannel=function(i,dir){
 var P=FF.allocPlan();
 FF.setChannelTons(i,P.tons[i]+dir*FF.ALLOC_STEP);
}
// 배분을 지운다. 커널이 다시 단가 순으로 판다.
FF.clearAlloc=function(){FF.setAlloc(null);FF.repaint()}
