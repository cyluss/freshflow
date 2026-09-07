// 경제 기준선 v2. 1000시드 A/B 검증으로 고정했다.
//   가격 75%   진입비용 완화
//   유지비 1.3 무조건 선매수 억제
//   sd 2.5     입고가 값어치 있는 판을 만든다
//   dd 3       판매가 값어치 있는 판을 만든다
FF.C={days:30,cash:60000,sm:[14,20,27],sd:2.5,dm:[10,20,32],dd:3,stay:0.8,
cap:{intake:20,storage:40,sales:21},ui:{nearCap:.8,storeMid:.5,storeFull:.8,dwellFast:1,dwellSlow:2.5,lowDays:2,armMs:6000,newArmMs:4000,recentWin:5,fcDays:3,eps:.05,matrixDays:7,dwellWin:7,logRows:6,nearTop:.9,zero:1e-9},chart:{w:340,h:96,pad:4,barH:22,gap:6},// 증설은 판매 한도만 산다. 상류는 초과분 매입 계약으로 대체했다.
step:{sales:1},cost:{sales:309},
// 초과분 매입 계약. 첫날에 크기를 고른다. 한도를 넘은 물량을 하루 최대 X t 더 받는다.
// 가격은 규모에 따라 완만하게 체감한다. 유지비 없음, 이후 변경 불가.
contract:{until:1,max:1,options:[
 {x:0,   price:0},
 {x:0.5, price:875},
 {x:1,   price:1625},
 {x:1.5, price:2250}
]},
maint:{intake:26,storage:8,sales:33},ttl:5,q:[1,1,1,1,.8],
// settle 은 판매 대금이 며칠 뒤 현금이 되는지다. 0 이면 당일이다.
// 판로 셋. 가격은 나이별이고 관계가 오르면 단가와 주문량과 최소 보장이 오른다.
channels:[
 {key:"online", cap:6,  settle:0,  quota:4, price:[955,895,545,0,0]},
 {key:"fran",   cap:6,  settle:14, quota:5, price:[905,905,875,760,0]},
 {key:"whole",  cap:14, settle:3,  quota:6, price:[880,873,865,845,820]}
],
// 관계 0~3 단계별 배수. 단가 · 주문량 · 최소 보장(쿼터 대비)
rel:{price:[0.64,1,1.30,1.60],cap:[0.6,1,1.4,1.8],floor:[0,0.5,1,1.5],
     up:4,start:1},
settlePlan:[],price:900,farm:380,hold:22,waste:45,fixed:1400,cover:1.5,
// 매입 정책. 며칠치를 목표로 들고 갈지 플레이 중 바꾼다.
policy:[{v:1,key:"lean"},{v:1.5,key:"mid"},{v:2,key:"full"}],alpha:.5,mid:4,noise:.35,tilt:0.5,tiltP:[0.25,0.5,0.25],autoMax:3,salvage:0.2};

FF.fInt=function(n){return String(Math.round(n))},mo=function(n){return Math.round(n).toLocaleString("ko-KR")};

// 계약 선택지를 찾는다. 없는 값이면 null 이다.
FF.contractOption=function(x,rules){
 var R=rules||FF.C, O=R.contract.options;
 for(var i=0;i<O.length;i++)if(O[i].x===x)return O[i];
 return null;
}
