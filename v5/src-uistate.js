FF.GAME=FF._signal(0);
FF.observe=function(){FF.GAME.value;FF.VERSION.value}
FF.QUEUE_S=FF._signal([]);
FF.queueOf=function(){FF.GAME.value;return FF.QUEUE_S.value}
FF.toggleBuy=function(kind,size){
 var q=FF.QUEUE_S.value, on=false, i;
 for(i=0;i<q.length;i++)if(q[i].kind===kind&&(kind!=="contract"||q[i].size===size))on=true;
 if(on){FF.setQueue(q.filter(function(x){return x.kind!==kind}));return}
 var price=(kind==="contract")
   ?(FF.contractOption(size)||{price:Infinity}).price
   :FF.C.cost[kind];
 if(FF.LEDGER.value.cash<price)return;
 FF.setQueue(q.filter(function(x){return x.kind!==kind})
   .concat([{kind:kind,size:size,path:FF.evt()?"event":"manual"}]));
}
FF.clearQueue=function(){FF.setQueue([])}
// 이슈 #11: AR 조기현금화 예약. buy/contract/policy와 같은 하루 한 슬롯이라 큐를 통째로
// 바꾼다(토글이 아니라 금액 선택이라 toggleBuy와는 모양이 다르다).
FF.queueFactor=function(amount){
 FF.setQueue(amount>0?[{kind:"factor",amount:amount,path:FF.evt()?"event":"manual"}]:[]);
}
FF.queuedFactorAmount=function(){
 var q=FF.queueOf();
 for(var i=0;i<q.length;i++)if(q[i].kind==="factor")return q[i].amount;
 return 0;
}
FF.setQueue=function(a){FF.QUEUE_S.value=a;FF.repaint()}
// 확인 대기 상태. 한 번 더 눌러야 실행되는 것들이다.
FF.SIG={fin:FF._signal(false),manual:FF._signal(false),newGame:FF._signal(false)};
// 증설 회수의 전일 값. 하루가 넘어갈 때 오늘 값이 어제 값이 된다.
FF.ord=function(k){var q=FF.queueOf();for(var i=0;i<q.length;i++)if(q[i].kind===k)return i+1;return 0}

FF.queued=function(k,size){
 var q=FF.queueOf();
 for(var i=0;i<q.length;i++)
  if(q[i].kind===k&&(size===undefined||q[i].size===size))return true;
 return false;
}





FF.repaint=function(){FF.GAME.value=FF.GAME.value+1}


// 시계. 진행 여부와 배속만 담는다. 게임 규칙과 무관하다.
// 이슈 #33: 배속은 하루가 실제로 몇 ms인지만 바꾸는 표시 설정이라 새 게임에도
// 그대로 이어간다(진행 여부만 reset 때 꺼진다) - 사운드/테마 설정과 같은 성격이다.
FF.CLOCK=FF._signal({running:false,speed:1});
FF.clockOf=function(){return FF.CLOCK.value}
FF.setClock=function(running){FF.CLOCK.value=Object.assign({},FF.CLOCK.value,{running:!!running})}
FF.setClockSpeed=function(speed){FF.CLOCK.value=Object.assign({},FF.CLOCK.value,{speed:speed})}


