# 코드에서 흐름 읽는 법

## 1. 계층 순서가 곧 흐름 순서

빌드가 파일을 이 순서로 잇는다. 위에서 아래로만 부른다.

```
core        상수 C, f1, mo
store       신호 저장소와 변경 함수
access      읽기 접근자, 커널 어댑터, 명령 정의
uistate     화면 신호
kernel      물리 stepState, 전이 transition, World, 전략
runner      runTracks, runScenario, replayPlan
record      recordDay, recordPurchase, 지표 계산
engine      reset, stepDay, finishRun, advance
counter     simulate, Scenario, 반사실 분석
report-data 표시용 데이터 준비
debug       window.ff 계열
─────────── FF 여기까지 · 아래는 FV
render      preact 바인딩
text        WORD 표, say, 문구 함수
ui-*        화면 조각 다섯 묶음
report      결과 카드와 접이식
clip        클립보드
view        컴포넌트와 App
boot        마운트
```

역참조는 린트가 막는다. 그래서 어떤 함수를 볼 때 그 아래 계층만 의심하면 된다.

## 2. 하루가 흐르는 경로

```
DockView 계속 운영 클릭
  └ FF.advance()                       engine
      └ FF.stepDay(FF.Cmd.wait())      engine
          ├ FF.recordPurchase()        record   구매 관측치
          ├ FF.recordDayStart()        record   한도 도달 여부
          ├ FF.toKernelState()         access   신호 → 커널 상태
          ├ FF.world().next()          kernel   생산과 수요
          ├ FF.transition(s,cmd,w)     kernel   하루 전이
          │   ├ 대기 증설 적용
          │   ├ 구매 처리
          │   ├ FF.stepState()         kernel   물리
          │   └ FF.bottleneck()        kernel   병목 판정
          ├ FF.applyKernelState()      access   커널 상태 → 신호
          ├ FF.recordDay(r, events)    record   hist, evlog, timeline
          ├ FF.advanceDay()            access   날짜와 국면
          └ FF.commit()                store    VERSION 증가
                └ 화면 재계산
```

## 3. 화면이 갱신되는 경로

```
FF.commit()  →  VERSION.value + 1
                    ↓
        접근자들이 VERSION 을 구독
        FF.status() FF.today() FF.capsOf() ...
                    ↓
        컴포넌트가 접근자를 호출
        FV.FlowView FV.DecisionView ...
                    ↓
                preact 재렌더
```

화면만 다시 그릴 때는 `FF.repaint()` 로 GAME 신호를 올린다. 데이터는 그대로다.

| 신호 | 올리는 것 | 읽는 것 |
|---|---|---|
| VERSION | commit. 데이터 변경 세 함수만 | 상태 접근자, memo |
| GAME | repaint. 버튼 조작 | 컴포넌트 |

## 4. 신호 열아홉

| 묶음 | 신호 | 언제 바뀌나 |
|---|---|---|
| 게임 상태 | RUN LEDGER PLANT HIST LOG MARKET LOTS ENGINE WORLD RECOVER | 하루마다 또는 사건마다 |
| 진행 상태 | EVENT PENDING AUTORUN PHASE | 사건과 증설과 종료 |
| 화면 상태 | GAME QUEUE_S OPENSIG SIG | 클릭 |
| 갱신 표시 | VERSION | commit |

## 5. 추적 도구

```
node trace.mjs LEDGER     신호를 쓰는 곳과 읽는 곳
node trace.mjs stepDay    함수가 만지는 신호와 부르는 것
node dep.mjs              신호 구독 관계 전체
node flow.mjs             무거운 계산 진입점과 commit 호출자
node lint.mjs             계층 규칙 열아홉 개
```

trace 출력 예다.

```
# LEDGER
선언: store
## 값을 바꾸는 곳
  store.resetLedger  store.addCash  store.spend  store.setSalvage
## 참조하는 곳
  store: ledger
  access: status, buysOf
  uistate: toggleBuy
```

## 6. 무엇을 고칠 때 어디를 보나

| 고칠 것 | 볼 파일 |
|---|---|
| 게임 규칙 | kernel 의 stepState 와 transition |
| 하루 흐름 | engine 의 stepDay |
| 기록 항목 | record |
| 반사실 계산 | counter |
| 화면에 나올 숫자 | report-data |
| 화면 문구 | text 의 WORD 표 |
| 화면 배치 | ui-* 또는 report 또는 view |
| 경제 파라미터 | core 의 FF.C |

## 7. 규칙이 강제하는 것

린트 열아홉 개 중 흐름과 직결된 것들이다.

```
커널은 전역 규칙을 읽지 않는다. 인자로 받는다
물리 상수는 stepState 안에만
날짜 반복은 runTracks 에만
로그 적재는 record 계열에만
기록은 넣은 뒤 고치지 않는다
분석은 simulate 를 통해서만 세계를 계산한다
뷰가 엔진에서 쓰는 것은 startNew advance stepDay 셋뿐
뷰는 저장소를 직접 만지지 않는다
도메인에 화면 문구를 두지 않는다
도메인은 FV 와 DOM 을 모른다
```

규칙을 어기면 빌드가 멈춘다. 그래서 흐름을 문서로 외울 필요가 없다.
