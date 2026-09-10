// 오늘 새로 나타난 문제. 짧게 한 줄로 알린다.
FV.EVENT_TEXT={intake:"입고 한도 부족",procure:"조달 능력 부족",store:"창고 공간 부족",
 ship:"판매 한도 부족",stock:"팔 재고 부족"};
FV.WORD={
 channel:{online:"온라인",fran:"프랜차이즈",whole:"도매"},
 relword:{0:"끊김",1:"보통",2:"좋음",3:"최상"},
 stance:{0:"양보",1:"기본",2:"우선",3:"보장"},
 signal:{decline:"관계 하락",stuck:"관계 정체",recover:"관계 회복"},
 // 이슈 #28: 자동진행 WARNING 이름. #25가 확정한 4개 트리거 그대로다.
 warn:{stance:"관계 하락",intake:"Intake 부족 지속",sales:"판매 한도 부족 지속",procure:"조달 능력 부족 지속"},
 feasible:{ok:"회복 가능",hard:"현재 회복 곤란",low:"남은 기간상 실익 낮음"},
 policy:{lean:"적게",mid:"보통",full:"넉넉히"},
 verdictSupply:{high:"평년보다 많겠음",mostlyHigh:"평년보다 대체로 많겠음",
   similar:"평년과 비슷하겠음",mostlyLow:"평년보다 대체로 적겠음",low:"평년보다 적겠음"},
 verdictDemand:{high:"평년보다 높겠음",mostlyHigh:"평년보다 대체로 높겠음",
   similar:"평년과 비슷하겠음",mostlyLow:"평년보다 대체로 낮겠음",low:"평년보다 낮겠음"},
 level:{supply:["부족","평년","풍작"],demand:["침체","정상","호황"]},
 path:{event:"사건",manual:"직접"},
 cap:{at:"한도",near:"근접",free:"여유"},
 store:{full:"가득",mid:"보통",free:"여유"},
 supply:{low:"부족",mid:"평년",high:"풍작"},
 demand:{weak:"침체",mid:"정상",strong:"호황"},
 row:{supply:"생산",intake:"입고",storage:"창고",sales:"판매",demand:"수요",event:"사건",mod:"투자"},
 event:{intake:"입고",procure:"조달",store:"창고",ship:"판매",stock:"재고"},
 cause:{cap:"한도",procure:"조달 능력",store:"창고 부족",need:"필요 없음"},
 dir:{up:"증가",down:"하락",flat:"보합"}
};
FV.say=function(group,code){
 if(code===null||code===undefined)return "";
 var t=FV.WORD[group];
 return (t&&t[code])||code;
};
// 설비 이름. 화면 어디서나 같은 말을 쓴다.
FV.capName=function(k){return k==="contract"?"초과분 매입 계약":k==="procure"?"조달 능력":"판매 한도"}
// 지금 한도에서 사고 난 뒤 한도로.
FV.capShift=function(k){
 var c=FF.capsOf(), from=c[k];
 return from+" \u2192 "+(from+FF.C.step[k])+"t/일";
}
// 기록과 표에서 쓰는 짧은 이름.
FV.lblOf=function(k){return FV.capName(k)}

FV.p1=function(h){return h.len===0?"관측 없음":(h.last?"막혔다":"여유 있었다")}
FV.p2=function(h){return h.len<3?("관측 "+h.len+"일뿐"):(h.len+"일 중 "+h.n+"일 막힘")}
// 전망 기울기를 전망 화면과 같은 말로 옮긴다.
FV.trendWord=function(gap){
 return gap>=10?"늘어날 전망":(gap<=-10?"줄어들 전망":"큰 변화 없음");
}


FV.worldNote=function(){
 var slump=FF.cnt(1,0),boom=FF.cnt(1,2),poor=FF.cnt(0,0),good=FF.cnt(0,2),n=FF.histLen()||1;
 if(slump/n>=0.5)return "수요 침체가 "+slump+"일 이어져 추가 용량이 팔 자리를 찾기 어려웠다.";
 if(boom/n>=0.5)return "수요 호황이 "+boom+"일 이어져 판매 창구가 성과를 갈랐다.";
 if(poor/n>=0.5)return "생산 부족이 "+poor+"일 이어져 공급망에 들어올 물량 자체가 적었다.";
 if(good/n>=0.5)return "풍작이 "+good+"일 이어져 받아들일 물량은 많았다.";
 return "생산과 수요가 "+n+"일 동안 뚜렷한 한쪽으로 기울지 않았다.";
}

// 얼마나 놓쳤는지 숫자로 말한다. 구매 버튼과 같은 어휘를 쓴다.
FV.causeLine=function(d){
 var c=FF.causeFacts(d);
 if(!c)return "아직 관측이 없다";
 var f=function(n){return String(Math.round(n))};
 switch(c.b){
  case "intake": return "하루 입고 한도 "+c.capI+"t을 다 써 "+f(c.wIcap)+"t을 못 받았다";
  case "procure": return "조달 능력이 모자라 "+f(c.wIprocure)+"t을 못 받았다";
  case "store":  return "창고가 차서 "+f(c.wIstore+c.wS)+"t을 못 받았다";
  case "supply": return "농가 물량이 "+f(c.prod)+"t뿐이라 입고 한도가 남았다";
  case "ship":   return "하루 판매 한도 "+c.capS+"t을 다 써 "+f(c.missed)+"t을 못 팔았다";
  case "stock":  return "팔 재고가 없어 주문 "+f(c.missed)+"t을 놓쳤다";
  case "demand": return "주문이 "+f(c.dem)+"t뿐이라 판매 한도가 남았다";
  case "policy": return "지금 필요한 만큼만 받아 "+f(c.wIneed)+"t을 남겼다";
 }
 return "흐름이 안정적이다";
}


// 어제 무엇이 막았는가. 모델 용어가 아니라 관찰한 사실로 쓴다.
FV.BL={none:"막힌 곳이 없었다",
 intake:"입고 한도 부족",
 procure:"조달 능력 부족",
 store:"창고 공간 부족",
 supply:"농가 물량 부족",
 ship:"판매 한도 부족",
 stock:"팔 재고 부족",
 demand:"시장 수요 부족",
 policy:"필요한 만큼만 받았다"};




FV.optionText=function(o){
 return{
  past:o.window<3?("관측 "+o.window+"일"):(o.hits>0?(o.hits+"/"+o.window+"일"):(o.lastHit?"어제만":"없음")),
  usable:o.usable+"일",
  payback:o.payback===null?"—":(String(Math.round(o.payback))+"일")
 };
}

// 이슈 #32: 증설 버튼에 회수 판단 근거를 노출한다. 도메인 계층이 이미 계산해 두는
// payback(투자를 회수하는 데 걸리는 날)/usable(남은 기간)을 그대로 문구로 옮긴다 -
// #29 실측: 이 버튼이 게임의 74%에 등장하는데 판단 근거가 화면에 없었다.
FV.paybackNote=function(o){
 var T=FV.optionText(o);
 if(o.payback===null)return "회수 계산 불가 · 남은 "+T.usable;
 return "회수 "+T.payback+" · 남은 "+T.usable+(o.overRun?" · 남은 기간 내 회수 어려움":"");
}


