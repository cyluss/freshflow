// 참조 재생. 첫날 계약 x t 를 맺고 그 뒤 판매를 ns 회 산다.
FF.replay=function(seed,x,ns){
 var pl={},dd=2,kk;
 if(x>0)pl[1]="contract:"+x;
 for(kk=0;kk<ns;kk++){pl[dd]="sales";dd+=2}
 return FF.replayPlan(seed,pl);
}

// 참조 구현 전용. 실사용 경로는 분석 계층의 시뮬레이터 하나다.
// 최적화된 쪽이 틀리면 단위 테스트가 이것과 대조해 잡는다.
FF.replayPlan=function(seed,plan,untilDay){
 var r=FF.runScenario(seed,plan,untilDay);
 return FF.finalValue(r.state,!untilDay);
}


// 초기 상태. 커널이 다루는 값만 담는다.
FF.runTracks=function(seed,base,forks,untilDay,rules){
 var R=rules||FF.C;
 var W=FF.World(seed,R), main=FF.initialState(W,R), days=[], live=[], out=[];
 var LIM=untilDay||R.days;
 var baseDecide=FF.asStrategy(base);
 var forkDecide=function(plan){
  return function(s){
   if(s.day in plan)return FF.planCmd(plan[s.day]);
   return baseDecide(s);
  };
 };
 var advance=function(s,w){
  var r=FF.transition(s,s.decide(s),w,R);
  if(s.cash<=0)s.dead=true;
  return r;
 };
 main.decide=baseDecide; main.dead=false;
 for(var t=0;t<LIM;t++){
  var day=t+1, w=W.next(), i;
  for(i=0;i<forks.length;i++){
   if((forks[i].at||1)!==day)continue;
   var c=(day===1)?FF.initialState(W,R):FF.forkState(main);
   c.si=main.si; c.di=main.di;
   c.idx=i; c.decide=forkDecide(forks[i].plan); c.dead=false;
   live.push(c);
  }
  var keep=0;
  for(i=0;i<live.length;i++)if(!live[i].dead)live[keep++]=live[i];
  live.length=keep;
  for(i=0;i<live.length;i++)advance(live[i],w);
  if(!main.dead){
   var res=advance(main,w);
   days.push({day:day,result:res.result,events:res.events});
  }
  if(main.dead&&!live.length)break;
 }
 for(i=0;i<live.length;i++)out[live[i].idx]=live[i];
 return {state:main,days:days,forks:out};
}

// 한 갈래만 돌린다. 러너의 특수한 경우다.
FF.runScenario=function(seed,strategy,untilDay,rules){
 var r=FF.runTracks(seed,strategy,[],untilDay,rules);
 return {state:r.state,days:r.days};
}

// 순수 전이. 원본을 두고 새 상태를 돌려준다.
// 성능이 필요한 곳은 transition 을 직접 쓴다.
