
// 사실(Fact) 투영 계층의 기반. 실행 모델(GameState/World/Policy/allocatePool/stepState/History)은
// 그대로 둔다. 여기서는 그 상태를 한 번 평평한 사실 목록으로 투영할 뿐이고, source of truth는
// 여전히 기존 커널 상태다. 소비자(화면/복기/반사실)는 이 사실 목록에서 자신에게 맞는 모양으로
// 다시 투영해서 쓴다. 계산 중복이 실제로 나타나는 지점만 나중에 공유 함수로 승격한다.
// 오늘(curr) 시점 투영은 stancePlan 등을 쓰므로 report-data.js에 있다. 여기는 그보다 앞 계층이라
// FF.histOf()/FF.C 만으로 낼 수 있는 것(뼈대, 복기용 지난 기록)만 둔다.

// 서로 독립인 다섯 축. 사실 하나는 이 축의 조합 하나를 가리킨다.
// time: 언제 시점의 값인가(오늘 화면은 "prev"/"curr", 복기는 실제 일차). phase: 확정인가 계획/전망인가.
// domain: 무엇에 대한 값인가. channel: 판로별 값이면 그 판로, 아니면 null. metric: domain 안에서 값의 이름.
FF.factAxes={
 time:["prev","curr"],
 phase:["result","state","plan","forecast"],
 domain:["inventory","capacity","supply","demand","allocation","relation","bottleneck","contract","finance"]
};

FF.fact=function(time,phase,domain,channel,metric,value){
 return {time:time,phase:phase,domain:domain,channel:channel,metric:metric,value:value};
}

// time.phase.domain.metric 을 하나의 키로 접는다. 같은 domain.metric도 시점이 다르면
// 다른 사실이다("relation.level"은 curr.state와 prev.result에 둘 다 있다). 시점까지 넣어야 안 섞인다.
FF._factKey=function(f){return f.time+"."+f.phase+"."+f.domain+"."+f.metric}

// 지난 하루하루의 결과. 여기서는 time이 "prev"/"curr"가 아니라 실제 일차(정수)다.
// 복기(review)는 이 사실들을 day 축으로 묶어 쓴다. 커널이 이미 기록해 둔 값만 옮긴다.
// sold/revenue는 반올림하지 않은 원값이다. 하루치를 보여줄지 여러 날을 더해서 보여줄지는
// 소비자가 정한다(먼저 반올림해서 쌓으면 날짜가 늘수록 오차가 쌓인다).
FF.historyFacts=function(){
 FF.observe();
 var h=FF.histOf(), out=[], prevRel=FF.C.channels.map(function(){return FF.C.rel.start});
 for(var d=0;d<h.length;d++){
  var row=h[d], day=row.day, relBefore=prevRel;
  out.push(FF.fact(day,"result","bottleneck",null,"cause",row.b));
  FF.C.channels.forEach(function(c,i){
   var relTo=row.rel?row.rel[i]:FF.C.rel.start, relFrom=relBefore[i];
   out.push(FF.fact(day,"result","allocation",c.key,"sold",row.toCh?row.toCh[i]:0));
   out.push(FF.fact(day,"result","finance",c.key,"revenue",row.revCh?row.revCh[i]:0));
   out.push(FF.fact(day,"result","relation",c.key,"level",relTo));
   out.push(FF.fact(day,"result","relation",c.key,"levelBefore",relFrom));
   out.push(FF.fact(day,"result","relation",c.key,"changed",relTo!==relFrom));
   out.push(FF.fact(day,"plan","allocation",c.key,"stance",row.stance?row.stance[i]:FF.C.stance.start));
  });
  prevRel=row.rel||prevRel;
 }
 return out;
}

// 일자 중심 투영. 복기가 쓰기 좋은 모양이다. 사실을 하루씩 다시 묶는다.
// 한 날짜 안에서는 domain.metric만으로 안 섞인다(그 날의 time은 이미 하나로 고정돼 있다).
FF.factsByDay=function(){
 var facts=FF.historyFacts(), byDay={}, days=[];
 facts.forEach(function(f){
  if(!byDay[f.time]){byDay[f.time]={day:f.time,cause:null,channels:{}}; days.push(f.time);}
  var row=byDay[f.time];
  if(!f.channel){ if(f.domain==="bottleneck"&&f.metric==="cause")row.cause=f.value; return; }
  if(!row.channels[f.channel])row.channels[f.channel]={key:f.channel};
  row.channels[f.channel][f.domain+"."+f.metric]=f.value;
 });
 days.sort(function(a,b){return a-b});
 return days.map(function(d){return byDay[d]});
}
