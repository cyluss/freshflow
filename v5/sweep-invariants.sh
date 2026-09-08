#!/bin/sh
# 파생값 불변조건 상시 검증. 헤드리스, UI 없음. 규칙을 바꿨을 때 sweep.sh와 함께 돌린다.
set -e
node invariant-sweep.mjs
