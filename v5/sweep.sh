#!/bin/sh
# 다시드 회귀. 규칙이나 문구를 바꿨을 때 돌린다.
# 파생값 불변조건은 sweep-invariants.sh(헤드리스)가 따로 본다. 같이 돌린다.
set -e
node ui-sweep.mjs
