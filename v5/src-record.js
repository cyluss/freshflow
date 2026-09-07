FF.capHits=function(kind,win){
 var lastBlocked=false;
 var since=FF.engineState().lastBuy[kind];
 var h=[];
 for(var i=0;i<FF.histOf().length;i++)if(FF.histOf()[i].day>since)h.push(FF.histOf()[i]);
 h=h.slice(-win);
 var n=0;
 for(var j=0;j<h.length;j++){
  if(kind==="intake"&&h[j].acc>=h[j].capI-0.05)n++;
  if(kind==="sales"&&h[j].sold>=h[j].capS-0.05&&h[j].dem>h[j].sold+0.05)n++;
 }
 if(h.length){
  var z=h[h.length-1];
  lastBlocked=kind==="intake"?(z.acc>=z.capI-0.05):(z.sold>=z.capS-0.05&&z.dem>z.sold+0.05);
 }
 return{n:n,len:h.length,last:lastBlocked};
}

FF.useRate=function(n){
 var h=FF.histOf().slice(-n);
 if(!h.length)return{intake:0,sales:0};
 var a=0,b=0;
 for(var i=0;i<h.length;i++){a+=h[i].acc/FF.plant().cap.intake;b+=h[i].sold/FF.plant().cap.sales}
 return{intake:a/h.length*100,sales:b/h.length*100};
}

FF.recordDay=function(r,ev){
 FF.pushHist({day:FF.run().day,prod:r.prod,dem:r.dem,acc:r.acc,refused:r.refused,sold:r.sold,
  missed:r.missed,ageMix:r.ageMix,wI:r.wI,wIcap:r.wIcap,wIstore:r.wIstore,wIneed:r.wIneed,
  wS:r.wS,wT:r.wT,end:r.end,profit:r.profit-r.cost,b:r.b,
  si:FF.MARKET.value.si,di:FF.MARKET.value.di,
  capI:FF.plant().cap.intake,capS:FF.plant().cap.sales});
 for(var mi=0;mi<FF.logOf().mods.length;mi++){
  var md=FF.logOf().mods[mi];
  if(FF.run().day<=md.day)continue;
  md.use.push(md.kind==="contract"?(r.acc/FF.plant().cap.intake):(r.sold/FF.plant().cap.sales));
  md.extra=(md.extra||0)+(md.kind==="contract"?Math.max(0,r.acc-FF.plant().cap.intake):Math.max(0,r.sold-md.from));
  if(FF.run().day<=md.day+3){
   if(md.kind==="contract"&&r.acc>FF.plant().cap.intake+0.05)md.hit++;
   if(md.kind==="sales"&&r.sold>=FF.plant().cap.sales-0.05)md.hit++;
  }
 }
 var actionable=(r.b==="intake"||r.b==="ship"||r.b==="store"||r.b==="stock");
 var changed=(r.b!==FF.engineState().prevB);
 FF.engineState().prevB=r.b;
 FF.setEvent((actionable&&changed)?{b:r.b}:null);
 if(FF.evt())FF.append("evlog",{day:FF.run().day,b:r.b});
 if(ev)for(var q=0;q<ev.length;q++)if(ev[q].type==="purchase")
  FF.append("timeline",{day:ev[q].day,type:"buy",kind:ev[q].capacity,
   newCap:(ev[q].capacity==="contract")?FF.contractOf()
     :(FF.plant().cap[ev[q].capacity]+FF.C.step[ev[q].capacity])});
}

// 구매 순간의 관측치를 남긴다. 게임 규칙이 아니라 기록이다.
FF.recordPurchase=function(act,path,size){
 var day=FF.run().day;
 var T=FF.tiltOf();
 var svB=FF.pct(FF.blur(FF.hor(FF.MARKET.value.si,4,7,FF.C,T.supply)));
 var dvB=FF.pct(FF.blur(FF.hor(FF.MARKET.value.di,4,7,FF.C,T.demand)));
 if(act==="contract"){
  // 계약은 개장 전 결정이다. 근거는 관측이 아니라 월간 전망이다.
  size=size||FF.contractOf();
  FF.append("mods",{kind:act,day:day,idx:1,from:0,size:size,use:[],hit:0});
  FF.append("buylog",{day:day,kind:act,
   gap:dvB[2]-dvB[0], supplyGap:svB[2]-svB[0],
   tilt:T.demand, supplyTilt:T.supply,
   hitN:0,hitLen:0,left:FF.C.days-day,path:path||"manual",
   util:null,nth:1,cap:size});
  return;
 }
 FF.append("mods",{kind:act,day:day,idx:FF.plant().buys[act]+1,
   from:FF.plant().cap.sales,use:[],hit:0});
 var hB=FF.capHits(act,5),uB=FF.useRate(3);
 var gB=dvB[2]-dvB[0];
 var ES=FF.engineState();
 if(FF.dirOf(gB)!==0&&ES.phase[act].dir===FF.dirOf(gB))ES.phase[act].n++;
 else {ES.phase[act].dir=FF.dirOf(gB);ES.phase[act].n=FF.dirOf(gB)===0?0:1}
 ES.lastBuy[act]=day;
 FF.append("buylog",{day:day,kind:act,gap:gB,
  hitN:hB.n, hitLen:hB.len, left:FF.C.days-day, path:path||"manual",
  util:Math.round(uB.sales),
  nth:FF.plant().buys[act]+1,cap:FF.plant().cap.sales});
}

// 하루 시작 시점의 한도 도달 여부를 남긴다.
FF.recordDayStart=function(atCapIntake,atCapSales,act){
 FF.append("events",{day:FF.run().day,atCapIntake:atCapIntake,
   atCapShipping:atCapSales,bought:act||"none"});
}


// 새 사건을 진행 기록에 남긴다.
FF.recordEvent=function(){
 var ev=FF.evt();
 if(!ev)return;
 FF.append("timeline",{day:FF.run().day-1,type:"event",b:ev.b});
}
