# 완료 기준 대조

## 구조

| 기준 | 상태 | 근거 |
|---|---|---|
| 게임 규칙의 구현체 = transition 하나 | 충족 | 물리는 stepState, 하루 전이는 transition. 린트가 물리 상수를 커널 밖에서 금지 |
| 날짜 반복 구현체 = Runner 하나 | 부분 | runScenario 와 simulate 둘. simulate 는 다중 시나리오 동시 전진이라 유지 |
| 난수 생성 = World 계층 | 충족 | 세 실행 경로가 FF.World 만 사용 |
| 반사실 = Scenario 정의 | 충족 | addOne, removeOne, fullPlan |
| Signals = UI adapter | 충족 | toKernelState / applyKernelState |

## 동작

대표 시드 12개 x 계획 6개 x 종료시점 3개 = 216판에서 다음이 모두 일치한다.

| 항목 | 검사 |
|---|---|
| 최종 현금, 투입, 처분가치 | golden.mjs |
| 일별 생산/수요/집하/판매/재고/폐기/못판수요/손익/병목 | golden.mjs |
| 최종 용량, 구매 횟수, 종료일 | golden.mjs |
| 증설 적용일, 사건 일자 | golden.mjs |
| hindsight / missedOps / modContrib | golden.mjs |
| ffFinish | ui-test.mjs |

## 테스트

| 항목 | 결과 |
|---|---|
| 불변식 | 재고 음수, 용량 초과, 현금 흐름, 증설 없는 용량 변화, 구매비 금액 |
| 결정론 | 같은 시드와 같은 명령이면 같은 결과 |
| 실플레이 = replay | 임의 계획 40개 |
| 실플레이 = runScenario | 일별 궤적 문자 단위 일치 |
| 신규 = 기존 분석 | 세 분석이 참조 구현과 일치 |

## 성능

| 항목 | 임계 | 실측 |
|---|---|---|
| 플레이 중 replayPlan | 0회 | 0회 |
| 종료 최초 replayPlan | 5회 이하 | 참조 구현만 사용 |
| 접이식 토글 재계산 | 0회 | 0회 |
| 상태 불변 시 재계산 | 0회 | 0회 |
| 재렌더 1회 | 20ms 이하 | 약 4ms |

동일 난수열 공유 최적화는 simulate 에 유지된다.

## 구조 규칙 (린트가 강제)

- 계층 역전 금지
- 뷰의 게임 상태 직접 접근 금지
- 추출된 필드 재사용 금지
- 물리 상수는 커널 안에만
- 참조 구현 밖에서 replayPlan 금지
- 도메인에 화면 문구 금지
- 행동은 명령으로만 전달
- 커널 밖에서 용량 변경 금지
- 러너 밖에서 커널 호출 금지
- 분석이 직접 세계를 계산 금지
- 뷰가 엔진에서 쓰는 것은 startNew / advance / stepDay 셋뿐
