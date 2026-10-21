## Goal

모바일 Web·iOS·Android Full Picker에서 기본 스크롤 표시기로 목록 위치를 확인한다.

## Source and Scope

2026-10-21 사용자의 PR #1223 리뷰 반영 지시와 [리뷰어 요청](https://github.com/byulmaru/kosmo/pull/1223#pullrequestreview-5595352097)을 따른다. [PROD-1163](https://linear.app/byulmaru/issue/PROD-1163)과 `docs/design/reactions.md`가 현재 범위를 기록한다. 이 작업 메모는 이전 커스텀 바·동일한 드래그 보장 계획을 대체한다.

## Non-goals

커스텀 표시·숨김·드래그, 전용 여백·측정, Desktop Web 변경과 PROD-1174·PROD-1175는 제외한다.

## Verification

기존 검색·선택·그리드·시트·가상화를 유지한다. 모바일 Web 검색 중 스크롤 초기화와 focus·선택 유지는 Storybook interaction으로 확인한다. OS·브라우저별 기본 표시·숨김·드래그 차이는 수용하며 세 플랫폼 동일 동작을 검증 조건으로 삼지 않는다. 현재 head의 CI 결과와 runtime 미검증 범위를 PR에 기록한다.
