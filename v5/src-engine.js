FF.reset=function(seed){FF.SIG.fin.value=false;FF.SIG.manual.value=false;FF.SIG.newGame.value=false;FF.EVENT.value=null;FF.PENDING.value=null;FF.PHASE.value="play";FF.resetRecover();FF.setContract(0);FF.setCover(FF.C.cover);FF.setRel(FF.C.channels.map(function(){return FF.C.rel.start}));FF.setAlloc(null);FF.setStance(null);FF.setIssue(null);FF.setSignal([]);FF.setAr([]);FF.setWorld(FF.World(seed));FF.setLots([]);FF.resetEngineState();FF.setMarket(FF.world().phase().supply,FF.world().phase().demand);FF.setTilt(FF.world().tilt());FF.resetLedger();FF.resetLog();FF.resetPlant();FF.resetRun(seed);
FF.setQueue([]);
 FF.setClock(false);
 FF.commit();FF.repaint()}


// 하루 물리. 물리는 이 함수에만 있다.
// s 를 제자리에서 전진시키고 그날의 관측치를 돌려준다.
// s = {si,di,cash,lots,cap:{intake,storage,sales}}  호출자가 필요하면 미리 복사해서 넘긴다.
FF.stepDay=function(cmd,path){
 if(FF.isOver())return;
 if(cmd.type==="finish"){FF.finishRun();return}
 var act=(cmd.type==="buy")?cmd.capacity:(cmd.type==="contract"?"contract":null);
 if(cmd.type==="policy")FF.setCover(cmd.cover);
 var pend=FF.PENDING.value;
 var prev=FF.histOf()[FF.histOf().length-1]||null;
 var atCapI=prev?prev.acc>=FF.plant().cap.intake-0.05:false;
 var atCapS=prev?prev.sold>=FF.plant().cap.sales-0.05:false;
 var price=(act==="contract")?(FF.contractOption(cmd.size)||{price:Infinity}).price:(act?FF.C.cost[act]:0);
 var willBuy=(act!==null&&FF.ledger().cash>=price
   &&(act!=="contract"||FF.contractOf()===0));
 if(willBuy)FF.recordPurchase(act,path,cmd.size);
 FF.recordDayStart(atCapI,atCapS,act);
 var s=FF.toKernelState();
 var send=willBuy?(act==="contract"?FF.Cmd.contract(cmd.size):FF.Cmd.buy(act))
   :((cmd.type==="sell"||cmd.type==="policy")?cmd:FF.Cmd.wait());
 var out=FF.transition(s,send,FF.world().next());
 var r=out.result;
 var prevRel=FF.relOf();
 FF.applyKernelState(s,r,pend);
 FF.recordDay(r,out.events);
 FF.recordIssues(prevRel,r);
 FF.advanceDay(s);
 if(FF.ledger().cash<=0){FF.setPhase("bust")}
 else if(FF.run().day>FF.C.days){
  if(!FF.isOver())FF.setSalvage(Math.round(FF.ledger().spent*FF.C.salvage));
  FF.setPhase("done");
 }
 FF.commit();
}





// 새 판. 시드를 주지 않으면 무작위로 고른다.
FF.startNew=function(seed){
 var v=parseInt(seed,10);
 FF.reset(v>0?v:Math.floor(Math.random()*99999)+1);
}

FF.finishRun=function(){
 if(FF.isOver())return;
 FF.markFinish();FF.commit();
 FF.append("timeline",{day:FF.run().day,type:"finish"});
 FF.setQueue([]);
 while(!FF.isOver())FF.stepDay(FF.Cmd.wait());
 FF.SIG.manual.value=false; FF.SIG.fin.value=false;
 FF.repaint();
}

// 실시간 진행. 하루 경계에서 대기 중인 결정 하나를 커밋하고 하루를 넘긴다.
// 하루 안 어느 시점에 눌렀는지는 결과에 영향을 주지 않는다.
FF.tickDay=function(){
 if(FF.isOver())return;
 var q=FF.queueOf().slice();
 var cmd=FF.Cmd.wait(), path=null;
 if(q.length){
  var head=q[0];
  cmd=(head.kind==="contract")?FF.Cmd.contract(head.size)
    :(head.kind==="policy")?FF.Cmd.policy(head.cover)
    :FF.Cmd.buy(head.kind);
  path=head.path||"manual";
  FF.setQueue(q.slice(1));
 }
 FF.stepDay(cmd,path);
 FF.rollRecover();
 FF.recordEvent();
 FF.SIG.manual.value=false;
 // 판이 끝나면 멈춘다. 병목이 바뀌는 것은 흔한 일이라 멈추지 않는다.
 if(FF.isOver())FF.setClock(false);
 FF.repaint();
}



