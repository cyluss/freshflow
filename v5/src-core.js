// 경제 기준선 v2. 1000시드 A/B 검증으로 고정했다.
//   가격 75%   진입비용 완화
//   유지비 1.3 무조건 선매수 억제
//   sd 2.5     입고가 값어치 있는 판을 만든다
//   dd 3       판매가 값어치 있는 판을 만든다
// 확정 도메인(Quantity/Money)은 실제 값의 2배를 내부 단위로 쓴다. 1 unit = 0.5(t 또는 원).
// 그래서 이 상수들은 실제 크기의 2배로 적혀 있다(예: intake:40은 실제 20t). 단가류(price/rel/stance
// 같은 비율·요율)는 Money와 Quantity가 같은 배수로 커지므로 그대로 둔다. sm/dm/sd/dd처럼 확률
// 분포를 나타내는 값도 실 단위 그대로 두고, 확정 수량으로 넘어오는 경계(입고 목표량 계산,
// 판로별 예상 수요, 생산·수요 난수 확정)에서만 2를 곱해 양자화한다.
FF.C={days:30,cash:120000,sm:[14,20,27],sd:2.5,dm:[10,20,32],dd:3,stay:0.8,
cap:{intake:40,storage:80,sales:42},ui:{nearCap:.8,storeMid:.5,storeFull:.8,dwellFast:1,dwellSlow:2.5,lowDays:2,armMs:6000,newArmMs:4000,recentWin:5,fcDays:3,eps:.05,matrixDays:7,dwellWin:7,logRows:6,nearTop:.9,zero:1e-9},chart:{w:340,h:96,pad:4,barH:22,gap:6},// 증설은 판매 한도만 산다. 상류는 초과분 매입 계약으로 대체했다.
step:{sales:2},cost:{sales:618},
// 초과분 매입 계약. 첫날에 크기를 고른다. 한도를 넘은 물량을 하루 최대 X(내부단위) 더 받는다.
// 가격은 규모에 따라 완만하게 체감한다. 유지비 없음, 이후 변경 불가.
contract:{until:1,max:1,options:[
 {x:0,   price:0},
 {x:1,   price:1750},
 {x:2,   price:3250},
 {x:3,   price:4500}
]},
maint:{intake:26,storage:8,sales:33},ttl:5,q:[1,1,1,1,.8],
// settle 은 판매 대금이 며칠 뒤 현금이 되는지다. 0 이면 당일이다.
// 판로 셋. 가격은 나이별이고 관계가 오르면 단가와 주문량과 최소 보장이 오른다.
channels:[
 {key:"online", cap:12, settle:0,  quota:8,  price:[955,895,545,0,0]},
 {key:"fran",   cap:12, settle:14, quota:10, price:[905,905,875,760,0]},
 {key:"whole",  cap:28, settle:3,  quota:12, price:[880,873,865,845,820]}
],
// 관계 0~3 단계별 배수. 단가 · 주문량 · 최소 보장(쿼터 대비)
// cap 은 0단계에서도 1단계와 같다. 회복 기준(quota)이 cap 에 못 미치면
// 아무리 몰아줘도 다시 못 오르는 영구 단절이 생기기 때문이다. 끊기면
// 단가와 보장만 나빠지고, 물량 자체는 항상 넣을 수 있어야 회복 경로가 산다.
rel:{price:[0.64,1,1.30,1.60],cap:[1,1,1.4,1.8],floor:[0,0.5,1,1.5],
     up:4,start:1},
// 판로 태도 0~3 단계: 양보 · 보통 · 우선 · 보장.
// weight 는 확보 뒤 남는 물량을 나눌 때 쓰는 비중이다. min 은 quota 배수로, 그만큼을 다른 판로보다 먼저 확보한다.
// 보장은 weight 를 올리지 않는다. 최소 확보만 약속하고 그 이상은 보통과 같다.
stance:{weight:[0.6,1,1.6,1],min:[0,0,0,1],start:1},
settlePlan:[],price:900,farm:380,hold:22,waste:45,fixed:2800,cover:1.5,
// 매입 정책. 며칠치를 목표로 들고 갈지 플레이 중 바꾼다.
policy:[{v:1,key:"lean"},{v:1.5,key:"mid"},{v:2,key:"full"}],alpha:.5,mid:4,noise:.35,tilt:0.5,tiltP:[0.25,0.5,0.25],autoMax:3,salvage:0.2};

