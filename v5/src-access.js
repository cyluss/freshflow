// 어제 병목(b)이 실제로 뭔가 놓친 경우인지. supply/demand/policy는 용량이 남았을 뿐 손실이 아니다.
FF.isLossCause=function(b){return b==="intake"||b==="store"||b==="ship"||b==="stock"}

// 오늘 있을 하루에 실제로 걸릴 계약량. 이미 활성화됐거나(contract), 어제 사서 오늘부터 걸리거나(pendContract) 둘 중 하나다.
// 미리보기(expectedIntake 등)는 이 값을 써야 "계약 다음날부터 적용"이 화면에서도 하루 안 어긋난다.
FF.effectiveContract=function(){return FF.contractOf()||FF.pendContractOf()||0}

// 내일 적용될 증설. 화면이 쓰는 읽기 접근자다.
// 지금 매입 목표. 화면과 커널 어댑터가 쓴다.
FF.arOf=function(){FF.VERSION.value;return FF.AR.value||[]}
FF.relOf=function(){FF.VERSION.value;
 return FF.REL.value||FF.C.channels.map(function(){return FF.C.rel.start})}
FF.allocOf=function(){FF.VERSION.value;return FF.ALLOC.value}
FF.stanceOf=function(){FF.VERSION.value;return FF.STANCE.value}
FF.issueOf=function(){FF.VERSION.value;return FF.ISSUE.value||FF.C.channels.map(function(){return null})}
FF.signalOf=function(){FF.VERSION.value;return FF.SIGNAL.value||[]}
FF.coverOf=function(){FF.VERSION.value;return FF.COVER.value===null?FF.C.cover:FF.COVER.value}
FF.dayOf=function(){FF.VERSION.value;return FF.RUN.value?FF.run().day:1}
FF.started=function(){FF.VERSION.value;return !!(FF.RUN.value&&FF.histOf().length)}
FF.today=function(){FF.VERSION.value;return (FF.RUN.value&&FF.histOf().length)?FF.histOf()[FF.histOf().length-1]:null}
FF.histLen=function(){FF.VERSION.value;return FF.RUN.value?FF.histOf().length:0}
FF.recent=function(n){FF.VERSION.value;return FF.RUN.value?FF.histOf().slice(-n):[]}
FF.status=function(){FF.VERSION.value;
 return FF.RUN.value?{day:Math.min(FF.run().day,FF.C.days),cash:FF.LEDGER.value.cash,seed:FF.run().seed,
  profit:FF.histOf().length?FF.histOf()[FF.histOf().length-1].profit:null}:null}
FF.capsOf=function(){FF.VERSION.value;return FF.RUN.value?{intake:FF.plant().cap.intake,storage:FF.plant().cap.storage,sales:FF.plant().cap.sales}:null}
FF.finDayOf=function(){FF.VERSION.value;return FF.RUN.value?FF.run().finDay:0}
FF.timelineOf=function(){FF.VERSION.value;return FF.RUN.value?FF.logOf().timeline:[]}
FF.buylogOf=function(){FF.VERSION.value;return FF.RUN.value?FF.logOf().buylog:[]}
FF.buysOf=function(){FF.VERSION.value;return FF.RUN.value?{sales:FF.plant().buys.sales,contract:FF.plant().buys.contract||0,spent:FF.LEDGER.value.spent}:null}

FF.Cmd={
 wait:function(){return {type:"wait"}},
 buy:function(capacity){return {type:"buy",capacity:capacity}},
 contract:function(size){return {type:"contract",size:size}},
 policy:function(cover){return {type:"policy",cover:cover}},
 sell:function(alloc){return {type:"sell",alloc:alloc}},
 stance:function(levels){return {type:"sell",stance:levels}},
 finish:function(){return {type:"finish"}}
};
// 계획표의 한 칸을 명령으로 바꾼다. "sales" 또는 "contract:1.5" 또는 빈 값이다.
FF.planCmd=function(action){
 if(!action)return FF.Cmd.wait();
 if(typeof action==="string"&&action.indexOf("contract")===0){
  var i=action.indexOf(":");
  return FF.Cmd.contract(i>0?parseFloat(action.slice(i+1)):1);
 }
 return FF.Cmd.buy(action);
}

FF.applyKernelState=function(s,r,pendBefore){
 FF.setLots(s.lots);
 if(pendBefore)FF.expand(pendBefore);
 FF.setPending(s.pend);
 FF.setRel((s.rel||[]).slice());
 FF.setAr((s.ar||[]).slice());
 if(s.alloc)FF.setAlloc(s.alloc.slice());
 if(s.stance)FF.setStance(s.stance.slice());
 if(r.bought==="contract"){FF.spend(r.cost);FF.countBuy("contract")}
 else if(r.bought){FF.spend(r.cost);FF.countBuy(r.bought)}
 // 계약은 산 날 다음 거래부터 걸린다. 산 날은 pendContract만 서고, 다음 날 여기서 contract로 넘어온다.
 FF.setContract(s.contract||0);
 FF.setPendContract(s.pendContract||null);
 // 커널이 계산한 현금을 그대로 옮긴다. 매출채권은 따로 남는다.
 FF.addCash(s.cash-FF.ledger().cash);
}
// 하루를 넘긴다. 기록이 끝난 뒤에 부른다.
FF.advanceDay=function(s){
 FF.nextDay();
 FF.setMarket(s.si,s.di);
}
FF.toKernelState=function(){
 var M=FF.MARKET.value, P=FF.plant(), L=FF.ledger();
 return {day:FF.run().day,si:M.si,di:M.di,cash:L.cash,lots:FF.lotsOf().slice(),
  cap:{intake:P.cap.intake,storage:P.cap.storage,sales:P.cap.sales},
  pend:FF.PENDING.value,spent:L.spent,contract:FF.CONTRACT.value,pendContract:FF.pendContractOf(),cover:FF.coverOf(),
  rel:FF.relOf().slice(),alloc:FF.allocOf(),stance:FF.stanceOf(),ar:(FF.arOf()||[]).slice(),
  buys:{sales:P.buys.sales,contract:P.buys.contract||0}};

}


