## Why

상단 홈·로컬 탭을 다시 누르면 현재 목록의 시작 위치로 돌아가도록 동작을 맞춘다. PROD-1162의 초기 새로고침 요청은 2026-10-22 사용자 결정에 따라 스크롤만 수행하는 동작으로 변경됐다.

## Goal

Web·iOS·Android에서 현재 선택된 상단 홈 또는 로컬 탭을 다시 활성화하면 데이터 재조회 없이 현재 타임라인 맨 위로 이동한다.

## What Changes

- 홈 탭에 재선택 시 맨 위로 이동하는 동작을 연결한다.
- 로컬 탭의 재선택 동작을 새로고침에서 맨 위 이동으로 바꾼다.
- 두 경우 모두 현재 탭과 route를 유지한다.

## Non-Goals

- 비활성 탭 전환의 진입·데이터 갱신 정책 변경.
- 하단 내비게이션·브랜드 마크 재선택, Native pull-to-refresh의 변경.
- 타임라인 후보·정렬·권한·GraphQL schema와 새로고침·페이지 읽기 로직의 개편.

## Constraints

- 상단 탭 재선택은 추가 navigation이나 타임라인 조회를 시작하지 않는다. 다른 경로의 새로고침 진행 중에도 스크롤만 수행한다.
- 기존 탭 선택·키보드·보조 기술 활성화와 선택 Profile별 데이터 분리를 유지한다.
- 이 change는 다음 구현 세션을 위한 수정 가능한 메모다. 구현·제품 테스트·배포는 이번 Spec 세션의 범위가 아니다.

## Verification

- 홈·로컬 각각 아래로 스크롤한 뒤 상단 현재 탭을 활성화해 목록 시작 위치와 추가 요청이 없는지 확인한다.
- 연속 입력, 다른 경로의 새로고침 진행 중 입력, 비활성 탭 전환을 구분해 검증한다.
- Web runtime과 iOS·Android runtime 증거를 구분하고, 기존 shell 재선택·pull-to-refresh·실패·재시도·페이지 읽기를 확인한다.

## Business Context

- Product canonical: `docs/domain/policies/post-list.md`의 Home·Local 후보와 제어 정책은 유지한다.
- Visual design source: `docs/design/local-timeline.md`, `docs/design/breakpoints.md`; 기존 탭 구조와 스크롤 대상을 참고한다.
- Linear: [PROD-1162](https://linear.app/byulmaru/issue/PROD-1162); 경계 이슈는 PROD-1079, PROD-610, PROD-1005다.
- User agreement: 2026-10-22 현재 Spec 대화의 “새로고침 말고 맨 위로 스크롤만 해”. 앞선 새로고침 요청과 선택을 대체한다.

## Session Status

- Status: Active
- Last updated: 2026-10-22
