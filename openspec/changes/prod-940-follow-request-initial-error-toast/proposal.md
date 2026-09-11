## Why

`/follow-requests`의 최초 조회 오류는 현재 중앙 `StateView`를 표시해, skeleton 위에서 같은 조회를 재시도하게 하는 승인된 Mobile Target과 다르다. PROD-940 범위에서 기존 Relay 재시도와 공용 Toast 계약을 재사용해 실제 route의 오류 수명주기를 정렬한다.

## What Changes

- 최초 목록 조회 실패 중에도 기존 loading skeleton을 유지한다.
- `팔로워 요청을 불러오지 못했어요` 문구와 `다시 시도` action을 가진 persistent Danger Toast에서 같은 query를 재시도한다.
- 재시도 성공·재실패, 연속 입력, route 이탈과 selected Profile 전환에서 Toast와 이전 actor 상태를 정리한다.
- 실제 route, Storybook screen과 최소 동작 테스트를 같은 계약에 맞춘다.
- 승인·거절 행 mutation, pagination, API·권한·Relay cache 계약은 변경하지 않는다.

## Authority / Provenance

- Canonical: `docs/design/figma.md`, `docs/design/storybook.md`
- Linear Contract: `PROD-940` (`PROD-566`의 기존 화면 계약을 좁게 수정)
- Linear Implementations: `PROD-940`

## Capabilities

### New Capabilities

없음.

### Modified Capabilities

- `profile-follow-request-management`: 최초 목록 조회 오류를 중앙 오류 상태에서 skeleton과 persistent retry Toast 수명주기로 변경한다.

## Impact

- `apps/app`의 `/follow-requests` route 오류 표시와 기존 `FollowRequestListState` 상태 계약
- 실제 production screen을 사용하는 Follow Requests Storybook catalog와 interaction 검증
- route 오류·retry·actor 정리를 직접 검증하는 최소 테스트
- `docs/design/figma.md`의 Current/Target 기록과 `profile-follow-request-management` OpenSpec 계약
- GraphQL document, API, schema, dependency와 pagination·row mutation 동작에는 영향이 없다.