FF.fInt=function(n){return String(Math.round(n))},mo=function(n){return Math.round(n).toLocaleString("ko-KR")};

// 계약 선택지를 찾는다. 없는 값이면 null 이다.
FF.contractOption=function(x,rules){
 var R=rules||FF.C, O=R.contract.options;
 for(var i=0;i<O.length;i++)if(O[i].x===x)return O[i];
 return null;
}

// 배분 규칙 하나: 보장 예약 -> 가중치 water-filling. 커널(실제 수요)과 미리보기(평균 수요)가 같은 함수를 쓴다.
// pool: 오늘 나눌 총량. demand: 판로별 오늘 수요 상한. levels: 판로별 태도 단계. quota: 판로별 보장 기준량.
// 반환: 판로별 최종 배정량(소수). 합은 min(pool, sum(demand)) 이하다.
FF.allocatePool=function(pool,demand,levels,quota,rules){
 var R=rules||FF.C, n=demand.length, target=demand.map(function(){return 0}), remain=demand.slice(), left=pool, i;
 // 1단계: 보장 확보. min 은 보장 단계에서만 0이 아니므로 다른 단계는 그냥 지나간다.
 for(i=0;i<n;i++){
  var want=quota[i]*R.stance.min[levels[i]];
  var need=Math.min(want,remain[i],left);
  target[i]+=need; remain[i]-=need; left-=need;
 }
 // 2단계: 남는 물량을 태도 비중으로. 자기 수요에 막힌 판로의 몫은 남은 판로에 다시 나눈다(water-filling).
 var w=levels.map(function(lv){return R.stance.weight[lv]});
 var headroom=remain.slice(), pending=left, guard=0;
 while(pending>R.ui.zero&&guard++<=n){
  var wsum=0; for(i=0;i<n;i++)if(headroom[i]>R.ui.zero)wsum+=w[i];
  if(wsum<=0)break;
  var given=0, anyCap=false;
  for(i=0;i<n;i++){
   if(headroom[i]<=R.ui.zero)continue;
   var ent=pending*w[i]/wsum;
   if(ent>=headroom[i]-R.ui.zero){
    target[i]+=headroom[i]; given+=headroom[i]; headroom[i]=0; anyCap=true;
   } else {
    target[i]+=ent; given+=ent; headroom[i]-=ent;
   }
  }
  pending-=given;
  if(!anyCap)break;
 }
 return target;
}

// allocatePool은 입력이 전부 정수여도 비례 배분(water-filling) 때문에 출력이 항상 소수다.
// 확정 배분(실제 판매·미리보기 모두)은 이 소수를 최대 나머지 방식으로 한 번 정수화해야
// 한다. 판로마다 따로 반올림하면 합이 target을 넘을 수 있어서(quantizePct와 같은 문제)
// 합을 target 이하로 고정한 뒤에만 반올림한다. 커널 실행과 미리보기가 이 함수 하나를 같이 쓴다.
FF.roundAllocation=function(shares,target){
 var n=shares.length, i;
 var rawSum=0; for(i=0;i<n;i++)rawSum+=shares[i];
 var floor=shares.map(function(v){return Math.floor(v+FF.C.ui.zero)});
 var flooredSum=0; for(i=0;i<n;i++)flooredSum+=floor[i];
 var want=Math.min(target,Math.round(rawSum));
 var order=shares.map(function(v,idx){return {i:idx,rem:v-floor[idx]}})
   .sort(function(a,b){return (b.rem-a.rem)||(a.i-b.i)});
 var give=Math.max(0,want-flooredSum);
 for(var k=0;k<give&&k<n;k++)floor[order[k].i]+=1;
 return floor;
}

// 가격×수량 변환 경계는 이 함수 하나뿐이다. effectivePrice는 나이·관계 배수가 곱해진 판매
// 단가라 정수가 아닐 수 있지만, quantity(확정 수량)와 곱한 결과인 Money는 여기서 한 번만
// 반올림해서 확정한다. 다른 곳에서 임의로 Math.round()하지 않는다.
FF.tradeAmount=function(effectivePrice,quantity){
 return Math.round(effectivePrice*quantity);
}
