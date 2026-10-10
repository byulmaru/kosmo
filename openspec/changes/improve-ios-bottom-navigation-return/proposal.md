## Why

iOS 하단 내비게이션으로 화면을 오가면 이전 탐색 맥락이 사라지고, 현재 탭을 다시 눌러 시작 위치나 최신 글로
돌아가는 동작도 부족하다. PROD-1079과 2026-10-10 사용자 선택을 바탕으로 범위와 검증을 정리해 구현 세션에 전달한다.

## Goal

iOS에서 탭별 마지막 상세 계층과 root 상태를 보존하고, 탭 복귀·상세에서 재선택·root에서 재선택을 구분한다.

## What Changes

- 다른 탭에서 복귀하면 마지막 상세 화면까지 복원한다. 검색어·결과 유형·목록·스크롤과 Home/Local 선택을 유지한다.
- 현재 탭의 상세에서 같은 탭을 누르면 root로만 돌아간다.
- root의 홈 항목은 현재 Home/Local 목록의 최상단으로 이동하고 새로고침한다. 검색·알림·프로필은 최상단으로만 이동한다.
- 빠른 연속 입력, 작성기 열기·닫기, 헤더·OS back과 기존 오류·재시도 동작을 함께 검증한다.

## Non-Goals

앱 종료 뒤 상태 영속 저장, Android의 새 탭 UX, Web navigation 재설계, Home/Local 스와이프(PROD-1015),
RouteBoundary 오류 키 재사용 수정(PROD-1051), navigator나 dependency의 일괄 교체는 포함하지 않는다.

## Constraints

같은 Session·선택 Profile 안에서 탐색 상태를 보존한다. actor 전환 격리, 작성기 draft·게시 성공·back 계약과
Web·Android의 기존 동작을 유지한다. 특정 navigator는 필수 계약이 아니다. 이 change는 mutable session harness다.

## Verification

실제 navigation과 목록을 실행해 탭 왕복, 상세 복원·root 복귀, 스크롤·검색 상태, Home/Local 갱신과 실패·중복 입력을
관찰한다. iOS runtime에서 back·gesture·작성기를 확인하고 공용 경로의 Web·Android 회귀를 검증한다.
Spec 세션은 문서 윤문과 OpenSpec strict validation까지만 수행한다.

## Business Context

- Product canonical: `docs/domain/objects/notification.md`의 Read State를 보존한다. 새 domain 정책은 추가하지 않는다.
- Visual design source: `docs/design/breakpoints.md`, `docs/design/local-timeline.md`, `docs/design/page-header.md`, `docs/design/post-composer.md`.
- Linear: [PROD-1079](https://linear.app/byulmaru/issue/PROD-1079), [PROD-963](https://linear.app/byulmaru/issue/PROD-963), [PROD-1051](https://linear.app/byulmaru/issue/PROD-1051).
- User agreement: 2026-10-10 현재 대화의 두 선택 답변. Linear의 `확정한 복귀·재선택 동작`에 결과를 반영했다.

## Session Status

- Status: Active
- Last updated: 2026-10-10
