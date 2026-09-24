## Why

검색 결과 선택 후 Profile 조회·Follow로 이어지는 사람 단위 전환율이 필요하다. 2026-09-23 사용자는 대상별 journey 대신 person 단위 PostHog Funnel로 계산 단위를 변경했다. 이전 승인 기록은 PROD-557에 남긴다.

## Goal

유효한 `people` 검색 결과 선택 뒤 30분 안에 어느 유효 Profile이든 실제 표시되거나 Follow Relationship이 성립한 person의 비율을 PostHog Funnel에서 확인한다.

## Constraints

- 검색 제출·결과 로드·결과의 Follow 버튼만으로 Funnel 분모를 만들지 않는다.
- 조회 로딩·오류·대상 없음, Follow Request·실패를 성공에서 제외한다.
- 대상별 journey ID·대상 ID·검색어·handle을 새 custom 속성으로 보내지 않는다.
- canonical 계산 계약은 `docs/domain/policies/search-conversion-analytics.md`와 PROD-557에 둔다.

## Verification

유효 선택·실제 표시·Follow 성공과 실패 경계를 실행 테스트로 확인하고, PostHog Funnel에서 person·순차·30분·OR 조건을 검증한다. PR 최신 head의 CI 결과를 확인한다.

## Status

2026-09-23: 리뷰 대응 구현 중. 기존 대상별 journey 구현·HogQL fixture는 superseded.
