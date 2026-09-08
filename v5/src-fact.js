
// 사실(Fact) 투영 계층. 실행 모델(GameState/World/Policy/allocatePool/stepState/History)은
// 그대로 둔다. 여기서는 그 상태를 한 번 평평한 사실 목록으로 투영할 뿐이고, source of truth는
// 여전히 기존 커널 상태다. 소비자(화면/복기/반사실)는 이 사실 목록에서 자신에게 맞는 모양으로
// 다시 투영해서 쓴다. 계산 중복이 실제로 나타나는 지점만 나중에 공유 함수로 승격한다.

// 서로 독립인 다섯 축. 사실 하나는 이 축의 조합 하나를 가리킨다.
// time: 언제 시점의 값인가. phase: 확정인가 계획/전망인가. domain: 무엇에 대한 값인가.
// channel: 판로별 값이면 그 판로, 아니면 null. metric: domain 안에서 값의 이름.
FF.factAxes={
 time:["prev","curr"],
 phase:["result","state","plan","forecast"],
 domain:["inventory","capacity","supply","demand","allocation","relation","bottleneck","contract","finance"]
};

FF.fact=function(time,phase,domain,channel,metric,value){
 return {time:time,phase:phase,domain:domain,channel:channel,metric:metric,value:value};
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
  out.push(FF.fact("curr","state","finance",r.key,"price",r.price));
 });
}

// 오늘(curr) 계획/전망. 하루를 넘기기 전 미리보기다. 실제 값과 다를 수 있다.
FF._factsCurrPlan=function(out){
 var P=FF.stancePlan();
 out.push(FF.fact("curr","plan","inventory",null,"sellable",P.sellable));
 out.push(FF.fact("curr","plan","inventory",null,"unassigned",P.unassigned));
 out.push(FF.fact("curr","forecast","supply",null,"intake",P.exp));
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
  by[f.channel][f.domain+"."+f.metric]=f.value;
 });
 return FF.C.channels.map(function(c){return by[c.key]});
}
